// For scripts run outside Next: loads the same .env.local the app reads, so a script and
// the app can never disagree about a key. Import it first, before anything that reads
// process.env at import time. Values already set in the shell win, as they do in Next.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(import.meta.dirname, "..", ".env.local");
if (!existsSync(file)) throw new Error(`No .env.local at ${file}. Scripts read the same file the app does.`);
process.loadEnvFile(file);
