"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseRepositoryUrl, type RepositoryName } from "@/pipeline/repository-url";
import { claimRun, executeRun, findOrCreateAnalysis, runAnalysis, type RunTarget } from "@/pipeline/run";
import { createWriterClient } from "@/pipeline/writer";

export type InviteState = { sent: string } | { error: string } | null;
export type AnalysisActionState = { error: string } | null;

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

export async function startAnalysis(
  _previous: AnalysisActionState,
  formData: FormData,
): Promise<AnalysisActionState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "Choose an organization before analysing a repository." };

  const url = formData.get("url");
  if (typeof url !== "string" || !url.trim()) return { error: "Enter a repository URL." };

  let repository: RepositoryName;
  try {
    repository = parseRepositoryUrl(url);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That URL couldn't be read." };
  }

  // The session client, so creating these rows goes through the organization's policies.
  // Only the run itself, which outlives the session token, uses the writer.
  const { id, created } = await findOrCreateAnalysis(createServerSupabaseClient(), orgId, repository);

  // An analysis that already exists is never started from here. Pasting a URL again
  // takes you to it, and re-running is its own deliberate act on that page.
  if (created) runInBackground({ ...repository, analysisId: id, organizationId: orgId });

  redirect(`/analyses/${id}`);
}

export async function rerunAnalysis(
  _previous: AnalysisActionState,
  formData: FormData,
): Promise<AnalysisActionState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "Choose an organization before re-running an analysis." };

  const analysisId = formData.get("analysisId");
  if (typeof analysisId !== "string") return { error: "No analysis was named." };

  // Read through the policy first: the writer ignores row-level security, so this is
  // what stops an id from another organization reaching it.
  const { data, error } = await createServerSupabaseClient()
    .from("analyses")
    .select("id, organization_id, projects(owner, name)")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) return { error: `Could not read the analysis: ${error.message}` };
  if (!data) return { error: "That analysis doesn't exist in this organization." };

  const target: RunTarget = {
    owner: data.projects.owner,
    name: data.projects.name,
    analysisId: data.id,
    organizationId: data.organization_id,
  };
  const writer = createWriterClient();

  let claimed: boolean;
  try {
    claimed = await claimRun(writer, target);
  } catch (claimError) {
    return { error: claimError instanceof Error ? claimError.message : "Could not start the re-run." };
  }

  // Not claimed means a run is already under way, and the progress page shows that one.
  if (claimed) {
    after(async () => {
      try {
        await executeRun(writer, target);
      } catch (runError) {
        console.error(`Analysis ${target.analysisId} could not run:`, runError);
      }
    });
  }
  redirect(`/analyses/${target.analysisId}`);
}

// Invitations are created here rather than in the browser because only the server
// API can set where the link lands. That's this app's login page, and <SignIn />
// picks the invitation up from the URL.
export async function inviteMember(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { userId, orgId, has } = await auth();
  if (!userId || !orgId || !has({ role: "org:admin" })) {
    return { error: "Only an admin of this organization can invite." };
  }

  const emailAddress = formData.get("email");
  if (typeof emailAddress !== "string" || !emailAddress.trim()) {
    return { error: "Enter an email address." };
  }

  const origin = (await headers()).get("origin");
  if (!origin) return { error: "Couldn't work out this app's address." };

  try {
    const clerk = await clerkClient();
    await clerk.organizations.createOrganizationInvitation({
      organizationId: orgId,
      inviterUserId: userId,
      emailAddress: emailAddress.trim(),
      role: "org:member",
      redirectUrl: `${origin}/sign-in`,
    });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      return { error: error.errors[0]?.longMessage ?? error.errors[0]?.message ?? "Invite failed." };
    }
    throw error;
  }

  return { sent: emailAddress.trim() };
}
