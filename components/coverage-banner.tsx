"use client";

import { useState } from "react";
import { graphCoverage, SKIP_LABELS, UNRESOLVED_LABELS } from "@/lib/map/coverage";
import type { Coverage } from "@/parser/types";

function summary({ percent, imports, files }: ReturnType<typeof graphCoverage>): string {
  if (percent === null) return `No imports between files were found across ${files.parsed} parsed files, so this map shows no connections.`;
  const notDrawn = imports.total - imports.drawn;
  const notParsed = files.total - files.parsed;
  const parts = [
    notDrawn > 0 && `${notDrawn} of ${imports.total} imports aren't drawn`,
    notParsed > 0 && `${notParsed} of ${files.total} source files weren't parsed`,
  ].filter(Boolean);
  return `This graph is partial: ${percent}% coverage. ${parts.join(", ")}.`;
}

// Rendered only when the graph is partial, and it can only collapse as far as the line
// naming the figure, so a partial graph can't be made to look complete.
export function CoverageBanner({ coverage }: { coverage: Coverage }) {
  const [open, setOpen] = useState(false);
  const figures = graphCoverage(coverage);
  if (figures.percent === 100) return null;

  const unresolved = UNRESOLVED_LABELS.filter(([reason]) => coverage.imports.unresolvedBy[reason] > 0);
  const skipped = SKIP_LABELS.filter(([reason]) => coverage.files.skippedBy[reason] > 0);
  const excluded = coverage.imports.excludedBy["skipped-target"] + coverage.imports.excludedBy["excluded-directory-target"];

  return (
    <section aria-label="Coverage" className="shrink-0 border-b border-border">
      <div className="flex items-center gap-2 px-5 py-1.5">
        <p className="min-w-0 flex-1 font-medium">{summary(figures)}</p>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="shrink-0 cursor-pointer text-muted hover:text-foreground"
        >
          {open ? "Hide details" : "Show details"}
        </button>
      </div>

      {open && (
        <div className="max-h-56 space-y-2 overflow-y-auto border-t border-border px-5 py-2">
          {unresolved.map(([reason, label]) => (
            <div key={reason}>
              <h3>
                {label}: {coverage.imports.unresolvedBy[reason]}
              </h3>
              <ul className="font-mono text-muted">
                {coverage.unresolvedExamples[reason].slice(0, 5).map((example) => (
                  <li key={`${example.from}:${example.line}:${example.specifier}`} className="break-all">
                    {example.from}:{example.line} {example.specifier}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {excluded > 0 && <p>Imports of files that aren&apos;t on the map: {excluded}</p>}
          {skipped.map(([reason, label]) => (
            <div key={reason}>
              <h3>
                {label}: {coverage.files.skippedBy[reason]}
              </h3>
              <ul className="font-mono text-muted">
                {coverage.skippedFiles
                  .filter((file) => file.reason === reason)
                  .slice(0, 5)
                  .map((file) => (
                    <li key={file.path} className="break-all">
                      {file.path}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {coverage.configProblems.length > 0 && (
            <div>
              <h3>Config problems: {coverage.configProblems.length}</h3>
              <ul className="font-mono text-muted">
                {coverage.configProblems.map(({ path, message }) => (
                  <li key={path} className="break-all">
                    {path} {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
