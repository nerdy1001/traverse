"use server";

import { auth } from "@clerk/nextjs/server";
import { explainFile, explainFolder, type Explanation, type Neighbour } from "@/ai/explain";
import { foldRepository } from "@/lib/map/fold";
import { indexNeighbours } from "@/lib/map/summary";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentCommit, hashBytes, readFileAt } from "@/pipeline/github-file";
import { readStoredMap } from "@/pipeline/read-map";
import type { RepositoryName } from "@/pipeline/repository-url";

export type ExplainRequest =
  | { analysisId: string; kind: "file"; path: string }
  | { analysisId: string; kind: "folder"; directory: string };

/** Checked on every request, cache hit or not: a stored answer can still describe old code. */
export type Staleness =
  | { state: "current" }
  | { state: "changed" | "removed" | "moved"; analysedSha: string; currentSha: string }
  | { state: "unknown"; reason: string };

export type ExplainResponse =
  | { ok: true; explanation: Explanation; staleness: Staleness }
  | { ok: false; error: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function checkStaleness(
  repository: RepositoryName,
  analysedSha: string,
  file: { path: string; hash: string } | null,
): Promise<Staleness> {
  try {
    const currentSha = await currentCommit(repository);
    if (currentSha === analysedSha) return { state: "current" };
    // A folder has no single hash to compare, so for one the commit is the whole answer.
    if (!file) return { state: "moved", analysedSha, currentSha };
    const bytes = await readFileAt(repository, currentSha, file.path);
    if (!bytes) return { state: "removed", analysedSha, currentSha };
    return { state: hashBytes(bytes) === file.hash ? "moved" : "changed", analysedSha, currentSha };
  } catch (error) {
    // Couldn't ask. Said as such, rather than read as either answer.
    return { state: "unknown", reason: message(error) };
  }
}

export async function explainSelection(request: ExplainRequest): Promise<ExplainResponse> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Sign in to explain a file." };

  // Through the policy: an analysis from another organization simply isn't there.
  const client = createServerSupabaseClient();
  const { data: analysis, error } = await client
    .from("analyses")
    .select("id, organization_id, status, commit_sha, projects(owner, name)")
    .eq("id", request.analysisId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the analysis: ${error.message}` };
  if (!analysis) return { ok: false, error: "That analysis doesn't exist in this organization." };
  if (analysis.status !== "complete" || !analysis.commit_sha) {
    return { ok: false, error: "This analysis is being re-run. Explain again once it finishes." };
  }

  const repository = { owner: analysis.projects.owner, name: analysis.projects.name };
  const commitSha = analysis.commit_sha;
  try {
    // The question is built from stored rows, never from what the browser sent, so every
    // path the model sees is one the parser resolved.
    const { files, edges, labelled } = await readStoredMap(client, analysis.id);
    const fileByPath = new Map(files.map((file) => [file.path, file]));
    const labelledSet = new Set(labelled);
    const neighbour = (path: string): Neighbour => {
      const file = fileByPath.get(path);
      if (!file) throw new Error(`${path} is connected but isn't stored`);
      return { path, role: file.role };
    };

    if (request.kind === "file") {
      const file = fileByPath.get(request.path);
      if (!file) return { ok: false, error: `${request.path} isn't in this analysis.` };
      const links = indexNeighbours(files, edges).get(file.path);
      if (!links) return { ok: false, error: `${request.path} isn't in this analysis.` };

      const [explanation, staleness] = await Promise.all([
        explainFile(client, {
          analysisId: analysis.id,
          organizationId: analysis.organization_id,
          repository,
          commitSha,
          path: file.path,
          hash: file.hash,
          role: file.role,
          labelled: labelledSet.has(file.path),
          lines: file.lines,
          imports: links.dependsOn.map(neighbour),
          importedBy: links.dependents.map(neighbour),
        }),
        checkStaleness(repository, commitSha, { path: file.path, hash: file.hash }),
      ]);
      return { ok: true, explanation, staleness };
    }

    // The same pure folding the map draws, so the folder here is the box that was clicked.
    const node = foldRepository(files, edges).nodes.find(({ directory }) => directory === request.directory);
    if (!node) return { ok: false, error: `${request.directory} isn't a folder on this map.` };
    const inside = new Set(node.files);

    const importedFromOutside = new Map<string, Set<string>>();
    const importsOutside = new Map<string, Set<string>>();
    const outsideImporters = new Map<string, Set<string>>();
    for (const { from, to } of edges) {
      if (!inside.has(from) && inside.has(to)) {
        importedFromOutside.set(from, (importedFromOutside.get(from) ?? new Set()).add(to));
        outsideImporters.set(to, (outsideImporters.get(to) ?? new Set()).add(from));
      } else if (inside.has(from) && !inside.has(to)) {
        importsOutside.set(to, (importsOutside.get(to) ?? new Set()).add(from));
      }
    }

    const [explanation, staleness] = await Promise.all([
      explainFolder(client, {
        analysisId: analysis.id,
        organizationId: analysis.organization_id,
        directory: node.directory,
        members: node.files.map((path) => {
          const file = fileByPath.get(path);
          if (!file) throw new Error(`${path} is on the map but isn't stored`);
          return { path, role: file.role, hash: file.hash, lines: file.lines, importersOutside: outsideImporters.get(path)?.size ?? 0 };
        }),
        importedFromOutside: [...importedFromOutside].sort(([a], [b]) => (a < b ? -1 : 1)).map(([from, members]) => ({ from: neighbour(from), members: [...members].sort() })),
        importsOutside: [...importsOutside].sort(([a], [b]) => (a < b ? -1 : 1)).map(([to, members]) => ({ to: neighbour(to), members: [...members].sort() })),
      }),
      checkStaleness(repository, commitSha, null),
    ]);
    return { ok: true, explanation, staleness };
  } catch (failure) {
    console.error(`Explaining ${request.kind === "file" ? request.path : request.directory} failed:`, failure);
    return { ok: false, error: message(failure) };
  }
}
