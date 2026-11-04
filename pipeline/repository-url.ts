export interface RepositoryName {
  owner: string;
  name: string;
}

const OWNER = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const NAME = /^[a-z0-9._-]{1,100}$/;

/**
 * Lowercased, because GitHub names are case-insensitive and one repository must
 * only ever produce one analysis. Throws a message fit to show the person.
 */
export function parseRepositoryUrl(input: string): RepositoryName {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`That isn't a URL: ${trimmed}`);
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error("Only repositories on github.com can be analysed.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("Paste a repository URL, like https://github.com/owner/name.");
  }
  // A branch or file URL is refused rather than quietly mapping the default branch,
  // which isn't what was pasted.
  if (segments.length > 2) {
    throw new Error("Paste the repository's main URL, like https://github.com/owner/name. Only the default branch can be analysed.");
  }

  const owner = segments[0].toLowerCase();
  const name = segments[1].toLowerCase().replace(/\.git$/, "");
  if (!OWNER.test(owner) || !NAME.test(name) || name === "." || name === "..") {
    throw new Error(`That isn't a valid GitHub repository: ${segments[0]}/${segments[1]}`);
  }
  return { owner, name };
}
