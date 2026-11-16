// The invented-path check. Deterministic on purpose: whether a path was shown to the model
// is set membership, so it has an exact answer, and a detector that guesses is worth nothing.
// Imports nothing that calls a model, so the app runs it live and the evals run it offline.

import { pathMatcher } from "../lib/explanation-format.ts";

/** The feedback key, live and in experiments alike, so the two read as one metric. */
export const INVENTED_PATHS = "invented_paths";

export interface PathCheck {
  /** Distinct paths the explanation named, shown or not. */
  named: string[];
  /** The ones nothing shown to the model accounts for. */
  invented: string[];
}

// Only the extensions the parser reads: a file it could have handed over. A `res.json`
// or a `globals.css` isn't a node anyone could connect to, so it isn't checked by name.
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
// Prose about a framework, not a file. A closed list, so `Dashboard.js` is still checked,
// and only the capitalised form, so a lowercase `next.js` written as a filename is too.
const PRODUCT_NAME = /^(?:Next|Node|Express|Nest|React|Vue|Nuxt|Ember|Backbone|Three|D3|Chart)\.js$/;
// Anything a path can't be made of ends a candidate, so `lib/a.ts—which` or `"./a.ts"`
// still yields the path. Brackets and parens stay in: Next's `[id]` and `(group)` segments.
const NOT_PATH_CHARACTER = /[^\w.\-/@~[\]()+$]+/;

function withoutExtension(path: string): string {
  return path.replace(SOURCE_EXTENSION, "");
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function balanced(token: string, open: string, close: string): boolean {
  return token.split(open).length === token.split(close).length;
}

/** Wrapping punctuation off, keeping a bracket or paren that belongs to a segment. */
function trim(raw: string): string {
  let token = raw.replace(/^[("'<[{]+/, "");
  for (;;) {
    const before = token;
    token = token.replace(/[.,;:!?"'>}]+$/, "");
    if (token.endsWith(")") && !balanced(token, "(", ")")) token = token.slice(0, -1);
    if (token.endsWith("]") && !balanced(token, "[", "]")) token = token.slice(0, -1);
    if (token === before) break;
  }
  // `lib/env.ts:12` names lib/env.ts; `lib/` names lib.
  return token.replace(/:\d+(?::\d+)?$/, "").replace(/\/+$/, "");
}

/**
 * Every path-shaped token in an explanation, tested against exactly the paths the model
 * was shown. `shown` is what the question listed; `source` is the file's text when the
 * model was given it, since quoting an import specifier from it isn't inventing one.
 *
 * Accounted for: a shown path, a folder some shown path sits in, a shown file named
 * without its extension, or by its bare file name, or anything appearing verbatim in the
 * source. Everything else path-shaped was invented.
 */
export function findInventedPaths(body: string, shown: readonly string[], source?: string): PathCheck {
  const files = shown.filter((path) => path !== ".");
  const exact = new Set(files);
  const folders = new Set<string>();
  for (const path of files) {
    const segments = path.split("/");
    for (let end = 1; end < segments.length; end += 1) folders.add(segments.slice(0, end).join("/"));
  }
  const stems = new Set(files.map(withoutExtension));
  const names = new Set(files.flatMap((path) => [basename(path), withoutExtension(basename(path))]));
  const topSegments = new Set(files.map((path) => path.split("/")[0]));

  const named = new Set<string>();
  // Shown paths first, longest first and by the same matcher that links them on screen,
  // so `app/(workspace)/actions.ts` is read whole rather than split at its parentheses.
  const matcher = pathMatcher(files);
  const rest = matcher
    ? body.replace(matcher, (path) => {
        named.add(path);
        return " ";
      })
    : body;

  const accountedFor = (token: string): boolean => {
    if (exact.has(token) || folders.has(token) || stems.has(token)) return true;
    if (!token.includes("/") && names.has(token)) return true;
    if (source !== undefined && pathMatcher([token])?.test(source)) return true;
    // An alias like `@/lib/env` can map to the root or to a folder; any shown path ending
    // in the rest of it is the file it names.
    const aliased = /^[@~]\/(.+)$/.exec(token)?.[1];
    if (aliased) return [...exact, ...stems].some((path) => path === aliased || path.endsWith(`/${aliased}`));
    return false;
  };

  const invented = new Set<string>();
  for (const raw of rest.split(NOT_PATH_CHARACTER)) {
    const token = trim(raw);
    if (token === "") continue;
    // A call, not a file: `res.json()` or `require(...)`.
    if (/\w\(/.test(token)) continue;
    // A package, not a file in this repository.
    if (/^@[A-Za-z0-9]/.test(token)) continue;
    if (PRODUCT_NAME.test(token)) continue;

    const segments = token.split("/");
    const pathShaped =
      SOURCE_EXTENSION.test(token) ||
      (token.includes("/") &&
        (/^(?:\.{1,2}|[@~])\//.test(token) || topSegments.has(segments[0])) &&
        segments.some((segment) => segment !== "" && segment !== "." && segment !== ".."));
    if (!pathShaped) continue;

    named.add(token);
    if (!accountedFor(token)) invented.add(token);
  }

  return { named: [...named].sort(), invented: [...invented].sort() };
}

/** One explanation, one score: 1 when nothing was invented, 0 when anything was. */
export function pathFeedback({ named, invented }: PathCheck, shownCount: number): { score: number; comment: string } {
  if (invented.length === 0) return { score: 1, comment: `Named ${named.length} paths, all among the ${shownCount} shown.` };
  return {
    score: 0,
    comment: `Not among the ${shownCount} paths shown: ${invented.join(", ")}`,
  };
}
