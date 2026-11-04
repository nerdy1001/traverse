import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Literal references, because the bundler only inlines NEXT_PUBLIC_ values spelled out
// in full. lib/env can't be used here: it reads by computed name, and holds the secret.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type GetToken = () => Promise<string | null>;

let client: SupabaseClient | undefined;
let currentGetToken: GetToken | undefined;

/**
 * For the realtime socket only: reading rows stays in server code. Shared so a dashboard
 * with several runs in progress opens one socket, not one per row. It carries the Clerk
 * session token, because a bare client joins as anonymous and every private channel
 * refuses it.
 */
export function browserRealtimeClient(getToken: GetToken): SupabaseClient {
  if (!url || !publishableKey) throw new Error("The Supabase URL or publishable key is missing from the browser bundle.");
  currentGetToken = getToken;
  client ??= createClient(url, publishableKey, {
    accessToken: async () => (currentGetToken ? currentGetToken() : null),
  });
  return client;
}
