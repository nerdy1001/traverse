import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

// Every request carries the Clerk session token, which is what makes the
// organization claim readable inside a policy. Sessions belong to Clerk, so
// there's no cookie handling here.
export function createServerSupabaseClient() {
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    async accessToken() {
      const token = await (await auth()).getToken();
      // Without a token, supabase-js would fall back to the anonymous role and
      // policies would quietly return nothing.
      if (!token) throw new Error("Supabase client used without a signed-in session.");
      return token;
    },
  });
}
