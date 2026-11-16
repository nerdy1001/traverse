import { isCoverage } from "@/lib/map/coverage";
import { createAgentSupabaseClient } from "@/lib/supabase/agent";
import { readStoredMap } from "@/pipeline/read-map";
import type { AgentMap } from "./answers";

export type AgentRead = { kind: "map"; map: AgentMap } | { kind: "denied" } | { kind: "not-ready" };

/**
 * The analysis is whichever one the credential names. Nothing here reads it off the
 * credential or filters for it: the policies show that analysis and no other, so
 * the query asks for "the analysis" and a second row would fail loudly.
 */
export async function readAgentMap(credential: string): Promise<AgentRead> {
  const client = createAgentSupabaseClient(credential);
  const { data: analysis, error } = await client
    .from("analyses")
    .select("id, status, adapter, coverage")
    .maybeSingle();

  if (error) throw new Error(`Could not read the analysis: ${error.message}`);
  // Forged, expired and revoked all look the same from here, which is the point.
  if (!analysis) return { kind: "denied" };
  if (analysis.status !== "complete" || !isCoverage(analysis.coverage)) return { kind: "not-ready" };
  if (!analysis.adapter) throw new Error(`Analysis ${analysis.id} is complete but has no adapter recorded`);

  const { files, edges, routes, labelled } = await readStoredMap(client, analysis.id);
  // The same guard as the map page: a short read would answer confidently and wrongly.
  if (files.length !== analysis.coverage.files.parsed) {
    throw new Error(`The stored map has ${files.length} files, but ${analysis.coverage.files.parsed} were parsed.`);
  }
  return { kind: "map", map: { adapter: analysis.adapter, coverage: analysis.coverage, files, edges, routes, labelled } };
}
