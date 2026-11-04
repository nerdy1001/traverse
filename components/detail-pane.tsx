"use client";

import { type ReactNode, useMemo, useState } from "react";
import { countByRole, indexNeighbours, summariseRepository } from "@/lib/map/summary";
import type { FoldedNode } from "@/lib/map/fold";
import type { Selection } from "@/lib/map/view";
import type { Edge, FileNode } from "@/parser/types";
import type { MapActions, MapState } from "./use-map-state";

/** What the repository summary shows beyond the file and edge lists. */
export interface RepositoryFacts {
  name: string;
  framework: string;
  skippedCount: number;
}

type Tab = "structure" | "explanation";

const litClass = "bg-background outline outline-accent -outline-offset-1";

function FilePath({ path }: { path: string }) {
  const slash = path.lastIndexOf("/") + 1;
  return (
    // The folder gives way first, so a long path still shows which file it is.
    <span className="flex min-w-0 flex-1 font-mono">
      <span className="min-w-0 shrink-9999 truncate text-muted">{path.slice(0, slash)}</span>
      <span className="min-w-0 truncate">{path.slice(slash)}</span>
    </span>
  );
}

interface PathRowsProps {
  rows: readonly { path: string; count?: number }[];
  countClass?: string;
  isLit(path: string): boolean;
  actions: MapActions;
}

function PathRows({ rows, countClass, isLit, actions }: PathRowsProps) {
  return (
    <ul>
      {rows.map(({ path, count }) => (
        <li key={path}>
          <button
            type="button"
            title={path}
            onClick={() => actions.revealFile(path)}
            onPointerEnter={() => actions.hover({ kind: "file", path })}
            onPointerLeave={() => actions.hover(null)}
            className={`flex h-5.5 w-full cursor-pointer items-center gap-2 px-3 text-left hover:bg-background ${isLit(path) ? litClass : ""}`}
          >
            <FilePath path={path} />
            {count !== undefined && <span className={`text-[10px] tabular-nums ${countClass}`}>{count}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <h3 className="mt-3 mb-1 flex items-baseline justify-between gap-2 px-3 font-medium">
      <span>{title}</span>
      {note && <span className="font-normal text-muted tabular-nums">{note}</span>}
    </h3>
  );
}

type Fact = [label: string, value: string | number];

function Facts({ facts }: { facts: readonly Fact[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RepositoryView({
  files,
  edges,
  facts,
  isLit,
  actions,
}: {
  files: readonly FileNode[];
  edges: readonly Edge[];
  facts: RepositoryFacts;
  isLit(path: string): boolean;
  actions: MapActions;
}) {
  const summary = useMemo(() => summariseRepository(files), [files]);
  // Only shown when true, and always counted rather than quietly dropped.
  const skipped: Fact[] = facts.skippedCount > 0 ? [["Files skipped", facts.skippedCount]] : [];
  return (
    <div className="h-full overflow-y-auto pb-3">
      <h2 className="truncate px-3 pt-3 pb-2 font-mono font-medium">{facts.name}</h2>
      <Facts
        facts={[
          ["Framework", facts.framework === "none" ? "none detected" : facts.framework],
          ["Files", files.length],
          ...skipped,
          // One per connected pair of files, so this adds up with every file's own counts.
          ["Imports", edges.length],
          // Nothing extracts routes yet. Zero would claim they were looked for.
          ["Routes", "not extracted"],
          ["No convention identified", summary.unidentifiedCount],
        ]}
      />
      <SectionHeading
        title="Most imported"
        note={`${summary.mostImported.length} of ${summary.importedCount}`}
      />
      <PathRows
        rows={summary.mostImported.map(({ path, fanIn }) => ({ path, count: fanIn }))}
        countClass="text-incoming"
        isLit={isLit}
        actions={actions}
      />
      <SectionHeading title="Nothing imports these" note={String(summary.nothingImports.length)} />
      <p className="mb-1 px-3 text-muted">Where reading starts. Ranked by how much each one imports.</p>
      <PathRows
        rows={summary.nothingImports.map(({ path, fanOut }) => ({ path, count: fanOut }))}
        countClass="text-outgoing"
        isLit={isLit}
        actions={actions}
      />
    </div>
  );
}

function FileStructure({
  file,
  dependsOn,
  dependents,
  isLit,
  actions,
}: {
  file: FileNode;
  dependsOn: readonly string[];
  dependents: readonly string[];
  isLit(path: string): boolean;
  actions: MapActions;
}) {
  return (
    <>
      <Facts
        facts={[
          ["Kind", file.role],
          ["Lines", file.lines],
        ]}
      />
      {/* Counted from the rows below rather than read from elsewhere, so they can't disagree. */}
      <SectionHeading title="Depends on" note={String(dependsOn.length)} />
      <PathRows rows={dependsOn.map((path) => ({ path }))} isLit={isLit} actions={actions} />
      <SectionHeading title="Depended on by" note={String(dependents.length)} />
      <PathRows rows={dependents.map((path) => ({ path }))} isLit={isLit} actions={actions} />
    </>
  );
}

function FolderStructure({ node, held }: { node: FoldedNode; held: readonly FileNode[] }) {
  return (
    <>
      <Facts
        facts={[
          ["Files", node.files.length],
          ["Files outside importing it", node.fanIn],
          ["Files outside it imports", node.fanOut],
        ]}
      />
      <SectionHeading title="Kinds of file" />
      <ul>
        {countByRole(held).map(([role, count]) => (
          <li key={role} className="flex h-5.5 items-center gap-2 px-3">
            <span aria-hidden className="size-2 shrink-0 rounded-[1px] bg-role-generic" />
            <span className="min-w-0 flex-1 truncate">{role}</span>
            <span className="text-muted tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Tabbed({
  title,
  isTitleLit,
  tab,
  onTab,
  selectionKey,
  children,
}: {
  title: string;
  isTitleLit: boolean;
  tab: Tab;
  onTab(tab: Tab): void;
  selectionKey: string;
  children: ReactNode;
}) {
  const tabs: [Tab, string][] = [
    ["structure", "Structure"],
    ["explanation", "Explanation"],
  ];
  return (
    <div className="flex h-full flex-col">
      <h2
        title={title}
        className={`flex min-h-9 shrink-0 items-center px-3 py-2 font-medium ${isTitleLit ? litClass : ""}`}
      >
        <FilePath path={title} />
      </h2>
      <div role="tablist" className="flex shrink-0 border-b border-border px-1">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={`-mb-px cursor-pointer border-b px-2 py-1 ${tab === id ? "border-accent" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Keyed by the selection so a new one starts at the top of its lists. */}
      <div key={selectionKey} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto py-3">
        {tab === "structure" ? (
          children
        ) : (
          <p className="px-3 text-muted">No explanation yet.</p>
        )}
      </div>
    </div>
  );
}

function selectionKeyOf(selection: Selection): string {
  return selection.kind === "file" ? `file:${selection.path}` : `folder:${selection.directory}`;
}

export function DetailPane({
  files,
  edges,
  facts,
  map: { folding, selection, hovered, actions },
}: {
  files: readonly FileNode[];
  edges: readonly Edge[];
  facts: RepositoryFacts;
  map: MapState;
}) {
  // Held here rather than per selection, so it survives the selection changing.
  const [tab, setTab] = useState<Tab>("structure");

  const fileByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const neighbours = useMemo(() => indexNeighbours(files, edges), [files, edges]);

  // Hovering a folder on the map lights every row it holds. Paths go through a set,
  // so a pane listing hundreds of rows stays instant while the pointer moves.
  const hoveredFolderFiles = useMemo(() => {
    if (hovered?.kind !== "folder") return null;
    const node = folding.nodes.find(({ directory }) => directory === hovered.directory);
    return new Set(node?.files);
  }, [folding, hovered]);
  const isLit = (path: string) =>
    (hovered?.kind === "file" && hovered.path === path) || (hoveredFolderFiles?.has(path) ?? false);

  if (selection === null) {
    return <RepositoryView files={files} edges={edges} facts={facts} isLit={isLit} actions={actions} />;
  }

  const shared = { tab, onTab: setTab, selectionKey: selectionKeyOf(selection) };

  if (selection.kind === "file") {
    const file = fileByPath.get(selection.path);
    const links = neighbours.get(selection.path);
    if (!file || !links) throw new Error(`Selected file ${selection.path} is not in the file list`);
    return (
      <Tabbed title={file.path} isTitleLit={isLit(file.path)} {...shared}>
        <FileStructure
          file={file}
          dependsOn={links.dependsOn}
          dependents={links.dependents}
          isLit={isLit}
          actions={actions}
        />
      </Tabbed>
    );
  }

  const node = folding.nodes.find(({ directory }) => directory === selection.directory);
  if (!node) throw new Error(`Selected folder ${selection.directory} is not on the map`);
  const held = node.files.flatMap((path) => fileByPath.get(path) ?? []);
  return (
    <Tabbed
      title={node.directory}
      isTitleLit={hovered?.kind === "folder" && hovered.directory === node.directory}
      {...shared}
    >
      <FolderStructure node={node} held={held} />
    </Tabbed>
  );
}
