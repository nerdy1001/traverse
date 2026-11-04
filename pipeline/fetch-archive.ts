import { pipeline } from "node:stream/promises";
import { ReadEntry, x as extract } from "tar";
import type { SkippedFile } from "../parser/types.ts";
import type { RepositoryName } from "./repository-url.ts";

// Limits stated rather than architected around. Hitting one fails the run and says so.
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;
const TIMEOUT_MS = 5 * 60 * 1000;

export interface FetchedArchive {
  commitSha: string;
  /** In the archive but not on disk. The parser has to count these as skipped. */
  dropped: SkippedFile[];
}

function withoutTopFolder(path: string): string {
  return path.split("/").slice(1).join("/");
}

// By hand because the project's DOM and Node stream types don't line up, and
// Readable.fromWeb would need a cast to accept this body.
async function* chunksOf(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) yield read.value;
  } finally {
    await reader.cancel();
  }
}

/**
 * Unpacks the default branch into `directory`. Sends no credentials, so anything
 * private is indistinguishable from nothing being there at all.
 */
export async function fetchArchive({ owner, name }: RepositoryName, directory: string): Promise<FetchedArchive> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const location = `${owner}/${name}`;

  let response: Response;
  try {
    response = await fetch(`https://github.com/${location}/archive/HEAD.tar.gz`, { signal: timeout });
  } catch (error) {
    throw new Error(`Could not reach GitHub for ${location}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (response.status === 404) {
    throw new Error(`${location} wasn't found on GitHub. It may not exist, be private, or have no commits.`);
  }
  if (!response.ok || !response.body) {
    throw new Error(`GitHub answered ${response.status} when asked for the archive of ${location}.`);
  }

  // GitHub names the archive's top folder <repo>-<sha>, so the commit comes from
  // the archive itself. Asking the API separately could describe a different commit
  // if someone pushed in between, and would spend its 60-an-hour rate limit.
  let topFolder: string | undefined;
  const dropped: SkippedFile[] = [];
  const problems: string[] = [];
  let unpackedBytes = 0;
  const overLimit = new AbortController();

  const unpack = extract({
    cwd: directory,
    strip: 1,
    filter(path, entry) {
      topFolder ??= path.split("/")[0];
      if (!(entry instanceof ReadEntry)) return true;

      // Never written to disk: an archive is untrusted and a link can point anywhere.
      // Dropping them also behaves the same on Windows, which often can't create them.
      if (entry.type === "SymbolicLink" || entry.type === "Link") {
        dropped.push({ path: withoutTopFolder(path), reason: "symlink", detail: "symbolic link, not followed" });
        return false;
      }
      unpackedBytes += entry.size ?? 0;
      if (unpackedBytes > MAX_UNPACKED_BYTES) overLimit.abort();
      return true;
    },
    onwarn(code, message, data) {
      if (code === "TAR_ENTRY_INFO") return;
      const entry = data.entry;
      // One file that can't be written, such as a name Windows refuses, is a gap to
      // count. Anything else means the archive itself can't be trusted.
      if (entry instanceof ReadEntry && withoutTopFolder(entry.path)) {
        dropped.push({ path: withoutTopFolder(entry.path), reason: "unreadable", detail: message });
      } else {
        problems.push(`${code}: ${message}`);
      }
    },
  });

  try {
    await pipeline(chunksOf(response.body), unpack, {
      signal: AbortSignal.any([timeout, overLimit.signal]),
    });
  } catch (error) {
    if (overLimit.signal.aborted) {
      throw new Error(`${location} unpacks to more than ${MAX_UNPACKED_BYTES / 1024 / 1024} MB, which is over the limit.`);
    }
    if (timeout.aborted) throw new Error(`Downloading ${location} took longer than ${TIMEOUT_MS / 60000} minutes.`);
    throw new Error(`Could not unpack ${location}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (problems.length > 0) throw new Error(`Could not unpack ${location}: ${problems.join("; ")}`);

  const commitSha = /-([0-9a-f]{40})$/.exec(topFolder ?? "")?.[1];
  if (!commitSha) {
    throw new Error(`Could not read the commit from the archive of ${location}: its top folder is "${topFolder}".`);
  }
  return { commitSha, dropped };
}
