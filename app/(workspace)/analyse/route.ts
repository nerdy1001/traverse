import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { startAnalysisFor } from "../start-analysis";

// Where the landing page's field goes. It's a GET with the URL in the query because
// that's what survives the trip through sign-in: the proxy sends a signed-out visitor
// to sign in and back to this exact address. Starting from a GET is safe to repeat,
// since an analysis that already exists is opened rather than started again.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") ?? "";
  const { orgId } = await auth.protect();

  // Without an organization, or with a URL the parser refuses, the dashboard is where
  // that gets sorted out. The URL goes with it so nobody has to paste it twice.
  const backToDashboard = `/dashboard?${new URLSearchParams({ url })}`;
  if (!orgId) redirect(backToDashboard);

  const started = await startAnalysisFor(orgId, url);
  if ("error" in started) redirect(backToDashboard);

  redirect(`/analyses/${started.id}`);
}
