import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CoverageBanner } from "@/components/coverage-banner";
import { MapWorkspace } from "@/components/map-workspace";
import { RerunButton } from "@/components/rerun-button";
import { isCoverage } from "@/lib/map/coverage";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readStoredMap } from "@/pipeline/read-map";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function StoredMap({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const client = createServerSupabaseClient();
  const { data: analysis, error } = await client
    .from("analyses")
    .select("id, status, adapter, commit_sha, coverage, projects(owner, name)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not read the analysis: ${error.message}`);
  if (!analysis) notFound();
  if (analysis.status !== "complete") redirect(`/analyses/${analysis.id}`);

  const { owner, name } = analysis.projects;
  const header = (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-5">
      <Link href="/dashboard" className="text-muted hover:text-foreground">
        Analyses
      </Link>
      <span aria-hidden className="text-muted">
        /
      </span>
      <h1 className="truncate font-mono">
        <span className="text-muted">{owner}/</span>
        {name}
      </h1>
      {analysis.commit_sha && <span className="font-mono text-muted">{analysis.commit_sha.slice(0, 7)}</span>}
      <div className="ml-auto">
        <RerunButton analysisId={analysis.id} />
      </div>
    </div>
  );

  // Complete with no report to show: a row from before reports were stored. Without the
  // figure, a map could look complete when it isn't, so it isn't drawn at all.
  if (!isCoverage(analysis.coverage)) {
    return (
      <>
        {header}
        <p className="px-5 py-3 text-muted">No map is stored for this analysis. Re-run it to build one.</p>
      </>
    );
  }

  const { files, edges } = await readStoredMap(client, analysis.id);

  // A short read would draw a confidently wrong graph, so it fails instead.
  if (files.length !== analysis.coverage.files.parsed) {
    throw new Error(`The stored map has ${files.length} files, but ${analysis.coverage.files.parsed} were parsed.`);
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <CoverageBanner coverage={analysis.coverage} />
      <div className="min-h-0 flex-1">
        <MapWorkspace
          files={files}
          edges={edges}
          facts={{
            name: `${owner}/${name}`,
            framework: analysis.adapter ?? "none",
            skippedCount: analysis.coverage.files.skipped,
          }}
        />
      </div>
    </div>
  );
}

export default function AnalysisMapPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="px-5 py-3 text-muted">Loading map…</p>}>
      <StoredMap params={params} />
    </Suspense>
  );
}
