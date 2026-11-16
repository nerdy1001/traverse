import { readFileSync } from "node:fs";
import { join } from "node:path";
import { labelBatch, type LabelCandidate } from "../ai/label.ts";
import type { ModelRole } from "../lib/map/taxonomy.ts";
import type { ParseResult } from "../parser/types.ts";
import type { DatabaseClient } from "./writer.ts";

/** Small enough that one answer stays readable, large enough not to make a call per file. */
const BATCH = 20;
/** Batches in flight at once. */
const PARALLEL = 3;

export interface Labelling {
  roles: Map<string, ModelRole>;
  candidates: number;
}

/**
 * Asks the model about every file no convention identified, while the archive is still
 * on disk. Files it gives no role stay unidentified: absent beats approximate.
 */
export async function labelUnidentified(
  writer: DatabaseClient,
  { organizationId, directory }: { organizationId: string; directory: string },
  result: ParseResult,
  onProgress: (done: number, total: number) => Promise<void>,
): Promise<Labelling> {
  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>();
  for (const { from, to } of result.edges) {
    imports.set(from, [...(imports.get(from) ?? []), to]);
    importedBy.set(to, [...(importedBy.get(to) ?? []), from]);
  }

  const candidates: LabelCandidate[] = result.files
    .filter(({ role }) => role === "generic")
    .map(({ path, hash, lines }) => ({
      path,
      hash,
      lines,
      imports: imports.get(path) ?? [],
      importedBy: importedBy.get(path) ?? [],
    }));

  const batches: LabelCandidate[][] = [];
  for (let start = 0; start < candidates.length; start += BATCH) batches.push(candidates.slice(start, start + BATCH));

  const readSource = (path: string) => readFileSync(join(directory, path), "utf8");
  const roles = new Map<string, ModelRole>();
  let done = 0;
  let next = 0;
  // Chained, so batches finishing together can't write their counts out of order.
  let reported = Promise.resolve();
  async function worker() {
    while (next < batches.length) {
      const files = batches[next++];
      const { labelled } = await labelBatch(writer, { organizationId, files }, readSource);
      for (const { path, role } of labelled) roles.set(path, role);
      done += files.length;
      const count = done;
      reported = reported.then(() => onProgress(count, candidates.length));
      await reported;
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
  return { roles, candidates: candidates.length };
}
