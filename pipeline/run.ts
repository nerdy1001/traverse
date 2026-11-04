import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSelection, selectFiles } from "../parser/parse.ts";
import { findViolations } from "../parser/verify.ts";
import type { RepositoryName } from "./repository-url.ts";
import { fetchArchive } from "./fetch-archive.ts";
import { abandonedBefore, type Stage } from "./stages.ts";
import { storeResult } from "./store.ts";
import type { DatabaseClient } from "./writer.ts";

export type RunTarget = RepositoryName & {
  analysisId: string;
  organizationId: string;
};

export type RunOutcome =
  | { status: "complete"; commitSha: string; files: number; edges: number }
  | { status: "failed"; stage: Stage; message: string }
  | { status: "already-running" };

/**
 * One analysis per repository: returns the existing row if there is one. Takes either
 * client. The organization filter below identifies the project rather than authorizing
 * anything, because the terminal's writer can see every organization.
 */
export async function findOrCreateAnalysis(
  client: DatabaseClient,
  organizationId: string,
  { owner, name }: RepositoryName,
): Promise<{ id: string; created: boolean }> {
  const organization = await client.from("organizations").upsert({ id: organizationId }, { ignoreDuplicates: true });
  if (organization.error) throw new Error(`Could not record the organization: ${organization.error.message}`);

  // Insert-then-read rather than read-then-insert, so two simultaneous submissions
  // land on the same rows instead of one of them failing on a unique constraint.
  const created = await client
    .from("projects")
    .upsert(
      { organization_id: organizationId, owner, name },
      { onConflict: "organization_id,owner,name", ignoreDuplicates: true },
    );
  if (created.error) throw new Error(`Could not record the repository: ${created.error.message}`);

  const project = await client
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("owner", owner)
    .eq("name", name)
    .single();
  if (project.error) throw new Error(`Could not read the repository back: ${project.error.message}`);

  const analysis = await client
    .from("analyses")
    .upsert(
      { organization_id: organizationId, project_id: project.data.id },
      { onConflict: "project_id", ignoreDuplicates: true },
    )
    // Only a row this call inserted comes back, which is what says who starts the run.
    .select("id");
  if (analysis.error) throw new Error(`Could not record the analysis: ${analysis.error.message}`);
  if (analysis.data[0]) return { id: analysis.data[0].id, created: true };

  const existing = await client.from("analyses").select("id").eq("project_id", project.data.id).single();
  if (existing.error) throw new Error(`Could not read the analysis back: ${existing.error.message}`);
  return { id: existing.data.id, created: false };
}

/**
 * Marks the row as started. Separate from the work because a re-run has to be visibly
 * under way before the page reloads, or the row still says "complete" and the page
 * sends you straight back to the old map. False if a run is already under way.
 */
export async function claimRun(writer: DatabaseClient, { analysisId, owner, name }: RunTarget): Promise<boolean> {
  const location = `${owner}/${name}`;

  // Conditional, so a second start while one is under way changes nothing.
  const claim = await writer
    .from("analyses")
    .update({
      status: "fetching",
      stage_message: `Downloading ${location}`,
      started_at: new Date().toISOString(),
      failed_stage: null,
      error_message: null,
      // Describes the previous run, and this one might not get as far.
      commit_sha: null,
      coverage: null,
      adapter: null,
      completed_at: null,
    })
    .eq("id", analysisId)
    .or(`status.in.(queued,complete,failed),started_at.lt.${abandonedBefore(Date.now())}`)
    .select("id");
  if (claim.error) throw new Error(`Could not start the run: ${claim.error.message}`);
  return claim.data.length > 0;
}

export async function runAnalysis(writer: DatabaseClient, target: RunTarget): Promise<RunOutcome> {
  if (!(await claimRun(writer, target))) return { status: "already-running" };
  return executeRun(writer, target);
}

/** Expects a claimed row. Anything the repository causes to go wrong becomes a failed row. */
export async function executeRun(writer: DatabaseClient, target: RunTarget): Promise<RunOutcome> {
  const { analysisId, organizationId } = target;

  let stage: Stage = "fetching";
  async function enter(next: Stage, message: string): Promise<void> {
    stage = next;
    const { error } = await writer.from("analyses").update({ status: next, stage_message: message }).eq("id", analysisId);
    if (error) throw new Error(`Could not record the stage: ${error.message}`);
  }

  const directory = await mkdtemp(join(tmpdir(), "traverse-"));
  try {
    const { commitSha, dropped } = await fetchArchive(target, directory);
    const commit = await writer.from("analyses").update({ commit_sha: commitSha }).eq("id", analysisId);
    if (commit.error) throw new Error(`Could not record the commit: ${commit.error.message}`);

    await enter("selecting", `Reading the file tree at ${commitSha.slice(0, 7)}`);
    const selection = selectFiles(directory);
    // Counted as skipped by the coverage report. An import of one without its
    // extension still reads as not found, because resolving that looks at the disk.
    selection.walk.skipped.push(...dropped);

    await enter("parsing", `Parsing ${selection.walk.sourcePaths.length} source files`);
    const result = parseSelection(selection);
    const violations = findViolations(result);
    if (violations.length > 0) throw new Error(`The parser's result is inconsistent: ${violations.join("; ")}`);

    await enter("storing", `Storing ${result.files.length} files and ${result.edges.length} connections`);
    await storeResult(writer, { analysisId, organizationId }, result);

    // Last and all together: "complete" is what makes the stored rows readable as a map.
    const finished = await writer
      .from("analyses")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
        stage_message: `Mapped ${result.files.length} files and ${result.edges.length} connections`,
        adapter: result.adapter,
        coverage: result.coverage,
      })
      .eq("id", analysisId);
    if (finished.error) throw new Error(`Could not finish the run: ${finished.error.message}`);

    return { status: "complete", commitSha, files: result.files.length, edges: result.edges.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = await writer
      .from("analyses")
      .update({ status: "failed", failed_stage: stage, error_message: message, stage_message: null })
      .eq("id", analysisId);
    // Nowhere left to record it. The row reads as abandoned once it passes the limit.
    if (failure.error) console.error(`Analysis ${analysisId} failed (${message}) and that couldn't be written: ${failure.error.message}`);
    return { status: "failed", stage, message };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
