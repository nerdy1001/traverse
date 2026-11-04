import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Suspense } from "react";
import { LiveAnalysisState } from "@/components/live-analysis-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAbandoned } from "@/pipeline/stages";
import { AnalyseForm } from "../analyse-form";

const CELL = "border-b border-border py-3 pr-6 align-top";
const HEADING = "sticky top-0 border-b border-border bg-background py-2 pr-6 font-normal text-muted";

// Everything here comes off the session token. Nothing asks Clerk at runtime.
async function CurrentOrganization() {
  const { orgId, sessionClaims } = await auth.protect();

  return (
    <>
      <div className="flex h-11 items-center gap-2 border-b border-border px-5">
        {sessionClaims.org_name && <h1 className="font-medium">{sessionClaims.org_name}</h1>}
        <span className="truncate font-mono text-muted">{orgId}</span>
      </div>
      {orgId && <AnalyseForm />}
    </>
  );
}

// UTC, so the server's own timezone can't change what's rendered.
function formatExact(timestamp: string) {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en");

// Rounds towards zero, so a run is never described as further from now than it is.
// That also keeps a few seconds of clock difference between this server and the
// database reading "just now" rather than "in 1 minute". Members can write
// created_at, so a timestamp further ahead than that is possible, and says so.
function formatRelative(timestamp: string, now: number) {
  const elapsed = now - new Date(timestamp).getTime();
  const direction = elapsed < 0 ? 1 : -1;

  const minutes = Math.floor(Math.abs(elapsed) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return RELATIVE_TIME.format(direction * minutes, "minute");

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return RELATIVE_TIME.format(direction * hours, "hour");

  const days = Math.floor(hours / 24);
  if (days < 30) return RELATIVE_TIME.format(direction * days, "day");
  if (days < 365) return RELATIVE_TIME.format(direction * Math.floor(days / 30), "month");
  return RELATIVE_TIME.format(direction * Math.floor(days / 365), "year");
}

async function readAnalyses() {
  // No organization filter, on purpose. The token decides which rows come back,
  // so if another organization's row ever appears here, the bug is the policy.
  const { data, error } = await createServerSupabaseClient()
    .from("analyses")
    .select("id, status, stage_message, commit_sha, error_message, started_at, completed_at, projects(owner, name)")
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
    return <p className="px-5 py-3 text-muted">No organization selected. Choose one from the switcher above.</p>;
  }

  const { analyses, readAt } = await readAnalyses();

  if (analyses.length === 0) {
    return <p className="px-5 py-3 text-muted">This organization hasn&apos;t analysed a repository yet.</p>;
  }

  return (
    <table className="w-full border-separate border-spacing-0 text-left">
      <thead>
        <tr>
          <th className={`${HEADING} pl-5`}>Repository</th>
          <th className={HEADING}>State</th>
          <th className={`${HEADING} max-sm:hidden`}>Commit</th>
          <th className={`${HEADING} max-sm:hidden`}>Completed</th>
        </tr>
      </thead>
      <tbody>
        {analyses.map((analysis) => (
          <tr key={analysis.id} className="hover:bg-surface">
            <td className={`${CELL} pl-5 font-mono break-all`}>
              <Link href={`/analyses/${analysis.id}`} className="hover:underline">
                <span className="text-muted">{analysis.projects.owner}/</span>
                {analysis.projects.name}
              </Link>
            </td>
            <td className={CELL}>
              <LiveAnalysisState
                analysisId={analysis.id}
                status={analysis.status}
                message={analysis.status === "failed" ? analysis.error_message : analysis.stage_message}
                abandoned={isAbandoned(analysis.status, analysis.started_at, readAt)}
              />
            </td>
            <td className={`${CELL} font-mono whitespace-nowrap text-muted max-sm:hidden`}>
              {analysis.commit_sha?.slice(0, 7) ?? "None"}
            </td>
            <td className={`${CELL} whitespace-nowrap text-muted tabular-nums max-sm:hidden`}>
              {analysis.completed_at ? (
                <time dateTime={analysis.completed_at} title={formatExact(analysis.completed_at)}>
                  {formatRelative(analysis.completed_at, readAt)}
                </time>
              ) : (
                "None"
              )}
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
      {/* Its own boundary, so the organization stays on screen during the read. */}
      <Suspense fallback={<p className="px-5 py-3 text-muted">Loading analyses…</p>}>
        <AnalysisList />
      </Suspense>
    </Suspense>
  );
}
