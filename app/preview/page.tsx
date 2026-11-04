import { MapWorkspace } from "@/components/map-workspace";
import { parseResult } from "./parse-result";

// Scaffolding: builds the interface with no account, database or network. Sits
// outside the workspace layout because that layout needs a signed-in user. Goes
// away, along with its data file and its entry in proxy.ts, once analyses are
// stored properly.
export default function PreviewPage() {
  const { repository, adapter, files, edges, routes, coverage } = parseResult;
  return (
    <div className="h-screen">
      <MapWorkspace
        files={files}
        edges={edges}
        routes={routes}
        omittedRoutes={coverage.omittedRoutes}
        sourceBase={null}
        facts={{
          name: repository.name,
          framework: adapter,
          skippedCount: coverage.files.skipped,
          routeCount: routes.length,
        }}
      />
    </div>
  );
}
