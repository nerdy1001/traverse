import type { OmittedRoute, Route } from "@/parser/types";

/** Reads the code the row came from, at the commit that was analysed. */
function SourceLink({ path, line, sourceBase }: { path: string; line: number; sourceBase: string | null }) {
  const label = `${path}:${line}`;
  if (!sourceBase) return <span className="break-all text-muted">{label}</span>;
  return (
    <a
      href={`${sourceBase}/${path.split("/").map(encodeURIComponent).join("/")}#L${line}`}
      target="_blank"
      rel="noreferrer"
      className="break-all text-muted hover:text-foreground hover:underline"
    >
      {label}
    </a>
  );
}

const headingClass = "sticky top-0 border-b border-border bg-surface px-3 py-1.5 text-left font-medium";

export function RouteTable({
  routes,
  omitted,
  framework,
  sourceBase,
}: {
  routes: readonly Route[];
  omitted: readonly OmittedRoute[];
  framework: string;
  sourceBase: string | null;
}) {
  return (
    // Starts below the map's floating controls, which stay in place over this view.
    <div className="h-full overflow-auto bg-background pt-11">
      {routes.length === 0 ? (
        <p className="px-3 pb-3 text-muted">
          {framework === "none"
            ? "No framework was detected, so no routes were read."
            : "No route could be read exactly from this repository."}
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={`${headingClass} w-20`}>
                Method
              </th>
              <th scope="col" className={headingClass}>
                Pattern
              </th>
              <th scope="col" className={headingClass}>
                Read from
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {routes.map(({ method, pattern, path, line }) => (
              <tr key={`${path}:${method}:${pattern}`} className="border-b border-border align-top hover:bg-surface">
                <td className="px-3 py-1">{method}</td>
                <td className="px-3 py-1 break-all">{pattern}</td>
                <td className="px-3 py-1">
                  <SourceLink path={path} line={line} sourceBase={sourceBase} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {omitted.length > 0 && (
        <section className="mt-6 pb-4">
          <h3 className="px-3 font-medium">Not listed: {omitted.length}</h3>
          <p className="px-3 pb-2 text-muted">These look like routes, but their method or pattern can&apos;t be read exactly.</p>
          <ul>
            {omitted.map(({ path, line, reason }) => (
              <li key={`${path}:${line}:${reason}`} className="border-t border-border px-3 py-1">
                <div className="font-mono">
                  <SourceLink path={path} line={line} sourceBase={sourceBase} />
                </div>
                <div>{reason}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
