// Labels files no convention identified. The model may only answer with a role that
// isn't structural; the schema, the check below and a database constraint each refuse
// anything else.

import { isModelRole, MODEL_ROLES, type ModelRole } from "../lib/map/taxonomy.ts";
import type { DatabaseClient } from "../pipeline/writer.ts";
import { complete, MODELS, traced } from "./client.ts";

/** Enough of a file to say what sort of thing it is. Anything shorter is shown whole. */
const LINES_SHOWN = 150;

export interface LabelCandidate {
  path: string;
  hash: string;
  lines: number;
  imports: string[];
  importedBy: string[];
}

export interface LabelBatch {
  organizationId: string;
  files: LabelCandidate[];
}

export interface BatchLabels {
  /** Only the files that got a role. "none" and unanswered files stay unidentified. */
  labelled: { path: string; role: ModelRole }[];
  /** Files whose answer came from the cache rather than the model. */
  cachedCount: number;
}

export type Answer = ModelRole | "none";

const SYSTEM = `You label files of a TypeScript or JavaScript repository that no framework convention identified.

For each file, choose the one role that best describes what it is:
- service: does work on behalf of other code, such as business logic or calls to an external API
- repository: reads from or writes to a database or other storage
- model: defines data shapes, types, schemas or domain objects
- util: small general-purpose helpers
- config: configuration values or setup
- component: renders user interface
- hook: a React hook
If none of these fits, answer none. Never invent another role.

For each file you see its path, what it imports, what imports it, and its source, which may be only its first lines. Answer once for every file listed, using its path exactly.`;

function isAnswer(value: unknown): value is Answer {
  return value === "none" || (typeof value === "string" && isModelRole(value));
}

/** Path to answer, keeping only answers about files that were asked about, given once. */
function readAnswers(text: string, asked: ReadonlySet<string>): Map<string, Answer> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || !("labels" in parsed) || !Array.isArray(parsed.labels)) {
    throw new Error("The model's labels weren't in the expected shape.");
  }
  const answers = new Map<string, Answer>();
  const conflicting = new Set<string>();
  for (const entry of parsed.labels as unknown[]) {
    if (typeof entry !== "object" || entry === null || !("path" in entry) || !("role" in entry)) continue;
    const { path, role } = entry;
    if (typeof path !== "string" || !asked.has(path) || !isAnswer(role)) continue;
    // Two different answers about one file is no answer.
    if (answers.has(path) && answers.get(path) !== role) conflicting.add(path);
    answers.set(path, role);
  }
  for (const path of conflicting) answers.delete(path);
  return answers;
}

function describe(file: LabelCandidate, source: string): string {
  const lines = source.split("\n");
  const shown = lines.length > LINES_SHOWN ? lines.slice(0, LINES_SHOWN).join("\n") : source;
  const extent = lines.length > LINES_SHOWN ? `first ${LINES_SHOWN} of ${file.lines} lines` : `all ${file.lines} lines`;
  return [
    `<file path="${file.path}">`,
    `Imports: ${file.imports.length > 0 ? file.imports.join(", ") : "nothing in this repository"}`,
    `Imported by: ${file.importedBy.length > 0 ? file.importedBy.join(", ") : "nothing in this repository"}`,
    `Source (${extent}):`,
    shown,
    "</file>",
  ].join("\n");
}

/**
 * The model's answers, path to role, with no cache either side. The labeller wraps this
 * in its cache; the role-accuracy eval calls it bare, since a cached answer measures nothing.
 */
export async function askRoles(files: readonly LabelCandidate[], readSource: (path: string) => string): Promise<Map<string, Answer>> {
  const paths = files.map(({ path }) => path);
  const text = await complete("label roles: model", {
    model: MODELS.label,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: files.map((file) => describe(file, readSource(file.path))).join("\n\n") },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "file_roles",
        strict: true,
        schema: {
          type: "object",
          properties: {
            labels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string", enum: paths },
                  role: { type: "string", enum: [...MODEL_ROLES, "none"] },
                },
                required: ["path", "role"],
                additionalProperties: false,
              },
            },
          },
          required: ["labels"],
          additionalProperties: false,
        },
      },
    },
  });
  return readAnswers(text, new Set(paths));
}

/**
 * One batch, one recorded run. Sources come through `readSource` rather than the input,
 * so the run records which files were asked about without carrying every file twice.
 */
export function labelBatch(
  db: DatabaseClient,
  batch: LabelBatch,
  readSource: (path: string) => string,
): Promise<BatchLabels> {
  return traced("label roles", async ({ organizationId, files }: LabelBatch): Promise<BatchLabels> => {
    const model = MODELS.label;
    const hashes = [...new Set(files.map(({ hash }) => hash))];

    // Keyed on content, so an unchanged file is never asked about twice. The organization
    // names whose cache this is: the pipeline's writer can see every organization.
    const { data, error } = await db
      .from("role_labels")
      .select("content_hash, role")
      .eq("organization_id", organizationId)
      .eq("model", model)
      .in("content_hash", hashes);
    if (error) throw new Error(`Could not read the role cache: ${error.message}`);
    const known = new Map<string, Answer>();
    for (const { content_hash, role } of data) if (isAnswer(role)) known.set(content_hash, role);

    const answers = new Map<string, Answer>();
    let cachedCount = 0;
    for (const file of files) {
      const hit = known.get(file.hash);
      if (hit) {
        answers.set(file.path, hit);
        cachedCount += 1;
      }
    }

    const missing = files.filter(({ path }) => !answers.has(path));
    if (missing.length > 0) {
      const given = await askRoles(missing, readSource);
      const rows = new Map<string, { organization_id: string; content_hash: string; model: string; role: Answer }>();
      for (const file of missing) {
        const answer = given.get(file.path);
        if (!answer) continue;
        answers.set(file.path, answer);
        rows.set(file.hash, { organization_id: organizationId, content_hash: file.hash, model, role: answer });
      }
      if (rows.size > 0) {
        const stored = await db
          .from("role_labels")
          .upsert([...rows.values()], { onConflict: "organization_id,content_hash,model", ignoreDuplicates: true });
        if (stored.error) throw new Error(`Could not store the role labels: ${stored.error.message}`);
      }
    }

    // A list rather than a map, so the recorded run shows what was decided.
    const labelled: { path: string; role: ModelRole }[] = [];
    for (const [path, answer] of answers) if (answer !== "none") labelled.push({ path, role: answer });
    return { labelled, cachedCount };
  })(batch);
}
