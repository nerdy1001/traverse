"use client";

import { type ReactNode, useMemo } from "react";
import { parseExplanation, pathMatcher, type Span } from "@/lib/explanation-format";

function withPathLinks(text: string, matcher: RegExp | null, onPath: (path: string) => void, mono: boolean): ReactNode[] {
  if (!matcher) return [text];
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(matcher)) {
    if (match.index > at) parts.push(text.slice(at, match.index));
    const path = match[0];
    parts.push(
      <button
        key={`${match.index}:${path}`}
        type="button"
        title={path}
        onClick={() => onPath(path)}
        className={`cursor-pointer text-accent hover:underline ${mono ? "" : "font-mono"}`}
      >
        {path}
      </button>,
    );
    at = match.index + path.length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

function Spans({ spans, matcher, onPath }: { spans: Span[]; matcher: RegExp | null; onPath: (path: string) => void }) {
  return spans.map((span, index) => {
    if (span.kind === "code") {
      return (
        <code key={index} className="rounded-sm bg-background px-0.5 font-mono">
          {withPathLinks(span.text, matcher, onPath, true)}
        </code>
      );
    }
    const linked = withPathLinks(span.text, matcher, onPath, false);
    return span.kind === "bold" ? (
      <strong key={index} className="font-medium">
        {linked}
      </strong>
    ) : (
      <span key={index}>{linked}</span>
    );
  });
}

/** Every repository path in the prose is a link that moves the map to that file. */
export function ExplanationText({
  body,
  paths,
  onPath,
}: {
  body: string;
  paths: readonly string[];
  onPath: (path: string) => void;
}) {
  const blocks = useMemo(() => parseExplanation(body), [body]);
  const matcher = useMemo(() => pathMatcher(paths), [paths]);
  return (
    <div className="space-y-2 px-4 leading-relaxed">
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index}>
            <Spans spans={block.spans} matcher={matcher} onPath={onPath} />
          </p>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-4">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Spans spans={item} matcher={matcher} onPath={onPath} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
