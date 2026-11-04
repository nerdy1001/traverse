import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AnalysisProgress } from "@/components/analysis-progress";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAbandoned } from "@/pipeline/stages";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readAnalysis(id: string) {
  // No organization filter. Another organization's analysis isn't hidden here, it just
  // doesn't come back, so it reads the same as one that never existed.
  const { data: analysis, error } = await createServerSupabaseClient()
    .from("analyses")
    .select("id, status, stage_message, error_message, failed_stage, commit_sha, started_at, projects(owner, name)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not read the analysis: ${error.message}`);
  return { analysis, readAt: Date.now() };
}

async function Analysis({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { analysis, readAt } = await readAnalysis(id);
  if (!analysis) notFound();
  if (analysis.status === "complete") redirect(`/analyses/${analysis.id}/map`);

  return (
    <>
      <div className="flex h-11 items-center gap-2 border-b border-border px-5">
        <Link href="/dashboard" className="text-muted hover:text-foreground">
          Analyses
        </Link>
        <span aria-hidden className="text-muted">
          /
        </span>
        <h1 className="truncate font-mono">
          <span className="text-muted">{analysis.projects.owner}/</span>
          {analysis.projects.name}
        </h1>
        {analysis.commit_sha && <span className="font-mono text-muted">{analysis.commit_sha.slice(0, 7)}</span>}
      </div>
      <AnalysisProgress
        analysisId={analysis.id}
        status={analysis.status}
        message={analysis.status === "failed" ? analysis.error_message : analysis.stage_message}
        failedStage={analysis.failed_stage}
        abandoned={isAbandoned(analysis.status, analysis.started_at, readAt)}
      />
    </>
  );
}

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-3 text-muted">Loading analysis…</p>}>
      <Analysis params={params} />
    </Suspense>
  );
}
