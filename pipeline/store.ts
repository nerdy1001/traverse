import { randomUUID } from "node:crypto";
import type { ImportKind, ParseResult } from "../parser/types.ts";
import type { DatabaseClient } from "./writer.ts";

const CHUNK = 500;

// The parser's name and the column's differ, and the column's is the older contract.
const EDGE_KIND = {
  import: "import",
  "re-export": "re-export",
  dynamic: "dynamic-import",
} as const satisfies Record<ImportKind, string>;

async function insertInChunks<T>(rows: readonly T[], insert: (chunk: T[]) => PromiseLike<{ error: { message: string } | null }>) {
  for (let start = 0; start < rows.length; start += CHUNK) {
    const { error } = await insert(rows.slice(start, start + CHUNK));
    if (error) throw new Error(`Could not store rows: ${error.message}`);
  }
}

/**
 * Replaces this analysis's files and everything hanging off them, since clearing the
 * files cascades to edges, roles and routes. Not atomic across chunks, and it doesn't
 * need to be: nothing reads them until the run writes "complete", and every run
 * starts by clearing whatever an earlier one left behind.
 */
export async function storeResult(
  writer: DatabaseClient,
  { analysisId, organizationId }: { analysisId: string; organizationId: string },
  result: ParseResult,
): Promise<void> {
  const cleared = await writer.from("files").delete().eq("analysis_id", analysisId);
  if (cleared.error) throw new Error(`Could not clear the previous run: ${cleared.error.message}`);

  // Ids are made here so edges can reference files without reading them back.
  const fileIds = new Map(result.files.map(({ path }) => [path, randomUUID()]));
  function idOf(path: string): string {
    const id = fileIds.get(path);
    if (!id) throw new Error(`Edge ends on a file that is not a node: ${path}`);
    return id;
  }

  await insertInChunks(
    result.files.map((file) => ({
      id: idOf(file.path),
      organization_id: organizationId,
      analysis_id: analysisId,
      path: file.path,
      folder: file.folder,
      line_count: file.lines,
      content_hash: file.hash,
    })),
    (chunk) => writer.from("files").insert(chunk),
  );

  // No row for generic: nothing assigned that, so there's nothing whose source to record.
  await insertInChunks(
    result.files
      .filter(({ role }) => role !== "generic")
      .map((file) => ({
        organization_id: organizationId,
        file_id: idOf(file.path),
        role: file.role,
        source: "convention",
      })),
    (chunk) => writer.from("file_roles").insert(chunk),
  );

  await insertInChunks(
    result.routes.map((route) => ({
      organization_id: organizationId,
      analysis_id: analysisId,
      file_id: idOf(route.path),
      method: route.method,
      pattern: route.pattern,
      line: route.line,
    })),
    (chunk) => writer.from("routes").insert(chunk),
  );

  // The parser gives one edge per pair with its kinds; the table has one row per kind.
  await insertInChunks(
    result.edges.flatMap((edge) =>
      edge.kinds.map((kind) => ({
        organization_id: organizationId,
        analysis_id: analysisId,
        source_file_id: idOf(edge.from),
        target_file_id: idOf(edge.to),
        kind: EDGE_KIND[kind],
      })),
    ),
    (chunk) => writer.from("edges").insert(chunk),
  );
}
