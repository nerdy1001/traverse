export {};

declare global {
  interface CustomJwtSessionClaims {
    // Added under Clerk's session token customization. The default token carries
    // the organization's id but not its name.
    org_name?: string;
  }
}
