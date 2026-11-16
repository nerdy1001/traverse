// What /api/ask streams to the panel, one JSON object per line. The agent server's
// own stream is translated on the server, so the browser never sees its format,
// the credential, or the raw lookup results.

export type AskEvent =
  /** First, so a follow-up continues the same conversation. */
  | { type: "thread"; id: string }
  /** Sent the moment the model decides on a lookup, before it runs. */
  | { type: "step"; id: string; label: string; subject: string | null }
  | { type: "result"; id: string; ok: boolean; note: string }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AskRequest {
  analysisId: string;
  threadId: string | null;
  question: string;
  /** What's selected on the map, so "this file" means something. */
  selected: string | null;
}
