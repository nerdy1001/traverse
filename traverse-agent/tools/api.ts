import * as z from "zod";

// The credential arrives in the run's context, which the model never sees. It's
// the only thing that says which analysis is being read, so a repository that
// talks the model into asking for another analysis has nothing to ask with.
export const contextSchema = z.object({
  credential: z.string().min(1),
});

/** Three lookups have to fit inside a streamed answer someone is waiting on. */
const TIMEOUT_MS = 10_000;

function baseUrl(): string {
  const url = process.env.TRAVERSE_API_URL;
  if (!url) throw new Error("TRAVERSE_API_URL is not set in traverse-agent/.env");
  return url.replace(/\/+$/, "");
}

/**
 * One GET against the app's read-only surface, returned as the JSON text the model
 * reads. A failed lookup throws, so the model gets an error rather than an empty
 * result it could mistake for an answer.
 */
export async function lookup(
  context: unknown,
  path: string,
  query: Record<string, string> = {},
): Promise<string> {
  const parsed = contextSchema.safeParse(context);
  if (!parsed.success) throw new Error("This conversation has no analysis credential, so nothing can be looked up.");

  const url = new URL(`${baseUrl()}/api/agent/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${parsed.data.credential}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("Lookup failed: the map couldn't be reached.");
  }
  if (!response.ok) {
    // The app words its 4xx bodies for the model ("no file at that path").
    const reason = (await response.text()).slice(0, 500);
    throw new Error(`Lookup failed (${response.status}): ${reason || response.statusText}`);
  }
  // A sign-in redirect answers 200 with a page, which would read as data.
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Lookup failed: the app did not answer with map data.");
  }
  return response.text();
}
