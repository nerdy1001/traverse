// Reads single files and the current commit of a public repository. Sends no
// credentials, like the archive download.

import { createHash } from "node:crypto";
import type { RepositoryName } from "./repository-url.ts";

const TIMEOUT_MS = 20_000;

/** The parser's hash: SHA-256 of the file's bytes, hex. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The file's bytes at that commit, or null when the commit has no such file. */
export async function readFileAt({ owner, name }: RepositoryName, commit: string, path: string): Promise<Uint8Array | null> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://raw.githubusercontent.com/${owner}/${name}/${commit}/${encoded}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub answered ${response.status} when asked for ${path} at ${commit.slice(0, 7)}.`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The default branch's current commit: the same thing the archive download fetches.
 * This one does spend from the API's 60-an-hour limit, so it's only asked on a click.
 */
export async function currentCommit({ owner, name }: RepositoryName): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${name}/commits/HEAD`, {
    headers: { Accept: "application/vnd.github.sha", "User-Agent": "traverse" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} when asked for the current commit.`);
  const sha = (await response.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("GitHub's answer for the current commit wasn't a commit.");
  return sha;
}
