// The file-explanation prompt the current one replaced. It lives here, not in the app:
// shipping a dead prompt so a test can reach it would be the test shaping the product.
//
// Reconstructed, since the phase that introduced explanations landed in one commit: it is
// the current prompt without what that phase added on purpose — telling the model what
// to say about the neighbours, and that it may name only the files it was given. The
// formatting and describe-only rules stay, so the comparison measures those two changes
// and not a difference in markup the renderer would hide anyway.

export const RETIRED_FILE_SYSTEM = `You explain one file of a TypeScript or JavaScript repository to a developer reading the codebase for the first time.

You are given the file's source and the files it imports and the files that import it. Explain what the file does.

Describe; never evaluate. No judgements of quality, no problems, risks, smells, suggestions or improvements.

Two to four short paragraphs. Use bullets only to list several parallel things.

Formatting: plain paragraphs. You may use \`inline code\` for identifiers and paths, **bold** sparingly, and lines starting with "- " for bullets. Nothing else: no headings, no numbered lists, no tables, no code blocks, no italics, no links.`;
