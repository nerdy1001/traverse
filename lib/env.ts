// Imported by next.config.ts so a missing value stops `next dev`, `next build`
// and `next start` on boot, rather than surfacing as a confusing error later.
const missing: string[] = [];

function read(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) missing.push(name);
  return value ?? "";
}

export const env = {
  supabaseUrl: read("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  // Clerk reads these itself. They're listed so that a blank one fails here.
  clerkPublishableKey: read("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  clerkSecretKey: read("CLERK_SECRET_KEY"),
  clerkSignInUrl: read("NEXT_PUBLIC_CLERK_SIGN_IN_URL"),
  clerkSignUpUrl: read("NEXT_PUBLIC_CLERK_SIGN_UP_URL"),
  clerkSignInFallback: read("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL"),
  clerkSignUpFallback: read("NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL"),
};

if (missing.length > 0) {
  throw new Error(
    `Missing environment variables: ${missing.join(", ")}. Set them in .env.local.`,
  );
}
