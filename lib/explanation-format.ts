// Reads an explanation into the three things the prompt permits: inline code, bold and
// bullets. Whatever else the model wrote anyway is reduced to plain text rather than
// printed as markup, so no backtick, asterisk or heading hash reaches the screen.

export type Span = { kind: "text" | "code" | "bold"; text: string };

export type Block = { kind: "paragraph"; spans: Span[] } | { kind: "list"; items: Span[][] };

const INLINE = /`([^`\n]+)`|\*\*([^\n]+?)\*\*/g;

/** Outside code, a marker left over is a mistake, never content. */
function plain(text: string): string {
  return text.replace(/[`*]/g, "");
}

function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) spans.push({ kind: "text", text: plain(text.slice(at, match.index)) });
    if (match[1] !== undefined) spans.push({ kind: "code", text: match[1] });
    else spans.push({ kind: "bold", text: plain(match[2]) });
    at = match.index + match[0].length;
  }
  if (at < text.length) spans.push({ kind: "text", text: plain(text.slice(at)) });
  return spans.filter(({ text: part }) => part.length > 0);
}

export function parseExplanation(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
    if (items.length > 0) blocks.push({ kind: "list", items: items.map(parseInline) });
    paragraph = [];
    items = [];
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim().replace(/^>\s?/, "");
    if (line === "" || /^```/.test(line) || /^([-*_])\1{2,}$/.test(line)) {
      flush();
      continue;
    }
    // A heading anyway: kept as a bold line of its own, never as hash marks.
    const heading = /^#{1,6}\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "paragraph", spans: [{ kind: "bold", text: plain(heading[1]) }] });
      continue;
    }
    const bullet = /^(?:[-*•+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      if (paragraph.length > 0) {
        blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
        paragraph = [];
      }
      items.push(bullet[1]);
      continue;
    }
    // A line under a bullet continues it; anywhere else it continues the paragraph.
    if (items.length > 0 && /^\s+/.test(raw)) items[items.length - 1] += ` ${line}`;
    else {
      if (items.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Splits text around every repository path in it, longest first so no path eats another. */
export function pathMatcher(paths: Iterable<string>): RegExp | null {
  const sorted = [...paths].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return null;
  const escaped = sorted.map((path) => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Not inside a longer path: nothing path-like on either side. A full stop is allowed
  // after one, since a sentence can end on a path.
  return new RegExp(`(?<![\\w./-])(?:${escaped.join("|")})(?![\\w/-]|\\.\\w)`, "g");
}
