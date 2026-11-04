import { expressAdapter } from "./express.ts";
import { fallbackAdapter } from "./fallback.ts";
import { nestjsAdapter } from "./nestjs.ts";
import { nextjsAdapter } from "./nextjs.ts";
import { reactAdapter } from "./react.ts";
import type { FrameworkAdapter, Repository } from "./types.ts";

// Fixed order, first match wins. Express goes after the frameworks that can run on top
// of it: a NestJS or Next.js repository declaring it is still that framework. React goes
// after the frameworks built on or alongside it, since declaring it says less than they
// do. The fallback stays last.
const adapters: readonly FrameworkAdapter[] = [nextjsAdapter, nestjsAdapter, expressAdapter, reactAdapter, fallbackAdapter];

export function selectAdapter(repository: Repository): FrameworkAdapter {
  return adapters.find((adapter) => adapter.matches(repository)) ?? fallbackAdapter;
}
