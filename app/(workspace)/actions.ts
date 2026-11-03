"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { headers } from "next/headers";

export type InviteState = { sent: string } | { error: string } | null;

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
