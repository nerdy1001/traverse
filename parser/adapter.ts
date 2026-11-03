// Framework knowledge lives behind this interface and nowhere else in the parser.

export interface FrameworkAdapter {
  name: string;
  /** Whether this repository is the adapter's framework. */
  matches(paths: readonly string[]): boolean;
  /** What kind of thing this file is, by that framework's conventions. */
  roleOf(path: string): string;
}

/** Assumes no framework at all, so it matches everything and knows nothing. */
export const fallbackAdapter: FrameworkAdapter = {
  name: "none",
  matches: () => true,
  roleOf: () => "generic",
};

// Fixed order, first match wins. The fallback stays last.
const adapters: readonly FrameworkAdapter[] = [fallbackAdapter];

export function selectAdapter(paths: readonly string[]): FrameworkAdapter {
  return adapters.find((adapter) => adapter.matches(paths)) ?? fallbackAdapter;
}
