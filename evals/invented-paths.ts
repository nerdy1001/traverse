// The invented-path check over recent real explanations, read back from their traces.
// Usage:
//   pnpm eval:paths                    score the recent explanations
//   pnpm eval:paths --splice           splice a made-up path into one and show it's caught
//
// The same check runs live on every explanation the app generates and is attached to its
// trace as feedback. This re-runs it so a score, and every failure, can be read in one place.

import "../lib/load-env.ts";
import { requireTracing } from "../ai/client.ts";
import { findInventedPaths } from "../ai/invented-paths.ts";
import { hashBytes, readFileAt } from "../pipeline/github-file.ts";
import { isRecord, isStringArray, percent } from "./shared.ts";

/** Recent enough to be what the app does now; enough to say something. */
const DAYS = 30;
const MOST = 50;

interface RecordedExplanation {
  runId: string;
  /** The run in LangSmith, where the live score sits beside the trace it judged. */
  url: string;
  startedAt: string;
  subject: string;
  body: string;
  shownPaths: string[];
  /** For a file: where to read the source the model was given. */
  file?: { owner: string; name: string; commitSha: string; path: string; hash: string };
}

/** Only fresh answers: a cache hit is a second run over text already scored. */
function readExplanation(runId: string, url: string, startedAt: string, inputs: unknown, outputs: unknown): RecordedExplanation | null {
  if (!isRecord(inputs) || !isRecord(outputs)) return null;
  const question = inputs.question;
  const answer = outputs.answer;
  if (!isRecord(question) || !isRecord(answer)) return null;
  if (answer.cached !== false || typeof answer.body !== "string" || !isStringArray(answer.shownPaths)) return null;

  const base = { runId, url, startedAt, body: answer.body, shownPaths: answer.shownPaths };
  if (typeof question.directory === "string") return { ...base, subject: `${question.directory}/ (folder)` };

  const { path, commitSha, hash, repository } = question;
  if (typeof path !== "string" || typeof commitSha !== "string" || typeof hash !== "string" || !isRecord(repository)) return null;
  const { owner, name } = repository;
  if (typeof owner !== "string" || typeof name !== "string") return null;
  return { ...base, subject: path, file: { owner, name, commitSha, path, hash } };
}

async function recentExplanations(): Promise<RecordedExplanation[]> {
  const client = requireTracing();
  const projectName = process.env.LANGSMITH_PROJECT?.trim() || "default";
  const project = await client.readProject({ projectName });
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  const found: RecordedExplanation[] = [];
  for await (const run of client.runs.query({
    project_ids: [project.id],
    is_root: true,
    filter: 'in(name, ["explain file", "explain folder"])',
    min_start_time: since,
    selects: ["ID", "START_TIME", "INPUTS", "OUTPUTS"],
  })) {
    if (!run.id || !run.start_time) continue;
    // Built by the SDK from the project the run was read from, so it can't point elsewhere.
    const url = await client.getRunUrl({ runId: run.id, projectOpts: { projectId: project.id } });
    const explanation = readExplanation(run.id, url, run.start_time, run.inputs, run.outputs);
    if (explanation) found.push(explanation);
  }
  return found.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, MOST);
}

/** The source exactly as the model saw it, or why it can't be had. */
async function sourceOf(explanation: RecordedExplanation): Promise<{ source?: string } | { unavailable: string }> {
  if (!explanation.file) return {};
  const { owner, name, commitSha, path, hash } = explanation.file;
  const bytes = await readFileAt({ owner, name }, commitSha, path);
  if (!bytes) return { unavailable: `${path} is no longer at ${commitSha.slice(0, 7)}` };
  if (hashBytes(bytes) !== hash) return { unavailable: `${path} at ${commitSha.slice(0, 7)} isn't what was explained` };
  return { source: new TextDecoder().decode(bytes) };
}

async function score(explanations: RecordedExplanation[]): Promise<void> {
  let passed = 0;
  let checked = 0;
  for (const explanation of explanations) {
    const found = await sourceOf(explanation);
    if ("unavailable" in found) {
      console.log(`  ----  ${explanation.subject}\n        not checked: ${found.unavailable}\n        ${explanation.url}`);
      continue;
    }
    const { named, invented } = findInventedPaths(explanation.body, explanation.shownPaths, found.source);
    checked += 1;
    if (invented.length === 0) {
      passed += 1;
      console.log(`  pass  ${explanation.subject}  (${named.length} paths named, ${explanation.shownPaths.length} shown)`);
      console.log(`        ${explanation.url}`);
      continue;
    }
    // Everything needed to confirm it by hand: what it named, and what it was given.
    console.log(`  FAIL  ${explanation.subject}`);
    console.log(`        ${explanation.url}`);
    console.log(`        invented: ${invented.join(", ")}`);
    console.log(`        shown:    ${explanation.shownPaths.join(", ")}`);
  }
  const skipped = explanations.length - checked;
  console.log(
    `\nScore: ${passed} of ${checked} explanations invented no path (${percent(passed, checked)})` +
      (skipped > 0 ? `. ${skipped} couldn't be checked, listed above, and aren't counted.` : "."),
  );
}

/**
 * A plausible path nothing shown accounts for: a sibling of the explained file, the kind
 * of name a model would invent. Proven unshown by the check itself before it's used.
 */
function madeUpPath(explanation: RecordedExplanation, source: string | undefined): string {
  const subject = explanation.file?.path ?? `${explanation.subject.replace(/\/ \(folder\)$/, "")}/index.ts`;
  const slash = subject.lastIndexOf("/");
  const folder = slash === -1 ? "" : `${subject.slice(0, slash + 1)}`;
  const stem = subject.slice(slash + 1).replace(/\.[^.]+$/, "");
  for (let attempt = 0; ; attempt += 1) {
    const candidate = `${folder}${stem}-formatter${attempt === 0 ? "" : `-${attempt}`}.ts`;
    if (findInventedPaths(`\`${candidate}\``, explanation.shownPaths, source).invented.includes(candidate)) return candidate;
  }
}

async function splice(explanations: RecordedExplanation[]): Promise<void> {
  const explanation = explanations[0];
  const found = await sourceOf(explanation);
  if ("unavailable" in found) throw new Error(`Can't splice into ${explanation.subject}: ${found.unavailable}`);
  const made = madeUpPath(explanation, found.source);

  const paragraphs = explanation.body.split(/\n\s*\n/);
  paragraphs.splice(1, 0, `It also hands its result to \`${made}\`, which formats it for display.`);
  const { invented } = findInventedPaths(paragraphs.join("\n\n"), explanation.shownPaths, found.source);
  const before = findInventedPaths(explanation.body, explanation.shownPaths, found.source).invented;

  console.log(`Spliced \`${made}\` into the explanation of ${explanation.subject}.`);
  console.log(`Original run: ${explanation.url}`);
  console.log(`Invented before splicing: ${before.length > 0 ? before.join(", ") : "none"}`);
  console.log(`Invented after splicing:  ${invented.length > 0 ? invented.join(", ") : "none"}`);
  if (!invented.includes(made)) {
    console.error(`\nNOT caught: ${made} passed as a shown path.`);
    process.exit(1);
  }
  console.log(`\nCaught: ${made}`);
}

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--splice")) {
  console.error("Usage: pnpm eval:paths [--splice]");
  process.exit(1);
}

const explanations = await recentExplanations();
if (explanations.length === 0) {
  console.error(`No freshly generated explanations in the last ${DAYS} days. Explain a file in the app first.`);
  process.exit(1);
}
if (args.includes("--splice")) await splice(explanations);
else {
  console.log(`Invented-path check over the ${explanations.length} most recent generated explanations:\n`);
  await score(explanations);
}
