import Link from "next/link";
import type { ReactNode } from "react";
import { MapIllustration, ReachIllustration, ResolutionIllustration } from "@/components/landing/illustrations";
import { RepositoryField } from "@/components/landing/repository-field";
import { ThemeControl } from "@/components/theme-control";
import { ROLES, type Role } from "@/lib/map/taxonomy";

// The landing page, for someone signed out. The proxy sends anyone signed in on to the
// dashboard, so nothing here reads who the visitor is and the page stays static.
//
// It uses the product's tokens, type and theme control and nothing of its own. The
// difference is proportion: this is read once, so it gets room the tool doesn't.

const COLUMN = "mx-auto w-full max-w-[1140px] px-6";
const SECTION = "border-t border-border py-24 md:py-32";
const HEADING = "text-[clamp(1.875rem,3.6vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-balance";
// Measure, not column width, caps every paragraph.
const BESIDE_FIGURE = "max-w-[46ch]";
const FULL_WIDTH = "max-w-[64ch]";
const BODY = "text-base leading-relaxed md:text-lg";

function Section({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className={SECTION}>
      <div className={COLUMN}>{children}</div>
    </section>
  );
}

// ---- What it does -----------------------------------------------------------------

const ABILITIES: readonly [term: string, description: string][] = [
  ["Both directions", "Files that import it in green, files it imports in amber. Colour on the map always means one of those, or the kind of file."],
  ["Blast radius", "What imports a file, up to two levels out, so you can see what a change reaches."],
  ["Dependency chain", "The same walk the other way: what a file imports, two levels deep."],
  ["Explanations", "A paragraph about a file or folder, written from it and its real neighbours, when you ask for one."],
  ["Coverage", "How much of the repository was parsed, and why the rest wasn't."],
];

// ---- How it works -----------------------------------------------------------------

const STEPS: readonly [term: string, description: string][] = [
  ["Fetch", "The default branch is downloaded from GitHub as one archive. The commit it describes comes from the archive itself."],
  ["Parse", "Every file is read for imports, re-exports, dynamic imports and require() calls."],
  [
    "Resolve",
    "Each one is followed to a file through path aliases, index files and extensions. Packages are counted as external, and anything that can't be followed is counted with the reason.",
  ],
  ["Draw", "Folders fold into boxes that open into their files. You watch each stage as it runs."],
];

// ---- Frameworks -------------------------------------------------------------------

type Framework = { name: string; routes: string; roles: readonly Role[] };

// A selection of each adapter's roles, by their own names and swatches from the rail.
const FRAMEWORKS: readonly Framework[] = [
  {
    name: "Next.js",
    routes: "Routes listed from the app and pages routers.",
    roles: ["page-route", "api-endpoint", "server-action", "layout", "entry-middleware"],
  },
  {
    name: "NestJS",
    routes: "Routes listed from controller decorators.",
    roles: ["controller", "gateway", "resolver", "service", "module", "guard"],
  },
  {
    name: "Express",
    routes: "Roles from the folder a file sits in.",
    roles: ["route", "controller", "class-middleware", "validator", "service", "model"],
  },
  {
    name: "React",
    routes: "Roles from folder and file names.",
    roles: ["page", "component", "hook", "context", "store"],
  },
];

// ---- What it won't do -------------------------------------------------------------

const REFUSALS: readonly [term: string, description: string][] = [
  [
    "Guess a connection",
    "A line between two files means the parser resolved a real import to a real file. An import it couldn't follow is counted with its reason and drawn as nothing. A map that's ninety percent right is worse than none, because there's no telling which ten percent is wrong.",
  ],
  [
    "Let a model draw the map",
    "The model explains what the parser found, and labels files no convention identified from a fixed list of kinds. It never adds a file or a line, and it never walks the graph. The walks are arithmetic.",
  ],
  [
    "Grade your code",
    "No scores, no severity, no issues found. It shows what depends on a file, not whether the file is any good.",
  ],
  [
    "Approximate a route",
    "If a route's method and full path can't both be read from the syntax, it isn't listed. It's counted as omitted instead.",
  ],
  [
    "Read private repositories",
    "That would need a GitHub token, and somewhere to keep it. Signing in says who you are and grants nothing on your repositories.",
  ],
  ["Read other languages", "TypeScript and JavaScript only. Getting one language right is the whole proposition."],
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col text-sm">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className={`${COLUMN} flex h-14 items-center gap-3`}>
          <span className="font-mono text-xs font-medium">traverse</span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <ThemeControl />
            <Link
              href="/sign-in"
              className="flex h-9 items-center rounded border border-border px-3 hover:bg-surface"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section aria-label="Analyse a repository" className="flex min-h-[min(calc(88svh-3.5rem),60rem)] items-center py-16 md:py-24">
          <div className={`${COLUMN} grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20`}>
            <div>
              <h1 className="max-w-[14ch] text-[clamp(2.5rem,5.6vw,4.5rem)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance">
                A map of a repository, drawn from its imports.
              </h1>
              <p className={`mt-6 text-muted ${BESIDE_FIGURE} ${BODY}`}>
                Paste a public GitHub repository. Traverse parses every TypeScript and JavaScript file, follows each
                import to the file it points at, and lays the result out as folders you can open. Every line on the
                map is an import the parser found.
              </p>
              <div className="mt-10">
                <RepositoryField />
              </div>
            </div>
            <MapIllustration />
          </div>
        </section>

        <Section label="What it does">
          <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20">
            <div className="lg:order-2">
              <h2 className={HEADING}>Pick a file. See what it touches.</h2>
              <p className={`mt-5 text-muted ${BESIDE_FIGURE} ${BODY}`}>
                Folders fold into boxes and open into their files. Select one and the map lights up what it imports
                and what imports it.
              </p>
              <dl className={`mt-10 grid gap-5 ${BESIDE_FIGURE}`}>
                {ABILITIES.map(([term, description]) => (
                  <div key={term}>
                    <dt className="font-medium">{term}</dt>
                    <dd className="mt-1 leading-relaxed text-muted">{description}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <figure className="lg:order-1">
              <ReachIllustration />
              <figcaption className={`mt-6 text-muted ${BESIDE_FIGURE}`}>
                A blast radius: the selected file on the right, everything that imports it one level out, then two.
              </figcaption>
            </figure>
          </div>
        </Section>

        <Section label="How it works">
          <div className="grid items-start gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
            <div>
              <h2 className={HEADING}>Parsed, not predicted.</h2>
              <p className={`mt-5 text-muted ${BESIDE_FIGURE} ${BODY}`}>
                The map comes from reading the code the way a compiler would. No model is ever asked what&apos;s
                connected to what.
              </p>
              <ol className={`mt-10 grid gap-5 ${BESIDE_FIGURE}`}>
                {STEPS.map(([term, description], index) => (
                  <li key={term} className="grid grid-cols-[1.75rem_minmax(0,1fr)]">
                    <span className="font-mono text-muted tabular-nums">{index + 1}</span>
                    <div>
                      <span className="font-medium">{term}</span>
                      <p className="mt-1 leading-relaxed text-muted">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <figure className="lg:pt-2">
              <ResolutionIllustration />
              <figcaption className={`mt-6 text-muted ${BESIDE_FIGURE}`}>
                One file&apos;s imports. Most end at a file. A package ends at the edge of the repository. One that
                can&apos;t be resolved ends at nothing, and is counted with its reason.
              </figcaption>
            </figure>
          </div>
        </Section>

        <Section label="Frameworks">
          <h2 className={HEADING}>It knows a few frameworks by their conventions.</h2>
          <p className={`mt-5 text-muted ${FULL_WIDTH} ${BODY}`}>
            Framework knowledge decides what kind of file something is, never whether two files are connected. Where
            a route&apos;s method and path can be read exactly, it goes in a route table with the file it came from.
          </p>
          <div className="mt-16 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-5">
            {FRAMEWORKS.map((framework) => (
              <div key={framework.name}>
                <h3 className="text-base font-medium">{framework.name}</h3>
                <p className="mt-1 leading-relaxed text-muted">{framework.routes}</p>
                <ul className="mt-4 grid gap-1.5">
                  {framework.roles.map((role) => (
                    <li key={role} className="flex items-center gap-2">
                      <span aria-hidden className={`size-2 shrink-0 rounded-[1px] ${ROLES[role].swatch}`} />
                      {ROLES[role].name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <h3 className="text-base font-medium">Anything else</h3>
              <p className="mt-1 leading-relaxed text-muted">
                Every file is still parsed and every import still drawn. Files just aren&apos;t given a framework&apos;s
                roles by convention.
              </p>
            </div>
          </div>
        </Section>

        <Section label="What it won't do">
          <h2 className={HEADING}>What it won&apos;t do.</h2>
          <p className={`mt-5 text-muted ${FULL_WIDTH} ${BODY}`}>
            Each of these sounds like an improvement. Each would make the map harder to trust, so each is left out on
            purpose.
          </p>
          <dl className="mt-16 grid gap-10">
            {REFUSALS.map(([term, description]) => (
              <div key={term} className="grid gap-2 md:grid-cols-[15rem_minmax(0,64ch)] md:gap-x-20">
                <dt className="text-base font-medium">{term}</dt>
                <dd className="leading-relaxed text-muted md:text-base">{description}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className={`${COLUMN} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-10 text-xs text-muted`}>
          <span className="font-mono text-foreground">traverse</span>
          <span>Public TypeScript and JavaScript repositories on github.com.</span>
        </div>
      </footer>
    </div>
  );
}
