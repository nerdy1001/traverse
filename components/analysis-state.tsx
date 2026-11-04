import { isStage } from "@/pipeline/stages";

export function stateColour(status: string) {
  if (status === "complete") return "text-status-complete";
  if (status === "failed") return "text-status-failed";
  if (isStage(status)) return "text-status-running";
  return "text-muted";
}

// Takes its colour from the text beside it, and that text names the state, so
// this is hidden from screen readers. The running icon is static on purpose:
// nothing on screen moves unless it was clicked.
export function StateIcon({ status }: { status: string }) {
  let mark = <circle cx="6" cy="6" r="4.75" strokeDasharray="2 1.75" />;

  if (status === "complete") {
    mark = (
      <>
        <circle cx="6" cy="6" r="4.75" />
        <path d="M3.75 6.25 5.25 7.75 8.25 4.5" />
      </>
    );
  } else if (status === "failed") {
    mark = (
      <>
        <circle cx="6" cy="6" r="4.75" />
        <path d="M4.25 4.25 7.75 7.75M7.75 4.25 4.25 7.75" />
      </>
    );
  } else if (isStage(status)) {
    mark = (
      <>
        <circle cx="6" cy="6" r="4.75" />
        <path d="M6 1.25a4.75 4.75 0 0 1 0 9.5z" fill="currentColor" stroke="none" />
      </>
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3 shrink-0"
    >
      {mark}
    </svg>
  );
}
