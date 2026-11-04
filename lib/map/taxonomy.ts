// The rail's vocabulary, as plain data. It imports nothing, so a browser component
// can read it without pulling a parser and a filesystem library into the bundle, and
// the adapters take their role names from here so the two can't drift apart.

// Colour says which tier a role sits in: what's routable, what composes it, what a
// request passes through, the layers behind, then the plumbing roles of their own.
const SURFACE = "bg-role-page";
const COMPOSITION = "bg-role-layout";
const PIPELINE = "bg-role-middleware";
const LAYER = "bg-role-layer";

/**
 * reachedWithoutImport: a framework, test runner or compiler reaches these by
 * convention, so nothing importing one says nothing about it.
 */
export const ROLES = {
  "page-route": { name: "Page routes", swatch: SURFACE, reachedWithoutImport: true },
  "api-endpoint": { name: "API endpoints", swatch: SURFACE, reachedWithoutImport: true },
  "server-action": { name: "Server actions", swatch: SURFACE, reachedWithoutImport: false },
  controller: { name: "Controllers", swatch: SURFACE, reachedWithoutImport: false },
  gateway: { name: "Gateways", swatch: SURFACE, reachedWithoutImport: false },
  resolver: { name: "Resolvers", swatch: SURFACE, reachedWithoutImport: false },
  page: { name: "Pages", swatch: SURFACE, reachedWithoutImport: false },
  layout: { name: "Layouts", swatch: COMPOSITION, reachedWithoutImport: true },
  metadata: { name: "Metadata files", swatch: COMPOSITION, reachedWithoutImport: true },
  module: { name: "Modules", swatch: COMPOSITION, reachedWithoutImport: false },
  // Two roles under one name: one file the framework finds by position, one class a
  // module imports. Only the second says anything by having no importer.
  "entry-middleware": { name: "Middleware", swatch: PIPELINE, reachedWithoutImport: true },
  "class-middleware": { name: "Middleware", swatch: PIPELINE, reachedWithoutImport: false },
  guard: { name: "Guards", swatch: PIPELINE, reachedWithoutImport: false },
  interceptor: { name: "Interceptors", swatch: PIPELINE, reachedWithoutImport: false },
  pipe: { name: "Pipes", swatch: PIPELINE, reachedWithoutImport: false },
  filter: { name: "Filters", swatch: PIPELINE, reachedWithoutImport: false },
  service: { name: "Services", swatch: LAYER, reachedWithoutImport: false },
  repository: { name: "Repositories", swatch: LAYER, reachedWithoutImport: false },
  entity: { name: "Entities", swatch: LAYER, reachedWithoutImport: false },
  schema: { name: "Schemas", swatch: LAYER, reachedWithoutImport: false },
  dto: { name: "DTOs", swatch: LAYER, reachedWithoutImport: false },
  component: { name: "Components", swatch: LAYER, reachedWithoutImport: false },
  hook: { name: "Hooks", swatch: LAYER, reachedWithoutImport: false },
  context: { name: "Contexts", swatch: LAYER, reachedWithoutImport: false },
  store: { name: "Stores", swatch: LAYER, reachedWithoutImport: false },
  generic: { name: "Generic", swatch: "bg-role-generic", reachedWithoutImport: false },
  config: { name: "Config", swatch: "bg-role-config", reachedWithoutImport: true },
  test: { name: "Tests", swatch: "bg-role-test", reachedWithoutImport: true },
  declaration: { name: "Declarations", swatch: "bg-role-declaration", reachedWithoutImport: true },
} as const;

export type Role = keyof typeof ROLES;

const PLUMBING: readonly Role[] = ["generic", "config", "test", "declaration"];

// Reading order, and it stays fixed: routable surfaces, then the layers behind them,
// then plumbing. Every role is always listed, so a category sits in the same place
// across repositories of a framework whether or not this one has any.
const FRAMEWORKS: Record<string, { label: string; roles: readonly Role[] }> = {
  nextjs: {
    label: "Next.js",
    roles: [
      "page-route",
      "api-endpoint",
      "server-action",
      "layout",
      "entry-middleware",
      "metadata",
      "component",
      "hook",
      ...PLUMBING,
    ],
  },
  nestjs: {
    label: "NestJS",
    roles: [
      "controller",
      "gateway",
      "resolver",
      "service",
      "repository",
      "module",
      "entity",
      "schema",
      "dto",
      "guard",
      "interceptor",
      "pipe",
      "filter",
      "class-middleware",
      ...PLUMBING,
    ],
  },
  react: {
    label: "React",
    roles: ["page", "component", "hook", "context", "store", ...PLUMBING],
  },
  none: { label: "none detected", roles: PLUMBING },
};

function frameworkOf(adapter: string) {
  // Hasn't been taught this adapter: guessing a rail would hide files, so say so.
  if (!Object.hasOwn(FRAMEWORKS, adapter)) throw new Error(`No rail taxonomy for adapter "${adapter}"`);
  return FRAMEWORKS[adapter];
}

export function rolesFor(adapter: string): readonly Role[] {
  return frameworkOf(adapter).roles;
}

export function frameworkLabel(adapter: string): string {
  return frameworkOf(adapter).label;
}

export function isRole(value: string): value is Role {
  return Object.hasOwn(ROLES, value);
}
