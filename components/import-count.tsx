export type ImportDirection = "incoming" | "outgoing";

/** What's being counted from: one file, a folder's boundary, or a walk of two levels. */
type Subject = "file" | "folder" | "walk";

const COLOUR: Record<ImportDirection, string> = {
  incoming: "text-incoming",
  outgoing: "text-outgoing",
};

const WORDS: Record<ImportDirection, string> = {
  incoming: "imported by",
  outgoing: "imports",
};

function titleOf(direction: ImportDirection, subject: Subject, count: number): string {
  const files = count === 1 ? "1 file" : `${count} files`;
  if (subject === "walk") return direction === "incoming" ? `${files} lead to this one` : `This one leads to ${files}`;
  if (subject === "folder") {
    return direction === "incoming" ? `Imported by ${files} outside this folder` : `Imports ${files} outside this folder`;
  }
  return direction === "incoming" ? `Imported by ${files}` : `Imports ${files}`;
}

// Drawn the way the map draws it: lines arrive at a box's left and leave from its
// right, so the arrow runs into the bar for imports in and out of it for imports out.
function ImportIcon({ direction }: { direction: ImportDirection }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-2.5 shrink-0"
    >
      {direction === "incoming" ? (
        <path d="M8.5 1.5v7M1 5h5M4 2.75 6.25 5 4 7.25" />
      ) : (
        <path d="M1.5 1.5v7M4 5h5M6.75 2.75 9 5 6.75 7.25" />
      )}
    </svg>
  );
}

/** The one way an import count is written, so its direction reads the same everywhere. */
export function ImportCount({
  direction,
  count,
  subject = "file",
  className = "",
}: {
  direction: ImportDirection;
  count: number;
  subject?: Subject;
  className?: string;
}) {
  return (
    <span
      title={titleOf(direction, subject, count)}
      className={`inline-flex items-center justify-end gap-0.5 tabular-nums ${COLOUR[direction]} ${className}`}
    >
      <ImportIcon direction={direction} />
      <span className="sr-only">{WORDS[direction]}</span>
      {count}
    </span>
  );
}
