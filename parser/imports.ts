import { ts } from "ts-morph";
import { enterScope, isRequireCall, NOTHING_BOUND } from "./commonjs.ts";
import type { ImportKind } from "./types.ts";

export interface ImportSite {
  kind: ImportKind;
  /** Undefined when a dynamic import's or require's argument isn't a literal string. */
  specifier: string | undefined;
  /** The source text of the import, kept so a failure can quote it. */
  text: string;
  line: number;
}

export function readImports(file: ts.SourceFile): ImportSite[] {
  const sites: ImportSite[] = [];
  const add = (kind: ImportKind, specifier: string | undefined, node: ts.Node) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    sites.push({ kind, specifier, text: node.getText(file), line: line + 1 });
  };

  const visit = (node: ts.Node, outer: ReadonlySet<string>) => {
    const bound = enterScope(node, outer);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      add("import", node.moduleSpecifier.text, node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add("re-export", node.moduleSpecifier.text, node.moduleSpecifier);
    } else if (
      // `typeof import("./x")` is a real reference to a real file written in
      // type position. Dropping it would lose the edge with nothing to show why.
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      add("import", node.argument.literal.text, node.argument.literal);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      add(
        "dynamic",
        argument && ts.isStringLiteralLike(argument) ? argument.text : undefined,
        argument ?? node,
      );
    } else if (isRequireCall(node, bound)) {
      const [argument] = node.arguments;
      add("require", ts.isStringLiteralLike(argument) ? argument.text : undefined, argument);
    }
    ts.forEachChild(node, (child) => visit(child, bound));
  };
  visit(file, NOTHING_BOUND);
  return sites;
}
