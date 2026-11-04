import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../lib/env.ts";
import type { Database } from "../lib/supabase/database.types.ts";

export type DatabaseClient = SupabaseClient<Database>;

// The one place the secret key is used. A run outlives the minute-long session
// token that started it, so it can't write as the person. This bypasses row-level
// security, so it only ever writes, and only to the analysis it was handed: the
// organization comes from that policy-scoped row. Reads stay on the session client.
export function createWriterClient(): DatabaseClient {
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
