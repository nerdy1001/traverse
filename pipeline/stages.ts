// Read by the browser as well as the run, so nothing here may import the parser
// or the database.

export const STAGES = ["fetching", "selecting", "parsing", "storing"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  fetching: "Fetching the archive",
  selecting: "Selecting files",
  parsing: "Parsing",
  storing: "Storing the map",
};

// Nothing can stop a dead process's row saying "parsing" forever, so past this a run
// reads as abandoned and may be started again. Generous because downloading alone is
// allowed five minutes, and restarting a run that's still alive would double it up.
const ABANDONED_AFTER_MS = 10 * 60 * 1000;

export function isStage(status: string): status is Stage {
  return STAGES.some((stage) => stage === status);
}

export function isFinished(status: string): boolean {
  return status === "complete" || status === "failed";
}

export function abandonedBefore(now: number): string {
  return new Date(now - ABANDONED_AFTER_MS).toISOString();
}

export function isAbandoned(status: string, startedAt: string, now: number): boolean {
  return !isFinished(status) && new Date(startedAt).getTime() < now - ABANDONED_AFTER_MS;
}
