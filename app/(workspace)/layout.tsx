import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { InviteForm } from "./invite-form";
import { ThemeControl } from "./theme-control";

async function AdminInvite() {
  const { has } = await auth();
  if (!has({ role: "org:admin" })) return null;
  return <InviteForm />;
}

export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <span className="font-mono font-medium">traverse</span>
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
          afterLeaveOrganizationUrl="/dashboard"
        />
        <div className="ml-auto flex items-center gap-3">
          <Suspense>
            <AdminInvite />
          </Suspense>
          <ThemeControl />
          <UserButton />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
