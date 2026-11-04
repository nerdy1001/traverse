import { computeFan, dedupeEdges } from "../parser/graph.ts";
import type { Edge, FileNode, ImportKind, Route } from "../parser/types.ts";
import { isRole, type Role } from "../lib/map/taxonomy.ts";
import type { DatabaseClient } from "./writer.ts";

const PAGE = 1000;

function importKind(kind: string): ImportKind {
  if (kind === "import" || kind === "re-export") return kind;
  if (kind === "dynamic-import") return "dynamic";
  throw new Error(`Stored edge has a kind the map doesn't know: ${kind}`);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** No row means nothing identified the file. */
function storedRole(role: string | undefined): Role {
  if (role === undefined) return "generic";
  if (!isRole(role)) throw new Error(`Stored file has a role the map doesn't know: ${role}`);
  return role;
}

// The API returns at most a fixed number of rows per request and says nothing when it
// stops there, which would draw a confidently wrong graph. So the total is asked for
// and the read fails rather than come up short.
async function readAll<T>(
  label: string,
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, count, error } = await readPage(rows.length, rows.length + PAGE - 1);
    if (error) throw new Error(`Could not read ${label}: ${error.message}`);
    if (count === null) throw new Error(`Could not read ${label}: no total came back`);
    rows.push(...(data ?? []));
    if (rows.length >= count) return rows;
    if (!data?.length) throw new Error(`Could not read ${label}: got ${rows.length} of ${count}`);
  }
}

/**
 * Puts stored rows back into the parser's shape, so everything built on that shape
 * works unchanged. Takes either client. On the session client, the policy decides
 * whether anything comes back; the analysis id only says which map.
 */
export async function readStoredMap(
  client: DatabaseClient,
  analysisId: string,
): Promise<{ files: FileNode[]; edges: Edge[]; routes: Route[] }> {
  const fileRows = await readAll("files", (from, to) =>
    client
      .from("files")
      .select("id, path, folder, line_count, content_hash, file_roles(role)", { count: "exact" })
      .eq("analysis_id", analysisId)
      .order("path")
      .range(from, to),
  );
  const routeRows = await readAll("routes", (from, to) =>
    client
      .from("routes")
      .select("method, pattern, line, files(path)", { count: "exact" })
      .eq("analysis_id", analysisId)
      .order("id")
      .range(from, to),
  );
  const edgeRows = await readAll("connections", (from, to) =>
    client
      .from("edges")
      .select("source_file_id, target_file_id, kind", { count: "exact" })
      .eq("analysis_id", analysisId)
      .order("id")
      .range(from, to),
  );

  const pathOf = new Map(fileRows.map(({ id, path }) => [id, path]));
  function path(id: string): string {
    const found = pathOf.get(id);
    if (!found) throw new Error(`Stored edge ends on a file that isn't stored: ${id}`);
    return found;
  }

  const edges = dedupeEdges(
    edgeRows.map((edge) => ({
      from: path(edge.source_file_id),
      to: path(edge.target_file_id),
      kind: importKind(edge.kind),
    })),
  );

  // Sorted the parser's way, not the database's: collation order isn't byte order.
  const paths = fileRows.map((file) => file.path).sort(compare);
  const fan = computeFan(paths, edges);
  const byPath = new Map(fileRows.map((file) => [file.path, file]));
  const files = paths.flatMap((filePath): FileNode[] => {
    const row = byPath.get(filePath);
    if (!row) return [];
    return [
      {
        path: row.path,
        folder: row.folder,
        role: storedRole(row.file_roles[0]?.role),
        lines: row.line_count,
        hash: row.content_hash,
        fanIn: fan.get(filePath)?.fanIn ?? 0,
        fanOut: fan.get(filePath)?.fanOut ?? 0,
      },
    ];
  });

  // In the parser's order, for the same reason as the files.
  const routes = routeRows
    .map(({ method, pattern, line, files: file }) => ({ method, pattern, line, path: file.path }))
    .sort((a, b) => compare(a.pattern, b.pattern) || compare(a.method, b.method) || compare(a.path, b.path));

  return { files, edges, routes };
}
