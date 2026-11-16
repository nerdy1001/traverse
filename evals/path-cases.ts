// Fixed cases for the invented-path check: each is a way it once let a path through or
// flagged one wrongly. A plain script, no test runner. Usage: pnpm eval:path-cases

import { deepStrictEqual } from "node:assert";
import { findInventedPaths } from "../ai/invented-paths.ts";

const shown = ["app/(workspace)/actions.ts", "lib/env.ts", "src/lib/db.ts", "app/[id]/page.tsx", "components/Header.js"];
const source = `import x from "./util.ts";`;

const cases: { name: string; body: string; invented: string[] }[] = [
  { name: "a framework named in prose", body: "Built on Next.js and Node.js.", invented: [] },
  { name: "an unshown component file", body: "It renders `Dashboard.js` beside `Header.js`.", invented: ["Dashboard.js"] },
  { name: "a path followed by a dash", body: "It reads lib/dash.ts—which loads config.", invented: ["lib/dash.ts"] },
  { name: "shown paths followed by a dash", body: "See app/(workspace)/actions.ts—and app/[id]/page.tsx—here.", invented: [] },
  { name: "a specifier quoted from the source", body: "It imports `./util.ts`.", invented: [] },
  { name: "a shown file without its extension", body: "Settings come from `lib/env`.", invented: [] },
  { name: "a call, not a file", body: "It answers with `res.json()`.", invented: [] },
];

let failed = 0;
for (const { name, body, invented } of cases) {
  try {
    deepStrictEqual(findInventedPaths(body, shown, source).invented, invented);
    console.log(`  pass  ${name}`);
  } catch {
    failed += 1;
    console.log(`  FAIL  ${name}: expected ${JSON.stringify(invented)}, got ${JSON.stringify(findInventedPaths(body, shown, source).invented)}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} of ${cases.length} cases failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} cases hold.`);
