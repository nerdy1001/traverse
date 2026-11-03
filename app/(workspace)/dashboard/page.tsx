import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

// Everything here comes off the session token. Nothing asks Clerk at runtime.
async function CurrentOrganization() {
  const { orgId, sessionClaims } = await auth.protect();

  return (
    <div className="flex items-baseline gap-2">
      {sessionClaims.org_name && <h1 className="font-medium">{sessionClaims.org_name}</h1>}
      <span className="font-mono text-muted">{orgId}</span>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="p-3">
      <Suspense>
        <CurrentOrganization />
      </Suspense>
    </div>
  );
}
