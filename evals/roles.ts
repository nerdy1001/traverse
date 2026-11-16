// Role accuracy. Convention assigns some roles with certainty, and a file convention
// identified never reaches the labeller, so those files are a held-out set with real
// ground truth: hide the role, ask the model with the production prompt, compare.
// Usage:
//   pnpm eval:roles build <repository url>...   build the dataset, once
//   pnpm eval:roles run                         run an experiment over it

import "../lib/load-env.ts";
import { evaluate, type EvaluationResult } from "langsmith/evaluation";
import { MODELS, requireTracing } from "../ai/client.ts";
import { askRoles, type LabelCandidate } from "../ai/label.ts";
import { isModelRole, MODEL_ROLES, type ModelRole } from "../lib/map/taxonomy.ts";
import { createDataset, isRecord, isStringArray, percent, spread, withParsedRepository } from "./shared.ts";

const DATASET = "traverse-roles";
/** Per role per repository, so one framework's components can't be the whole score. */
const PER_ROLE = 6;
/** Below this a percentage is mostly noise. */
const AT_LEAST = 30;

interface RoleExample {
  file: LabelCandidate;
  source: string;
}

async function build(urls: string[]): Promise<void> {
  const examples: { inputs: { repository: string; commitSha: string; file: LabelCandidate; source: string }; outputs: { role: ModelRole } }[] = [];
  for (const url of urls) {
    await withParsedRepository(url, async ({ repository, commitSha, result, readSource }) => {
      const imports = new Map<string, string[]>();
      const importedBy = new Map<string, string[]>();
      for (const { from, to } of result.edges) {
        imports.set(from, [...(imports.get(from) ?? []), to]);
        importedBy.set(to, [...(importedBy.get(to) ?? []), from]);
      }
      const counts: string[] = [];
      // Only roles the labeller may answer with. Scoring it on page or controller would
      // be scoring it on questions it is forbidden to answer.
      for (const role of MODEL_ROLES) {
        const conventional = result.files.filter((file) => file.role === role).sort((a, b) => (a.path < b.path ? -1 : 1));
        const chosen = spread(conventional, PER_ROLE);
        if (chosen.length > 0) counts.push(`${role} ${chosen.length} of ${conventional.length}`);
        for (const { path, hash, lines } of chosen) {
          const file = { path, hash, lines, imports: imports.get(path) ?? [], importedBy: importedBy.get(path) ?? [] };
          examples.push({
            inputs: { repository: `${repository.owner}/${repository.name}`, commitSha, file, source: await readSource(path) },
            outputs: { role },
          });
        }
      }
      console.log(`${repository.owner}/${repository.name} (${result.adapter}): ${counts.join(", ") || "no file has a role the labeller may give"}`);
    });
  }
  if (examples.length < AT_LEAST) {
    throw new Error(`Only ${examples.length} files have a conventional role the labeller may give; at least ${AT_LEAST} are needed. Add repositories.`);
  }
  await createDataset(
    requireTracing(),
    DATASET,
    `Files whose role convention assigned, limited to roles the labeller may answer with. The role is the reference output.`,
    examples,
  );
}

function readExample(inputs: Record<string, unknown>): RoleExample {
  const { file, source } = inputs;
  if (!isRecord(file) || typeof source !== "string") throw new Error("A role example isn't in the expected shape.");
  const { path, hash, lines, imports, importedBy } = file;
  if (typeof path !== "string" || typeof hash !== "string" || typeof lines !== "number" || !isStringArray(imports) || !isStringArray(importedBy)) {
    throw new Error("A role example's file isn't in the expected shape.");
  }
  return { file: { path, hash, lines, imports, importedBy }, source };
}

/** What the model answered: a role, "none", or "unanswered" if it skipped the file. */
function answerOf(outputs: Record<string, unknown> | undefined): string {
  return typeof outputs?.role === "string" ? outputs.role : "unanswered";
}

async function run(): Promise<void> {
  const client = requireTracing();
  // Bare, with no cache: the point is to ask the model, every time.
  const target = async (inputs: Record<string, unknown>): Promise<{ role: string }> => {
    const { file, source } = readExample(inputs);
    const answers = await askRoles([file], () => source);
    return { role: answers.get(file.path) ?? "unanswered" };
  };
  const correct = ({ outputs, referenceOutputs }: { outputs: Record<string, unknown>; referenceOutputs?: Record<string, unknown> }): EvaluationResult => ({
    key: "role_correct",
    score: answerOf(outputs) === referenceOutputs?.role ? 1 : 0,
  });

  const results = await evaluate(target, {
    data: DATASET,
    client,
    evaluators: [correct],
    experimentPrefix: "roles",
    description: `The labeller's prompt and ${MODELS.label}, with each file's conventional role hidden.`,
    metadata: { model: MODELS.label },
    maxConcurrency: 4,
  });

  // Per role, so a high total can't hide a role it never gets right.
  const byRole = new Map<string, { right: number; total: number; wrong: Map<string, number> }>();
  let right = 0;
  for (const { run: recorded, example } of results.results) {
    const expected = example.outputs?.role;
    if (typeof expected !== "string" || !isModelRole(expected)) throw new Error(`Example ${example.id} has no reference role.`);
    const got = answerOf(recorded.outputs);
    const tally = byRole.get(expected) ?? { right: 0, total: 0, wrong: new Map<string, number>() };
    tally.total += 1;
    if (got === expected) {
      tally.right += 1;
      right += 1;
    } else tally.wrong.set(got, (tally.wrong.get(got) ?? 0) + 1);
    byRole.set(expected, tally);
  }

  console.log(`\nExperiment ${results.experimentName}\n`);
  for (const role of MODEL_ROLES) {
    const tally = byRole.get(role);
    if (!tally) continue;
    const wrong = [...tally.wrong].map(([answer, count]) => `${answer} ${count}`).join(", ");
    console.log(`  ${role.padEnd(11)} ${String(tally.right).padStart(3)} of ${String(tally.total).padEnd(3)} ${percent(tally.right, tally.total).padStart(6)}${wrong ? `   answered instead: ${wrong}` : ""}`);
  }
  console.log(`\nRole accuracy: ${right} of ${results.results.length} (${percent(right, results.results.length)})`);
}

const [command, ...rest] = process.argv.slice(2);
if (command === "build" && rest.length > 0) await build(rest);
else if (command === "run") await run();
else {
  console.error("Usage: pnpm eval:roles build <repository url>... | pnpm eval:roles run");
  process.exit(1);
}
