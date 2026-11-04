import { fallbackAdapter } from "./fallback.ts";
import { nestjsAdapter } from "./nestjs.ts";
import { nextjsAdapter } from "./nextjs.ts";
import { reactAdapter } from "./react.ts";
import type { FrameworkAdapter, Repository } from "./types.ts";

// Fixed order, first match wins. React goes after the frameworks built on or alongside
// it, since declaring it says less than they do. The fallback stays last.
const adapters: readonly FrameworkAdapter[] = [nextjsAdapter, nestjsAdapter, reactAdapter, fallbackAdapter];

export function selectAdapter(repository: Repository): FrameworkAdapter {
  return adapters.find((adapter) => adapter.matches(repository)) ?? fallbackAdapter;
}
