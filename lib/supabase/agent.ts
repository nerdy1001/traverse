import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

// The agent's lookups have no signed-in user, and they don't get the secret key
// instead. They connect as anon with the publishable key and pass the credential
// through; Postgres checks its signature, and the policies show the one analysis
// it names. A forged or expired credential reads nothing, rather than erroring.
export function createAgentSupabaseClient(credential: string) {
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-agent-credential": credential } },
  });
}
