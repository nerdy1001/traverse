// `mda dev` on Windows can compile the agent into .mda/dev and then fail to find npx
// even when it's installed (managed-deepagents 0.10.4). This runs it as normal and,
// only on that failure, starts the LangGraph dev server it was about to start, from
// the copy it already installed, in the same local-dev mode. That fallback has no
// hot reload, so rerun after edits. Delete this once `mda dev` starts on its own.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const build = fileURLToPath(new URL("../.mda/dev/", import.meta.url));
const cli = fileURLToPath(new URL("../.mda/dev/node_modules/@langchain/langgraph-cli/dist/cli/cli.mjs", import.meta.url));
const mda = fileURLToPath(new URL("../node_modules/managed-deepagents/bin/mda.mjs", import.meta.url));

const NPX_MISSING = "could not find `npx`";

function startServer() {
  if (!existsSync(cli)) {
    console.error("mda dev didn't install the LangGraph CLI into .mda/dev, so there's nothing to start.");
    process.exit(1);
  }
  console.log("\nStarting the LangGraph dev server myself, on http://localhost:2024 (no hot reload).");
  const server = spawn(process.execPath, [cli, "dev", "--no-browser", "--port", "2024"], {
    cwd: build,
    stdio: "inherit",
    // What `mda dev` sets: local callers are accepted without verifying a LangSmith key.
    env: { ...process.env, MDA_LOCAL_DEV: "1", MDA_PUBLIC_API_URL: "http://localhost:2024" },
  });
  server.on("exit", (code) => process.exit(code ?? 0));
}

// A server left over from an earlier run holds the port, and the new one then fails
// deep inside its startup. Said plainly, up front, instead.
const taken = await new Promise((resolve) => {
  const probe = connect({ host: "localhost", port: 2024 });
  probe.once("connect", () => {
    probe.destroy();
    resolve(true);
  });
  probe.once("error", () => resolve(false));
});
if (taken) {
  console.error("Port 2024 is already in use, probably by an agent server that's still running. Stop it and try again.");
  process.exit(1);
}

let output = "";
const dev = spawn(process.execPath, [mda, "dev", ".", "--no-browser", ...process.argv.slice(2)], {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
});
for (const stream of [dev.stdout, dev.stderr]) {
  stream.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
}
dev.on("exit", (code) => {
  // Only the known failure falls through to starting the server. Anything else is real.
  if (code !== 0 && output.includes(NPX_MISSING)) startServer();
  else process.exit(code ?? 0);
});
