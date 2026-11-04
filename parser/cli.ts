// Usage:
//   pnpm parse <directory> [--out <file.ts>]   parse, print, optionally write
//   pnpm parse --verify <file.ts>              read a written file back and check it

import { deepStrictEqual } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseRepository } from "./parse.ts";
import type { ImportCounts, ParseResult } from "./types.ts";
import { findViolations } from "./verify.ts";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function printCounts(label: string, counts: ImportCounts): void {
  console.log(
    `${label.padEnd(10)} ${String(counts.seen).padStart(6)} seen  ${String(counts.resolved).padStart(6)} resolved  ` +
      `${String(counts.external).padStart(6)} external  ${String(counts.excluded).padStart(6)} excluded  ` +
      `${String(counts.unresolved).padStart(6)} unresolved`,
  );
}

function printResult(result: ParseResult): void {
  const { files, edges, coverage } = result;
  const folders = new Set(files.map(({ folder }) => folder));

  console.log(`${result.repository.name}  (adapter: ${result.adapter})`);
  console.log(
    `\nFiles: ${coverage.files.found} found = ${coverage.files.parsed} parsed + ${coverage.files.skipped} skipped`,
  );
  console.log(`Folders: ${folders.size}`);
  console.log(`Edges: ${edges.length}`);

  for (const [reason, count] of Object.entries(coverage.files.skippedBy)) {
    if (count === 0) continue;
    console.log(`\nSkipped, ${reason}: ${count}`);
    const matching = coverage.skippedFiles.filter((file) => file.reason === reason);
    for (const file of matching.slice(0, 5)) console.log(`  ${file.path}  ${file.detail}`);
    if (matching.length > 5) console.log(`  and ${matching.length - 5} more, all listed in --out`);
  }

  console.log(`\nDirectories not entered: ${coverage.excludedDirectories.length}`);
  for (const { path, reason } of coverage.excludedDirectories.slice(0, 15)) console.log(`  ${path}  ${reason}`);
  if (coverage.excludedDirectories.length > 15) {
    console.log(`  and ${coverage.excludedDirectories.length - 15} more, all listed in --out`);
  }

  console.log("\nImports:");
  printCounts("all", coverage.imports);
  for (const [kind, counts] of Object.entries(coverage.importsByKind)) printCounts(kind, counts);

  for (const [reason, count] of Object.entries(coverage.imports.excludedBy)) {
    if (count > 0) console.log(`\nExcluded, ${reason}: ${count}`);
  }
  for (const [reason, count] of Object.entries(coverage.imports.unresolvedBy)) {
    if (count === 0) continue;
    console.log(`\nUnresolved, ${reason}: ${count}`);
    for (const example of coverage.unresolvedExamples[reason as keyof typeof coverage.unresolvedExamples].slice(0, 5)) {
      console.log(`  ${example.from}:${example.line}  ${example.kind}  ${example.specifier}\n    ${example.detail}`);
    }
  }

  if (coverage.configProblems.length > 0) {
    console.log(`\nConfig problems: ${coverage.configProblems.length}`);
    for (const { path, message } of coverage.configProblems) console.log(`  ${path}  ${message}`);
  }

  const roles = new Map<string, number>();
  for (const { role } of files) roles.set(role, (roles.get(role) ?? 0) + 1);
  console.log(`\nRoles: ${[...roles].map(([role, count]) => `${role} ${count}`).join(", ")}`);

  console.log(`\nCommonJS exports: ${result.commonJsExports.length} files`);
  for (const { path, names, complete } of result.commonJsExports.slice(0, 15)) {
    console.log(`  ${path}  ${names.join(", ") || "(no names stated)"}${complete ? "" : "  (and more the syntax doesn't state)"}`);
  }
  if (result.commonJsExports.length > 15) {
    console.log(`  and ${result.commonJsExports.length - 15} more, all listed in --out`);
  }

  console.log(`\nRoutes: ${result.routes.length}`);
  for (const { method, pattern, path, line } of result.routes.slice(0, 40)) {
    console.log(`  ${method.padEnd(7)} ${pattern}  ${path}:${line}`);
  }
  if (result.routes.length > 40) console.log(`  and ${result.routes.length - 40} more, all listed in --out`);

  console.log(`\nRoutes omitted: ${coverage.omittedRoutes.length}`);
  for (const { path, line, reason } of coverage.omittedRoutes.slice(0, 15)) {
    console.log(`  ${path}:${line}  ${reason}`);
  }
  if (coverage.omittedRoutes.length > 15) {
    console.log(`  and ${coverage.omittedRoutes.length - 15} more, all listed in --out`);
  }

  const violations = findViolations(result);
  if (violations.length > 0) fail(`\nInvalid result:\n  ${violations.join("\n  ")}`);
}

async function readBack(file: string): Promise<ParseResult> {
  const written = (await import(pathToFileURL(resolve(file)).href)) as { parseResult: ParseResult };
  return written.parseResult;
}

function write(result: ParseResult, file: string): void {
  const absolute = resolve(file);
  if (!absolute.endsWith(".ts")) fail(`--out must name a .ts file: ${file}`);
  mkdirSync(dirname(absolute), { recursive: true });

  const typesPath = relative(dirname(absolute), resolve(import.meta.dirname, "types.ts")).replaceAll("\\", "/");
  const specifier = typesPath.startsWith(".") ? typesPath : `./${typesPath}`;
  writeFileSync(
    absolute,
    `// Written by the parser. Do not edit by hand.\n` +
      `import type { ParseResult } from ${JSON.stringify(specifier)};\n\n` +
      `export const parseResult: ParseResult = ${JSON.stringify(result, null, 2)};\n`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const verifyAt = args.indexOf("--verify");
  if (verifyAt !== -1) {
    const file = args[verifyAt + 1] ?? fail("--verify needs a file");
    const result = await readBack(file);
    const violations = findViolations(result);
    if (violations.length > 0) fail(`Invalid result:\n  ${violations.join("\n  ")}`);
    console.log(`${file}: ${result.files.length} files, ${result.edges.length} edges, all checks hold`);
    return;
  }

  const outAt = args.indexOf("--out");
  const out = outAt === -1 ? undefined : (args[outAt + 1] ?? fail("--out needs a file"));
  const directory = args.find((arg, index) => !arg.startsWith("--") && (outAt === -1 || index !== outAt + 1));
  if (!directory) fail("Usage: pnpm parse <directory> [--out <file.ts>] | pnpm parse --verify <file.ts>");

  const result = parseRepository(directory);
  printResult(result);

  if (out) {
    write(result, out);
    // A write that can't be read back identically isn't a contract.
    deepStrictEqual(await readBack(out), result);
    console.log(`\nWrote ${out} and read it back identical`);
  }
}

await main();
