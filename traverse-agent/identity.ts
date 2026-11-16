import { auth, defineIdentity } from "managed-deepagents";

// The secure default `mda init` writes: callers need a LangSmith key. Which
// analysis a conversation may read is decided by the credential the tools carry,
// not here.
export const identity = defineIdentity({ auth: auth.langsmithApiKey() });
