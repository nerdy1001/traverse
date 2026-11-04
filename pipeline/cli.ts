// Runs the whole pipeline from a terminal, against the real database.
// Usage: pnpm analyse <repository url> <organization id>

import { parseRepositoryUrl } from "./repository-url.ts";
import { findOrCreateAnalysis, runAnalysis } from "./run.ts";
import { createWriterClient } from "./writer.ts";

const [url, organizationId] = process.argv.slice(2);
if (!url || !organizationId) {
  console.error("Usage: pnpm analyse <repository url> <organization id>");
  process.exit(1);
}

const repository = parseRepositoryUrl(url);
const writer = createWriterClient();
const { id: analysisId } = await findOrCreateAnalysis(writer, organizationId, repository);
console.log(`Analysis ${analysisId}`);

const outcome = await runAnalysis(writer, { ...repository, analysisId, organizationId });
console.log(outcome);
if (outcome.status !== "complete") process.exit(1);
