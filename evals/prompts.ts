// The current file-explanation prompt against the one it replaced: the same questions,
// two experiments, scored side by side.
// Usage:
//   pnpm eval:prompts build <repository url>   build the dataset, once
//   pnpm eval:prompts run                      run both prompts over it
//
// Two scores, and they are not equally hard. invented_paths is exact: set membership.
// specificity is a model judging a model, because "specific enough to be useful" has no
// exact answer. It's the only way to score that, and it's reported as what it is.

import "../lib/load-env.ts";
import { evaluate, type EvaluationResult } from "langsmith/evaluation";
import { complete, MODELS, requireTracing } from "../ai/client.ts";
import { FILE_SYSTEM, fileMessage, fileShownPaths, type FileSubject, type Neighbour } from "../ai/explain.ts";
import { findInventedPaths, INVENTED_PATHS, pathFeedback } from "../ai/invented-paths.ts";
import { isRole } from "../lib/map/taxonomy.ts";
import { RETIRED_FILE_SYSTEM } from "./retired-prompt.ts";
import { createDataset, isRecord, percent, spread, withParsedRepository } from "./shared.ts";

const DATASET = "traverse-explanations";
const FILES = 20;
/** Long files cost the most and say the least about a prompt. Counted when left out. */
const MOST_LINES = 400;

/** Pinned like the app's models, and stronger than the one it judges. */
const JUDGE = "claude-sonnet-5-5";
const SPECIFICITY = "specificity";

const VERSIONS = [
  { name: "current", system: FILE_SYSTEM },
  { name: "retired", system: RETIRED_FILE_SYSTEM },
] as const;

async function build(url: string): Promise<void> {
  await withParsedRepository(url, async ({ repository, commitSha, result, readSource }) => {
    const roleOf = new Map(result.files.map(({ path, role }) => [path, role]));
    const neighbour = (path: string): Neighbour => {
      const role = roleOf.get(path);
      if (!role) throw new Error(`${path} is connected but isn't a parsed file`);
      return { path, role };
    };
    const connected = result.files.filter(({ fanIn, fanOut }) => fanIn + fanOut > 0);
    const fitting = connected.filter(({ lines }) => lines <= MOST_LINES).sort((a, b) => (a.path < b.path ? -1 : 1));
    const chosen = spread(fitting, FILES);

    const examples = [];
    for (const file of chosen) {
      const subject: FileSubject = {
        path: file.path,
        role: file.role,
        // The parse here doesn't label, so an unidentified file is shown as unidentified.
        labelled: false,
        lines: file.lines,
        imports: result.edges.filter(({ from }) => from === file.path).map(({ to }) => neighbour(to)),
        importedBy: result.edges.filter(({ to }) => to === file.path).map(({ from }) => neighbour(from)),
      };
      examples.push({
        inputs: { repository: `${repository.owner}/${repository.name}`, commitSha, subject, source: await readSource(file.path) },
        outputs: {},
      });
    }
    console.log(
      `${repository.owner}/${repository.name}: ${chosen.length} files chosen from ${connected.length} with a connection; ` +
        `${connected.length - fitting.length} left out for being over ${MOST_LINES} lines.`,
    );
    await createDataset(requireTracing(), DATASET, "Files with their real neighbours and source, for comparing explanation prompts.", examples);
  });
}

function readNeighbours(value: unknown): Neighbour[] {
  if (!Array.isArray(value)) throw new Error("An example's neighbours aren't a list.");
  return value.map((item: unknown) => {
    if (!isRecord(item) || typeof item.path !== "string" || typeof item.role !== "string" || !isRole(item.role)) {
      throw new Error("An example's neighbour isn't in the expected shape.");
    }
    return { path: item.path, role: item.role };
  });
}

function readExample(inputs: Record<string, unknown>): { subject: FileSubject; source: string } {
  const { subject, source } = inputs;
  if (!isRecord(subject) || typeof source !== "string") throw new Error("An explanation example isn't in the expected shape.");
  const { path, role, labelled, lines } = subject;
  if (typeof path !== "string" || typeof role !== "string" || !isRole(role) || typeof labelled !== "boolean" || typeof lines !== "number") {
    throw new Error("An explanation example's subject isn't in the expected shape.");
  }
  return { subject: { path, role, labelled, lines, imports: readNeighbours(subject.imports), importedBy: readNeighbours(subject.importedBy) }, source };
}

function bodyOf(outputs: Record<string, unknown>): string {
  if (typeof outputs.body !== "string") throw new Error("The run produced no explanation.");
  return outputs.body;
}

const JUDGE_SYSTEM = `You judge one explanation of a source file, written for a developer reading the codebase for the first time.

Judge one thing only: is it specific enough to be useful? A specific explanation says what this file in particular does, naming the functions, exports and neighbouring files that make it this file and not any file of its kind, and says what its neighbours get from it. A generic one could be pasted onto many files with the same name or role.

You are given the file, the complete lists of what it imports and what imports it, and its source. Ignore style and length except where they make it vaguer.

Score:
1 — generic: could describe almost any file of this kind.
2 — mostly generic, with one or two particulars.
3 — partly specific: some real particulars, but the part it plays among its neighbours is vague.
4 — specific: what it does and what its neighbours rely on it for are both concrete.
5 — specific throughout, and nothing in it is vague or padding.`;

async function judge(subject: FileSubject, source: string, body: string): Promise<{ score: number; reason: string }> {
  const text = await complete("judge specificity: model", {
    model: JUDGE,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: `${fileMessage(subject, source)}\n\n<explanation>\n${body}\n</explanation>` },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "specificity",
        strict: true,
        schema: {
          type: "object",
          properties: { reason: { type: "string" }, score: { type: "integer", enum: [1, 2, 3, 4, 5] } },
          required: ["reason", "score"],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || typeof parsed.score !== "number" || typeof parsed.reason !== "string" || ![1, 2, 3, 4, 5].includes(parsed.score)) {
    throw new Error("The judge's answer wasn't in the expected shape.");
  }
  return { score: parsed.score, reason: parsed.reason };
}

interface Scored {
  example: string;
  inventedNothing: number;
  /** The judge's 1–5. */
  specificity: number;
}

function scoreOf(results: EvaluationResult[], key: string): number {
  const score = results.find((result) => result.key === key)?.score;
  if (typeof score !== "number") throw new Error(`An example has no ${key} score.`);
  return score;
}

async function runVersion({ name, system }: (typeof VERSIONS)[number]): Promise<{ experiment: string; rows: Scored[] }> {
  const target = async (inputs: Record<string, unknown>): Promise<{ body: string }> => {
    const { subject, source } = readExample(inputs);
    const body = await complete("explain file: model", {
      model: MODELS.explain,
      messages: [
        { role: "system", content: system },
        { role: "user", content: fileMessage(subject, source) },
      ],
    });
    return { body };
  };
  const inventedPaths = ({ inputs, outputs }: { inputs: Record<string, unknown>; outputs: Record<string, unknown> }): EvaluationResult => {
    const { subject, source } = readExample(inputs);
    const shown = fileShownPaths(subject);
    return { key: INVENTED_PATHS, ...pathFeedback(findInventedPaths(bodyOf(outputs), shown, source), shown.length) };
  };
  const specificity = async ({ inputs, outputs }: { inputs: Record<string, unknown>; outputs: Record<string, unknown> }): Promise<EvaluationResult> => {
    const { subject, source } = readExample(inputs);
    const { score, reason } = await judge(subject, source, bodyOf(outputs));
    return { key: SPECIFICITY, score, comment: `${JUDGE}, a model judging a model: ${reason}` };
  };

  const results = await evaluate(target, {
    data: DATASET,
    client: requireTracing(),
    evaluators: [inventedPaths, specificity],
    experimentPrefix: `explain-${name}`,
    description: `The ${name} file-explanation prompt on ${MODELS.explain}. specificity is judged by ${JUDGE}; invented_paths is exact.`,
    metadata: { prompt: name, model: MODELS.explain, judge: JUDGE },
    maxConcurrency: 4,
  });
  const rows = results.results.map(({ example, evaluationResults }) => ({
    example: example.id,
    inventedNothing: scoreOf(evaluationResults.results, INVENTED_PATHS),
    specificity: scoreOf(evaluationResults.results, SPECIFICITY),
  }));
  return { experiment: results.experimentName, rows };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function run(): Promise<void> {
  const [current, retired] = [await runVersion(VERSIONS[0]), await runVersion(VERSIONS[1])];
  const before = new Map(retired.rows.map((row) => [row.example, row]));

  let better = 0;
  let same = 0;
  let worse = 0;
  for (const row of current.rows) {
    const other = before.get(row.example);
    if (!other) throw new Error(`Example ${row.example} ran under one prompt only.`);
    if (row.specificity > other.specificity) better += 1;
    else if (row.specificity < other.specificity) worse += 1;
    else same += 1;
  }

  const line = (name: string, experiment: string, rows: Scored[]) => {
    const clean = rows.filter(({ inventedNothing }) => inventedNothing === 1).length;
    return `  ${name.padEnd(8)} invented nothing ${String(clean).padStart(3)} of ${rows.length} ${percent(clean, rows.length).padStart(6)}   specificity ${mean(rows.map(({ specificity }) => specificity)).toFixed(2)} / 5   ${experiment}`;
  };
  const cleanDelta = (100 * (mean(current.rows.map((row) => row.inventedNothing)) - mean(retired.rows.map((row) => row.inventedNothing)))).toFixed(1);
  const specificityDelta = (mean(current.rows.map((row) => row.specificity)) - mean(retired.rows.map((row) => row.specificity))).toFixed(2);

  console.log(`\nOver ${current.rows.length} files:\n`);
  console.log(line("current", current.experiment, current.rows));
  console.log(line("retired", retired.experiment, retired.rows));
  console.log(`\nCurrent minus retired: invented nothing ${cleanDelta} points, specificity ${specificityDelta}.`);
  console.log(`Per file, the current prompt was judged more specific on ${better}, the same on ${same}, less on ${worse}.`);
  console.log(`\nThe invented-path score is exact. Specificity is ${JUDGE}'s opinion of ${MODELS.explain}'s writing, so read it as a judgement, not a measurement.`);
}

const [command, url] = process.argv.slice(2);
if (command === "build" && url) await build(url);
else if (command === "run") await run();
else {
  console.error("Usage: pnpm eval:prompts build <repository url> | pnpm eval:prompts run");
  process.exit(1);
}
