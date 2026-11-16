import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Everything is protected unless listed here, so a new route can't be left open
// by forgetting to add it.
function isPublic(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/preview" ||
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    // The agent has no session. Its credential is checked by Postgres, and without
    // a valid one these return nothing.
    pathname.startsWith("/api/agent/")
  );
}

// Redirecting here is what guarantees no HTML is sent to a signed-out visitor: a
// check in the page alone would redirect after streaming has started. Pages
// still run their own check, because this one matches on URL paths only.
export default clerkMiddleware(async (auth, req) => {
  // The root is the landing page for strangers. Someone signed in has no use for it,
  // and every sign-in method's fallback redirect lands here. Deciding it here keeps
  // the page itself static, with nothing about the visitor read while rendering.
  if (req.nextUrl.pathname === "/") {
    const { isAuthenticated } = await auth();
    if (isAuthenticated) return NextResponse.redirect(new URL("/dashboard", req.url));
    return;
  }

  if (isPublic(req.nextUrl.pathname)) return;

  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn({ returnBackUrl: req.url });
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
