import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseRepositoryUrl, type RepositoryName } from "@/pipeline/repository-url";
import { findOrCreateAnalysis, runAnalysis, type RunTarget } from "@/pipeline/run";
import { createWriterClient } from "@/pipeline/writer";

// Runs after the response, inside this process: there is no queue to hand it to. A
// run that throws has already failed to write its state, so all that's left is to log
// it, and the dashboard marks the row stale once it's old enough.
function runInBackground(target: RunTarget) {
  after(async () => {
    try {
      await runAnalysis(createWriterClient(), target);
    } catch (error) {
      console.error(`Analysis ${target.analysisId} could not run:`, error);
    }
  });
}

/**
 * The one way an analysis gets started, whether from the dashboard's form or a URL
 * carried in from the landing page. Errors are messages fit to show the person.
 */
export async function startAnalysisFor(
  organizationId: string,
  url: string,
): Promise<{ id: string } | { error: string }> {
  if (!url.trim()) return { error: "Enter a repository URL." };

  let repository: RepositoryName;
  try {
    repository = parseRepositoryUrl(url);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That URL couldn't be read." };
  }

  // The session client, so creating these rows goes through the organization's policies.
  // Only the run itself, which outlives the session token, uses the writer.
  const { id, created } = await findOrCreateAnalysis(createServerSupabaseClient(), organizationId, repository);

  // An analysis that already exists is never started from here. Pasting a URL again
  // takes you to it, and re-running is its own deliberate act on that page.
  if (created) runInBackground({ ...repository, analysisId: id, organizationId });

  return { id };
}
