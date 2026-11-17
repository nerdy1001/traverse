// Explaining a file or a folded folder. The model describes what the parser found; every
// path it sees is handed to it here, and it is never asked which files are connected.

import { createHash } from "node:crypto";
import { ROLES, type Role } from "../lib/map/taxonomy.ts";
import { hashBytes, readFileAt } from "../pipeline/github-file.ts";
import type { RepositoryName } from "../pipeline/repository-url.ts";
import type { DatabaseClient } from "../pipeline/writer.ts";
import { complete, MODELS, recordFeedback, traced } from "./client.ts";
import { findInventedPaths, INVENTED_PATHS, pathFeedback } from "./invented-paths.ts";

export interface Neighbour {
  path: string;
  role: Role;
}

export interface FileQuestion {
  analysisId: string;
  organizationId: string;
  repository: RepositoryName;
  commitSha: string;
  path: string;
  /** The stored hash: the cache key, and what the fetched source must match. */
  hash: string;
  role: Role;
  /** The role came from the model rather than a convention. */
  labelled: boolean;
  lines: number;
  imports: Neighbour[];
  importedBy: Neighbour[];
}

export interface FolderMember extends Neighbour {
  hash: string;
  lines: number;
  /** Distinct files outside the folder importing this one. */
  importersOutside: number;
}

export interface FolderQuestion {
  analysisId: string;
  organizationId: string;
  directory: string;
  members: FolderMember[];
  /** Each file outside the folder that imports into it, and which members it imports. */
  importedFromOutside: { from: Neighbour; members: string[] }[];
  /** Each file outside the folder that it imports, and which members import it. */
  importsOutside: { to: Neighbour; members: string[] }[];
}

export interface Explanation {
  body: string;
  cached: boolean;
  model: string;
  /** Every path the model was shown. Nothing else in the answer is a real path. */
  shownPaths: string[];
}

// Permitting a small subset and rendering it survives contact; forbidding formatting
// outright doesn't, because models don't reliably obey it. No headings: the pane is
// narrow, and they cut a few short paragraphs into labelled fragments.
const FORMATTING = `Formatting: plain paragraphs. You may use \`inline code\` for identifiers and paths, **bold** sparingly, and lines starting with "- " for bullets. Nothing else: no headings, no numbered lists, no tables, no code blocks, no italics, no links.`;

const DESCRIBE_ONLY = `Describe; never evaluate. No judgements of quality, no problems, risks, smells, suggestions or improvements.`;

/** Exported for the prompt-version eval, which runs it beside the prompt it replaced. */
export const FILE_SYSTEM = `You explain one file of a TypeScript or JavaScript repository to a developer reading the codebase for the first time.

You are given the file's source and the complete lists of the files it imports and the files that import it. A parser produced those lists and they are exact. Explain what the file does and the part it plays among those neighbours: what it takes from the files it imports, and what the files importing it rely on it for.

Name only files from the lists you were given, written exactly as given. Never mention any other path, and never suggest a connection that isn't in the lists.

${DESCRIBE_ONLY}

Two to four short paragraphs. Use bullets only to list several parallel things.

Your explanation should be in the style of a senior engineer mentoring a new hire, and should be written for a developer who is familiar with TypeScript and JavaScript but not with this codebase. It should be very simple to understand and not assume any prior knowledge of the codebase. Avoid using any technical jargon or abbreviations that are not commonly known in the TypeScript and JavaScript communities.

${FORMATTING}`;

const FOLDER_SYSTEM = `You explain one folder of a TypeScript or JavaScript repository to a developer reading the codebase for the first time.

The question is about the folder as a whole, not any one file in it: what kind of code lives here, how its files divide the work, and why the files outside it that import it depend on it. You are given every file in the folder, every file outside it that imports into it, and every file outside it that it imports. A parser produced those lists and they are exact. You are not given any file's source, so reason from paths, kinds and connections, and don't claim to know what a file contains beyond what those show.

Name only files and folders from what you were given, written exactly as given. Never mention any other path, and never suggest a connection that isn't listed.

${DESCRIBE_ONLY}

Two to four short paragraphs. Use bullets only to list several parallel things.

Your explanation should be in the style of a senior engineer mentoring a new hire, and should be written for a developer who is familiar with TypeScript and JavaScript but not with this codebase. It should be very simple to understand and not assume any prior knowledge of the codebase. Avoid using any technical jargon or abbreviations that are not commonly known in the TypeScript and JavaScript communities.

${FORMATTING}`;

function kindOf(role: Role, labelled = false): string {
  if (role === "generic") return "not identified by any convention";
  return labelled ? `${ROLES[role].name} (a model's label, not a convention)` : ROLES[role].name;
}

function listed(title: string, lines: string[]): string {
  return `${title} (${lines.length}):\n${lines.length > 0 ? lines.join("\n") : "none"}`;
}

async function readCached(
  db: DatabaseClient,
  key: { analysisId: string; kind: "file" | "folder"; subject: string; contentHash: string; model: string },
): Promise<string | null> {
  const { data, error } = await db
    .from("explanations")
    .select("body")
    .eq("analysis_id", key.analysisId)
    .eq("subject_kind", key.kind)
    .eq("subject_path", key.subject)
    .eq("content_hash", key.contentHash)
    .eq("model", key.model)
    .maybeSingle();
  if (error) throw new Error(`Could not read the explanation cache: ${error.message}`);
  return data?.body ?? null;
}

async function store(
  db: DatabaseClient,
  row: {
    organization_id: string;
    analysis_id: string;
    subject_kind: "file" | "folder";
    subject_path: string;
    content_hash: string;
    model: string;
    body: string;
  },
): Promise<void> {
  const { error } = await db.from("explanations").insert(row);
  // Two clicks raced and the other stored the same answer first. Nothing to do.
  if (error && error.code !== "23505") throw new Error(`Could not store the explanation: ${error.message}`);
}

/** What the model is told about a file. Everything it may name is in here. */
export type FileSubject = Pick<FileQuestion, "path" | "role" | "labelled" | "lines" | "imports" | "importedBy">;

/** The paths a file explanation shows the model. Nothing else in the answer is a real path. */
export function fileShownPaths(q: FileSubject): string[] {
  return [q.path, ...q.imports.map(({ path }) => path), ...q.importedBy.map(({ path }) => path)];
}

/** Shared with the prompt-version eval, so both versions are asked the identical question. */
export function fileMessage(q: FileSubject, source: string): string {
  return [
    `File: ${q.path}`,
    `Kind: ${kindOf(q.role, q.labelled)}`,
    `Lines: ${q.lines}`,
    "",
    listed("Imports", q.imports.map(({ path, role }) => `- ${path} (${kindOf(role)})`)),
    "",
    listed("Imported by", q.importedBy.map(({ path, role }) => `- ${path} (${kindOf(role)})`)),
    "",
    `<source path="${q.path}">`,
    source,
    "</source>",
  ].join("\n");
}

export function explainFile(db: DatabaseClient, question: FileQuestion): Promise<Explanation> {
  return traced("explain file", async (q: FileQuestion): Promise<Explanation> => {
    const model = MODELS.explain;
    const shownPaths = fileShownPaths(q);
    const key = { analysisId: q.analysisId, kind: "file", subject: q.path, contentHash: q.hash, model } as const;

    const hit = await readCached(db, key);
    if (hit !== null) return { body: hit, cached: true, model, shownPaths };

    const bytes = await readFileAt(q.repository, q.commitSha, q.path);
    if (!bytes) throw new Error(`${q.path} isn't in the repository at the analysed commit.`);
    // What gets explained has to be what was parsed, or the neighbours describe another file.
    if (hashBytes(bytes) !== q.hash) throw new Error(`${q.path} at the analysed commit doesn't match what was parsed.`);
    const source = new TextDecoder().decode(bytes);

    const body = await complete("explain file: model", {
      model,
      messages: [
        { role: "system", content: FILE_SYSTEM },
        { role: "user", content: fileMessage(q, source) },
      ],
    });
    // Scored live, on the run that produced it. A cache hit serves text already scored.
    await recordFeedback(INVENTED_PATHS, pathFeedback(findInventedPaths(body, shownPaths, source), shownPaths.length));
    await store(db, {
      organization_id: q.organizationId,
      analysis_id: q.analysisId,
      subject_kind: "file",
      subject_path: q.path,
      content_hash: q.hash,
      model,
      body,
    });
    return { body, cached: false, model, shownPaths };
  })(question);
}

/** A folder is what's in it: the same files with the same bytes hash the same. */
export function folderHash(members: readonly { path: string; hash: string }[]): string {
  const lines = members.map(({ path, hash }) => `${path}\t${hash}\n`).sort();
  return createHash("sha256").update(lines.join("")).digest("hex");
}

export function explainFolder(db: DatabaseClient, question: FolderQuestion): Promise<Explanation> {
  return traced("explain folder", async (q: FolderQuestion): Promise<Explanation> => {
    const model = MODELS.explain;
    const shownPaths = [
      q.directory,
      ...q.members.map(({ path }) => path),
      ...q.importedFromOutside.map(({ from }) => from.path),
      ...q.importsOutside.map(({ to }) => to.path),
    ];
    const contentHash = folderHash(q.members);
    const key = { analysisId: q.analysisId, kind: "folder", subject: q.directory, contentHash, model } as const;

    const hit = await readCached(db, key);
    if (hit !== null) return { body: hit, cached: true, model, shownPaths };

    const importers = new Set(q.importedFromOutside.map(({ from }) => from.path)).size;
    const user = [
      `Folder: ${q.directory === "." ? "the repository root" : q.directory}`,
      `Files outside it that import into it: ${importers}`,
      "",
      listed(
        "Files in the folder, with how many files outside import each",
        q.members.map(({ path, role, lines, importersOutside }) => `- ${path} (${kindOf(role)}, ${lines} lines, imported from outside by ${importersOutside})`),
      ),
      "",
      listed(
        "Files outside that import into it, and what each imports",
        q.importedFromOutside.map(({ from, members }) => `- ${from.path} (${kindOf(from.role)}) imports ${members.join(", ")}`),
      ),
      "",
      listed(
        "Files outside that it imports, and which of its files import each",
        q.importsOutside.map(({ to, members }) => `- ${to.path} (${kindOf(to.role)}) imported by ${members.join(", ")}`),
      ),
    ].join("\n");

    const body = await complete("explain folder: model", {
      model,
      messages: [
        { role: "system", content: FOLDER_SYSTEM },
        { role: "user", content: user },
      ],
    });
    await recordFeedback(INVENTED_PATHS, pathFeedback(findInventedPaths(body, shownPaths), shownPaths.length));
    await store(db, {
      organization_id: q.organizationId,
      analysis_id: q.analysisId,
      subject_kind: "folder",
      subject_path: q.directory,
      content_hash: contentHash,
      model,
      body,
    });
    return { body, cached: false, model, shownPaths };
  })(question);
}
