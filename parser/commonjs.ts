import { ts } from "ts-morph";

// `require`, `module` and `exports` are only CommonJS's when nothing in scope rebinds
// them. Bundles and UMD wrappers pass in their own, and treating those as the real ones
// would draw edges the code doesn't have.
const COMMONJS_NAMES = new Set(["require", "module", "exports"]);

export const NOTHING_BOUND: ReadonlySet<string> = new Set();

function isAmbient(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.DeclareKeyword) ?? false)
  );
}

/** `const require = createRequire(import.meta.url)` is the real thing under its usual name. */
function isCreateRequire(initializer: ts.Expression | undefined): boolean {
  if (!initializer || !ts.isCallExpression(initializer)) return false;
  const callee = initializer.expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
  return ts.isIdentifier(name) && name.text === "createRequire";
}

/**
 * Which of the three names this function or file binds. `var` and block scoping aren't
 * told apart, so a binding counts for its whole function: at worst that loses a real
 * edge, which is reported nowhere but can't draw a false one. Stopping at nested
 * functions means each node is scanned once, however deep the nesting.
 */
function namesBoundBy(scope: ts.Node): string[] {
  const names: string[] = [];
  const note = (name: ts.Node | undefined) => {
    if (name && ts.isIdentifier(name) && COMMONJS_NAMES.has(name.text)) names.push(name.text);
  };
  const scan = (node: ts.Node) => {
    // `declare const require: any` tells the compiler about the real one.
    if (isAmbient(node)) return;
    if (ts.isVariableDeclaration(node)) {
      if (!isCreateRequire(node.initializer)) note(node.name);
    } else if (
      ts.isParameter(node) ||
      ts.isBindingElement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isImportClause(node) ||
      ts.isImportSpecifier(node) ||
      ts.isNamespaceImport(node) ||
      ts.isImportEqualsDeclaration(node)
    ) {
      note(node.name);
    }
    if (!ts.isFunctionLike(node)) ts.forEachChild(node, scan);
  };
  if (ts.isFunctionExpression(scope)) note(scope.name);
  ts.forEachChild(scope, scan);
  return names;
}

/** What's bound inside `node`, given what's bound around it. */
export function enterScope(node: ts.Node, bound: ReadonlySet<string>): ReadonlySet<string> {
  if (!ts.isSourceFile(node) && !ts.isFunctionLike(node)) return bound;
  const names = namesBoundBy(node);
  return names.length === 0 ? bound : new Set([...bound, ...names]);
}

/**
 * CommonJS's require takes exactly one argument. `require(["./a"], callback)` is AMD,
 * a different module system, so it isn't collected at all rather than counted as a
 * require that couldn't be read.
 */
export function isRequireCall(node: ts.Node, bound: ReadonlySet<string>): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    !bound.has("require") &&
    node.arguments.length === 1 &&
    !ts.isArrayLiteralExpression(node.arguments[0])
  );
}

function isModuleExports(node: ts.Node, bound: ReadonlySet<string>): boolean {
  if (bound.has("module")) return false;
  if (ts.isPropertyAccessExpression(node)) {
    return ts.isIdentifier(node.expression) && node.expression.text === "module" && node.name.text === "exports";
  }
  return (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "module" &&
    ts.isStringLiteralLike(node.argumentExpression) &&
    node.argumentExpression.text === "exports"
  );
}

function isExportsObject(node: ts.Node, bound: ReadonlySet<string>): boolean {
  return (ts.isIdentifier(node) && node.text === "exports" && !bound.has("exports")) || isModuleExports(node, bound);
}

/** The value actually assigned, through `a = b = value` and type assertions. */
function assignedValue(node: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return assignedValue(node.expression);
  }
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ? assignedValue(node.right)
    : node;
}

/**
 * The names a CommonJS module exports, as far as the syntax states them. `complete` is
 * false when it exports something whose names can't be read, such as
 * `module.exports = createApp`. Undefined when the file exports nothing this way.
 */
export function readCommonJsExports(file: ts.SourceFile): { names: string[]; complete: boolean } | undefined {
  const names = new Set<string>();
  let found = false;
  let complete = true;
  let wholeAssignments = 0;

  const addName = (name: string) => {
    found = true;
    // A marker the compiler writes, not something the module offers.
    if (name !== "__esModule") names.add(name);
  };
  const addUnknown = () => {
    found = true;
    complete = false;
  };
  const addValue = (value: ts.Expression) => {
    const object = assignedValue(value);
    if (!ts.isObjectLiteralExpression(object)) return addUnknown();
    found = true;
    for (const property of object.properties) {
      const name = property.name;
      if (name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name))) addName(name.text);
      else addUnknown();
    }
  };

  const visit = (node: ts.Node, outer: ReadonlySet<string>) => {
    const bound = enterScope(node, outer);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const { left, right } = node;
      if (isModuleExports(left, bound)) {
        wholeAssignments += 1;
        addValue(right);
      } else if (ts.isPropertyAccessExpression(left) && isExportsObject(left.expression, bound)) {
        addName(left.name.text);
      } else if (ts.isElementAccessExpression(left) && isExportsObject(left.expression, bound)) {
        if (ts.isStringLiteralLike(left.argumentExpression)) addName(left.argumentExpression.text);
        else addUnknown();
      }
      // A bare `exports = x` only rebinds a local, so it exports nothing.
    } else if (ts.isCallExpression(node)) {
      const [target, ...rest] = node.arguments;
      const callee = node.expression;
      const objectMethod =
        ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "Object"
          ? callee.name.text
          : undefined;
      if (objectMethod === "defineProperty" && target && isExportsObject(target, bound)) {
        if (rest[0] && ts.isStringLiteralLike(rest[0])) addName(rest[0].text);
        else addUnknown();
      } else if (objectMethod === "assign" && target && isExportsObject(target, bound)) {
        rest.forEach(addValue);
      } else if (node.arguments.some((argument) => isExportsObject(argument, bound))) {
        // Handed to something else, like `__exportStar(require("./x"), exports)`.
        addUnknown();
      }
    }
    ts.forEachChild(node, (child) => visit(child, bound));
  };
  visit(file, NOTHING_BOUND);

  if (!found) return undefined;
  // Conditional assignments: only one of them holds at runtime, and which isn't in the syntax.
  if (wholeAssignments > 1) complete = false;
  return { names: [...names].sort(), complete };
}
