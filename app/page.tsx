import { redirect } from "next/navigation";

// Every sign-in method's fallback redirect points at the root, so this is the one
// place they all pass through on the way to the workspace.
export default function Home() {
  redirect("/dashboard");
}
