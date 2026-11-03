import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const STAGES = ["fetching", "selecting", "parsing", "storing"];

const CELL = "border-b border-border py-1.5 pr-4 align-top";
const HEADING = "sticky top-0 border-b border-border bg-background py-1 pr-4 font-normal text-muted";

// Everything here comes off the session token. Nothing asks Clerk at runtime.
async function CurrentOrganization() {
  const { orgId, sessionClaims } = await auth.protect();

  return (
    <div className="flex h-8 items-center gap-2 border-b border-border px-3">
      {sessionClaims.org_name && <h1 className="font-medium">{sessionClaims.org_name}</h1>}
      <span className="truncate font-mono text-muted">{orgId}</span>
    </div>
  );
}

// UTC, so the server's own timezone can't change what's rendered.
function formatExact(timestamp: string) {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en");

// Rounds down, so a run is never described as older than it is.
function formatAgo(timestamp: string, now: number) {
  const minutes = Math.floor((now - new Date(timestamp).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return RELATIVE_TIME.format(-minutes, "minute");

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return RELATIVE_TIME.format(-hours, "hour");

  const days = Math.floor(hours / 24);
  if (days < 30) return RELATIVE_TIME.format(-days, "day");
  if (days < 365) return RELATIVE_TIME.format(-Math.floor(days / 30), "month");
  return RELATIVE_TIME.format(-Math.floor(days / 365), "year");
}

function stateColour(status: string) {
  if (status === "complete") return "text-status-complete";
  if (status === "failed") return "text-status-failed";
  if (STAGES.includes(status)) return "text-status-running";
  return "text-muted";
}

// Takes its colour from the text beside it, and that text names the state, so
// this is hidden from screen readers. The running icon is static on purpose:
// nothing on screen moves unless it was clicked.
function StateIcon({ status }: { status: string }) {
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
  } else if (STAGES.includes(status)) {
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

async function readAnalyses() {
  // No organization filter, on purpose. The token decides which rows come back,
  // so if another organization's row ever appears here, the bug is the policy.
  const { data, error } = await createServerSupabaseClient()
    .from("analyses")
    .select("id, status, commit_sha, error_message, created_at, projects(owner, name)")
    .order("created_at", { ascending: false })
    .limit(100);

  // An unreadable list must not look like an empty one.
  if (error) throw new Error(`Could not read analyses: ${error.message}`);

  // Taken with the rows so every age is measured from the same moment. Ages don't
  // tick: they're correct as of the last page load.
  return { analyses: data, readAt: Date.now() };
}

async function AnalysisList() {
  const { orgId } = await auth.protect();

  // Without an active organization the policy returns nothing, which would read
  // as a team that has never run an analysis. That isn't what's true here.
  if (!orgId) {
    return <p className="px-3 py-2 text-muted">No organization selected. Choose one from the switcher above.</p>;
  }

  const { analyses, readAt } = await readAnalyses();

  if (analyses.length === 0) {
    return <p className="px-3 py-2 text-muted">This organization hasn&apos;t analysed a repository yet.</p>;
  }

  return (
    <table className="w-full border-separate border-spacing-0 text-left">
      <thead>
        <tr>
          <th className={`${HEADING} pl-3`}>Repository</th>
          <th className={HEADING}>State</th>
          <th className={`${HEADING} max-sm:hidden`}>Commit</th>
          <th className={`${HEADING} max-sm:hidden`}>Started</th>
        </tr>
      </thead>
      <tbody>
        {analyses.map((analysis) => (
          <tr key={analysis.id} className="hover:bg-surface">
            <td className={`${CELL} pl-3 font-mono break-all`}>
              <span className="text-muted">{analysis.projects.owner}/</span>
              {analysis.projects.name}
            </td>
            <td className={CELL}>
              <div className={`flex items-center gap-1.5 ${stateColour(analysis.status)}`}>
                <StateIcon status={analysis.status} />
                <span className="capitalize">{analysis.status}</span>
              </div>
              {analysis.error_message && (
                <p className="mt-0.5 max-w-[60ch] text-muted">{analysis.error_message}</p>
              )}
            </td>
            <td className={`${CELL} font-mono whitespace-nowrap text-muted max-sm:hidden`}>
              {analysis.commit_sha?.slice(0, 7) ?? "None"}
            </td>
            <td className={`${CELL} whitespace-nowrap text-muted tabular-nums max-sm:hidden`}>
              <time dateTime={analysis.created_at} title={formatExact(analysis.created_at)}>
                {formatAgo(analysis.created_at, readAt)}
              </time>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <CurrentOrganization />
      <AnalysisList />
    </Suspense>
  );
}
