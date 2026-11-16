// What the eval scripts share: a repository parsed exactly as the pipeline parses one,
// and datasets that are built once and never silently rebuilt under an experiment.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "langsmith";
import type { KVMap } from "langsmith/schemas";
import { parseSelection, selectFiles } from "../parser/parse.ts";
import type { ParseResult } from "../parser/types.ts";
import { findViolations } from "../parser/verify.ts";
import { fetchArchive } from "../pipeline/fetch-archive.ts";
import { parseRepositoryUrl, type RepositoryName } from "../pipeline/repository-url.ts";

export interface ParsedRepository {
  repository: RepositoryName;
  commitSha: string;
  result: ParseResult;
  readSource: (path: string) => Promise<string>;
}

/** Downloads and parses one repository, the same steps as an analysis, then cleans up. */
export async function withParsedRepository<T>(url: string, work: (parsed: ParsedRepository) => Promise<T>): Promise<T> {
  const repository = parseRepositoryUrl(url);
  const directory = await mkdtemp(join(tmpdir(), "traverse-eval-"));
  try {
    const { commitSha, dropped } = await fetchArchive(repository, directory);
    const selection = selectFiles(directory);
    selection.walk.skipped.push(...dropped);
    const result = parseSelection(selection);
    const violations = findViolations(result);
    if (violations.length > 0) throw new Error(`The parser's result is inconsistent: ${violations.join("; ")}`);
    return await work({ repository, commitSha, result, readSource: (path) => readFile(join(directory, path), "utf8") });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Up to `count` items spread across the whole list, so a sample isn't one folder's worth. */
export function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, index) => items[Math.floor((index * items.length) / count)]);
}

/**
 * Refuses to touch a dataset that exists: experiments already run against it would stop
 * being comparable with ones run after. Rebuilding means deleting it in LangSmith first.
 */
export async function createDataset(
  client: Client,
  name: string,
  description: string,
  examples: { inputs: KVMap; outputs: KVMap }[],
): Promise<void> {
  if (await client.hasDataset({ datasetName: name })) {
    throw new Error(`Dataset "${name}" already exists. Delete it in LangSmith to rebuild it.`);
  }
  const dataset = await client.createDataset(name, { description });
  await client.createExamples(examples.map(({ inputs, outputs }) => ({ inputs, outputs, dataset_id: dataset.id })));
  console.log(`Created dataset "${name}" with ${examples.length} examples.`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)}%`;
}
