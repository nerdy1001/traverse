"use client";

import {
  getViewportForBounds,
  Handle,
  MarkerType,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { createContext, use, useEffect, useMemo, useRef } from "react";
import { type CategoryMatch, matchCategory } from "@/lib/map/categories";
import { placeBoxes, type PlacedView } from "@/lib/map/layout";
import {
  ABOVE_HANDLE,
  buildBoxes,
  buildConnections,
  endKey,
  FOLDER_HANDLE,
  type FolderBox,
  highlightOf,
  type Highlight,
  internalTargetHandleId,
  MORE_HANDLE,
  PANEL_HEADER_HEIGHT,
  type PanelBox,
  ROW_HEIGHT,
  slotHandle,
  sourceHandleId,
  targetHandleId,
  VISIBLE_ROWS,
} from "@/lib/map/view";
import type { Edge, FileNode } from "@/parser/types";
import type { MapActions, MapState } from "./use-map-state";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
/** Lets a short graph use a large canvas, without blowing a small one up. */
const MAX_FIT_ZOOM = 1.25;
const FIT_PADDING = "16px";

type FolderNode = FlowNode<{ box: FolderBox; highlight: Highlight | null }, "folder">;
type PanelNode = FlowNode<
  { box: PanelBox; offset: number; highlight: Highlight | null; reveal: string | null },
  "panel"
>;
type MapNode = FolderNode | PanelNode;

// React Flow needs node types defined once, outside render, so the handlers
// reach the nodes through context rather than being rebuilt into node data.
const MapActionsContext = createContext<MapActions | null>(null);

// The end under a hover from the pane. In context rather than node data, so the
// pointer moving only re-renders the boxes and never rebuilds the nodes or edges.
const LitEndContext = createContext<string | null>(null);

// The rail's choice. In context for the same reason, and because no box changes
// size or place for it: dimming must never move the map.
const CategoryMatchContext = createContext<CategoryMatch | null>(null);

function useMapActions(): MapActions {
  const actions = use(MapActionsContext);
  if (!actions) throw new Error("Map nodes must render inside MapCanvas");
  return actions;
}

/** Edges read these, and they stay invisible: the line is what shows where it lands. */
const handleClass = "!pointer-events-none !opacity-0";

function FolderNodeView({ data: { box, highlight } }: NodeProps<FolderNode>) {
  const { open, hover } = useMapActions();
  const lit = use(LitEndContext) === endKey(box.id, FOLDER_HANDLE);
  const match = use(CategoryMatchContext);
  const matched = match?.countByFolder.get(box.directory) ?? 0;
  const dimmed =
    !lit &&
    ((highlight !== null && !highlight.ends.has(endKey(box.id, FOLDER_HANDLE))) ||
      (match !== null && matched === 0));

  return (
    // React Flow turns pointer events off on a node that is neither draggable
    // nor selectable. Layout owns position and selection lives here, so the node
    // has to turn them back on or every click falls through to the pane.
    <button
      type="button"
      title={box.directory}
      onClick={() => open(box.directory)}
      onPointerEnter={() => hover({ kind: "folder", directory: box.directory })}
      onPointerLeave={() => hover(null)}
      className={`pointer-events-auto flex h-full w-full cursor-pointer flex-col justify-center rounded-sm border bg-surface px-3 text-left hover:border-muted ${lit ? "border-accent" : "border-border"} ${dimmed ? "opacity-25" : ""}`}
    >
      <Handle
        type="target"
        id={targetHandleId(FOLDER_HANDLE)}
        position={Position.Left}
        isConnectable={false}
        className={handleClass}
      />
      <span className="font-mono text-xs leading-4 whitespace-nowrap">{box.label}</span>
      {/* Takes the count line's place, so the box's width holds it and nothing moves. */}
      {match ? (
        <span className="text-[10px] leading-3 whitespace-nowrap tabular-nums">
          {matched} of {box.fileCount} match
        </span>
      ) : (
        <span className="flex gap-2 text-[10px] leading-3 whitespace-nowrap text-muted">
          <span>{box.fileCount} files</span>
          <span>in {box.fanIn}</span>
        </span>
      )}
      <Handle
        type="source"
        id={sourceHandleId(FOLDER_HANDLE)}
        position={Position.Right}
        isConnectable={false}
        className={handleClass}
      />
    </button>
  );
}

function RowHandles({ handle }: { handle: string }) {
  return (
    <>
      <Handle
        type="target"
        id={targetHandleId(handle)}
        position={Position.Left}
        isConnectable={false}
        className={handleClass}
      />
      <Handle
        type="source"
        id={sourceHandleId(handle)}
        position={Position.Right}
        isConnectable={false}
        className={handleClass}
      />
      <Handle
        type="target"
        id={internalTargetHandleId(handle)}
        position={Position.Right}
        isConnectable={false}
        className={handleClass}
      />
    </>
  );
}

function PanelNodeView({ data: { box, offset, highlight, reveal } }: NodeProps<PanelNode>) {
  const { close, selectFile, scrollTo, hover } = useMapActions();
  const litEnd = use(LitEndContext);
  const match = use(CategoryMatchContext);
  const scroller = useRef<HTMLDivElement>(null);

  // Moves the real scroller and lets its scroll event update the offset, the same
  // way every other scroll reaches the edges. Reads the position from the element
  // so this only runs for a new reveal, never against a scroll the user just made.
  useEffect(() => {
    const element = scroller.current;
    if (reveal === null || !element) return;
    const index = box.rows.findIndex(({ path }) => path === reveal);
    if (index === -1) return;
    const top = Math.round(element.scrollTop / ROW_HEIGHT);
    if (index < top || index >= top + VISIBLE_ROWS) element.scrollTop = index * ROW_HEIGHT;
  }, [reveal, box.rows]);

  const isLit = (handle: string) => litEnd === endKey(box.id, handle);
  const wholeBoxKept = highlight?.box === box.id;
  const isKept = (handle: string) =>
    highlight === null || wholeBoxKept || isLit(handle) || highlight.ends.has(endKey(box.id, handle));
  const anyKept =
    highlight === null ||
    wholeBoxKept ||
    litEnd?.startsWith(`${box.id}|`) ||
    [...highlight.ends].some((end) => end.startsWith(`${box.id}|`));
  const rowLitClass = "bg-background outline outline-accent -outline-offset-1";

  const matched = match?.countByFolder.get(box.directory) ?? 0;
  // What's selected or pointed at stays readable, whatever the rail has chosen.
  const holdsFocus =
    wholeBoxKept ||
    litEnd?.startsWith(`${box.id}|`) ||
    box.rows.some(({ path }) => path === highlight?.selectedPath);
  const panelDimmed = !anyKept || (match !== null && matched === 0 && !holdsFocus);

  const overflows = box.rows.length > VISIBLE_ROWS;
  const windowHeight = Math.min(box.rows.length, VISIBLE_ROWS) * ROW_HEIGHT;
  const shown = box.rows.slice(offset, offset + VISIBLE_ROWS);
  const below = box.rows.length - offset - shown.length;
  const matchesBelow =
    match === null || box.rows.slice(offset + VISIBLE_ROWS).some(({ path }) => match.files.has(path));

  // A dimmed panel already dims its contents. Dimming a row inside it as well would
  // multiply the two and lose the row altogether.
  const rowDimClass = (kept: boolean) => (kept || panelDimmed ? "" : "opacity-25");

  return (
    <div
      className={`pointer-events-auto h-full w-full rounded-sm border bg-surface ${wholeBoxKept ? "border-accent" : "border-muted"} ${panelDimmed ? "opacity-25" : ""}`}
    >
      <div className="relative border-b border-border" style={{ height: PANEL_HEADER_HEIGHT - 1 }}>
        <button
          type="button"
          title={box.directory}
          aria-expanded
          onClick={() => close(box.directory)}
          onPointerEnter={() => hover({ kind: "folder", directory: box.directory })}
          onPointerLeave={() => hover(null)}
          className={`flex h-full w-full cursor-pointer flex-col justify-center px-3 text-left hover:bg-background ${isLit(ABOVE_HANDLE) ? rowLitClass : ""}`}
        >
          <span className="font-mono text-xs leading-4 font-medium whitespace-nowrap">{box.label}</span>
          {match ? (
            <span className="text-[10px] leading-3 whitespace-nowrap tabular-nums">
              {matched} of {box.fileCount} match
            </span>
          ) : (
            <span className="flex gap-2 text-[10px] leading-3 whitespace-nowrap text-muted">
              <span>{box.fileCount} files</span>
              <span>in {box.fanIn}</span>
              <span>out {box.fanOut}</span>
            </span>
          )}
        </button>
        <RowHandles handle={ABOVE_HANDLE} />
      </div>

      {/* A real scroller over a window of fixed slots. The browser handles wheel,
          trackpad, scrollbar and keyboard, while the slots stay pinned in place so
          edges always have a row to land on. nowheel and nopan stop the canvas
          from zooming or panning instead. */}
      <div
        ref={scroller}
        onScroll={(event) =>
          scrollTo(box.directory, Math.round(event.currentTarget.scrollTop / ROW_HEIGHT))
        }
        className={`scrollbar-thin ${overflows ? "nowheel nopan overflow-y-auto" : "overflow-hidden"}`}
        style={{ height: windowHeight }}
      >
        <div style={{ height: box.rows.length * ROW_HEIGHT }}>
          <div className="sticky top-0" style={{ height: windowHeight }}>
            {shown.map(({ path, label, fanIn, fanOut }, slot) => {
              const handle = slotHandle(slot);
              const selected = highlight?.selectedPath === path;
              const inCategory = match === null || match.files.has(path) || selected || isLit(handle);
              return (
                <div key={slot} className="relative" style={{ height: ROW_HEIGHT }}>
                  <button
                    type="button"
                    title={path}
                    aria-pressed={selected}
                    onClick={() => selectFile(path)}
                    onPointerEnter={() => hover({ kind: "file", path })}
                    onPointerLeave={() => hover(null)}
                    className={`flex h-full w-full cursor-pointer items-center gap-2 px-3 text-left hover:bg-background ${rowDimClass(isKept(handle) && inCategory)} ${selected || isLit(handle) ? rowLitClass : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{label}</span>
                    <span className="w-5 text-right text-[10px] text-incoming tabular-nums">{fanIn}</span>
                    <span className="w-5 text-right text-[10px] text-outgoing tabular-nums">{fanOut}</span>
                  </button>
                  <RowHandles handle={handle} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {overflows && (
        <div className="relative" style={{ height: ROW_HEIGHT }}>
          <button
            type="button"
            disabled={below === 0}
            onClick={() => scroller.current?.scrollBy({ top: windowHeight })}
            className={`flex h-full w-full items-center justify-between px-3 text-left text-[10px] text-muted enabled:cursor-pointer enabled:hover:bg-background ${rowDimClass(isKept(MORE_HANDLE) && (matchesBelow || isLit(MORE_HANDLE)))} ${isLit(MORE_HANDLE) ? rowLitClass : ""}`}
          >
            <span>{below} more</span>
            {offset > 0 && <span>{offset} above</span>}
          </button>
          <RowHandles handle={MORE_HANDLE} />
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { folder: FolderNodeView, panel: PanelNodeView };

/**
 * Opening may only zoom out: fitting to a bigger graph can otherwise zoom in and
 * lose the rest of the map. Reads bounds from the new layout it's handed, not from
 * React Flow's nodes, which still hold the state before the change at this point.
 */
function ViewportFit({ placed, openCount }: { placed: PlacedView; openCount: number }) {
  const { getZoom, setViewport, viewportInitialized } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const fitted = useRef<{ placed: PlacedView; openCount: number } | null>(null);

  useEffect(() => {
    if (!viewportInitialized || width === 0 || height === 0) return;
    if (fitted.current?.placed === placed) return;

    const opening = fitted.current !== null && openCount > fitted.current.openCount;
    const ceiling = opening ? Math.min(getZoom(), MAX_FIT_ZOOM) : MAX_FIT_ZOOM;
    fitted.current = { placed, openCount };
    void setViewport(getViewportForBounds(placed.bounds, width, height, MIN_ZOOM, ceiling, FIT_PADDING));
  }, [getZoom, height, openCount, placed, setViewport, viewportInitialized, width]);

  return null;
}

interface MapCanvasProps {
  files: readonly FileNode[];
  edges: readonly Edge[];
  map: MapState;
}

function Canvas({
  files,
  edges,
  map: { folding, opened, offsets, selection, hovered, reveal, category, actions },
}: MapCanvasProps) {
  const boxes = useMemo(() => buildBoxes(files, folding, opened), [files, folding, opened]);
  // Placed from the boxes alone, so scrolling can't move anything or trigger a refit.
  const placed = useMemo(() => placeBoxes(boxes, folding), [boxes, folding]);
  const view = useMemo(
    () => ({ boxes, ...buildConnections(edges, boxes, folding, offsets) }),
    [boxes, edges, folding, offsets],
  );
  const highlight = useMemo(() => (selection ? highlightOf(view, selection) : null), [view, selection]);
  const litEnd = hovered?.kind === "file" ? (view.fileEnds.get(hovered.path) ?? null) : null;
  const match = useMemo(
    () => (category ? matchCategory(files, folding, category) : null),
    [files, folding, category],
  );

  const nodes = useMemo(
    () =>
      view.boxes.map((box): MapNode => {
        const position = placed.positions.get(box.id) ?? { x: 0, y: 0 };
        // Sizes are known up front. Giving them as measured also keeps React Flow
        // from discarding handle positions, and with them every edge, each time
        // a node's data changes.
        const size = {
          width: box.width,
          height: box.height,
          measured: { width: box.width, height: box.height },
        };
        // Edges always pass under a box. Dimming makes its contents translucent,
        // so the backing has to stay opaque or the lines show through it.
        const stacking = {
          zIndex: 1,
          style: { background: "var(--background)", borderRadius: "0.125rem" },
        };
        return box.kind === "folder"
          ? { id: box.id, type: "folder", position, ...size, ...stacking, data: { box, highlight } }
          : {
              id: box.id,
              type: "panel",
              position,
              ...size,
              ...stacking,
              data: { box, offset: offsets.get(box.directory) ?? 0, highlight, reveal },
            };
      }),
    [view, placed, highlight, offsets, reveal],
  );

  const flowEdges = useMemo(() => {
    const drawn = view.links.flatMap((link): FlowEdge[] => {
      const direction = highlight?.links.get(link.id);
      // Inside a panel these would be a thicket, so only the selected row's show.
      if (link.internal && !direction) return [];

      const colour = direction ? `var(--${direction})` : "var(--edge)";
      // Stays only if it joins two files of the category. A line with one matching
      // end would mostly say something about the other, dimmed, file.
      const inCategory =
        match === null || link.pairs.some(({ from, to }) => match.files.has(from) && match.files.has(to));
      return [
        {
          id: link.id,
          source: link.source,
          target: link.target,
          sourceHandle: link.sourceHandle,
          targetHandle: link.targetHandle,
          focusable: false,
          selectable: false,
          interactionWidth: 0,
          markerEnd: { type: MarkerType.ArrowClosed, color: colour, width: 14, height: 14 },
          style: {
            stroke: colour,
            strokeWidth: direction ? 1 : 0.6,
            opacity: direction || (!highlight && inCategory) ? 1 : 0.1,
          },
        },
      ];
    });
    // Later edges paint on top, so what's selected isn't buried under the rest.
    const inFront = (edge: FlowEdge) => (highlight?.links.has(edge.id) ? 1 : 0);
    return drawn.sort((a, b) => inFront(a) - inFront(b));
  }, [view, highlight, match]);

  return (
    <MapActionsContext value={actions}>
      <LitEndContext value={litEnd}>
        <CategoryMatchContext value={match}>
          <ReactFlow<MapNode, FlowEdge>
            nodes={nodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onPaneClick={actions.clearSelection}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            className="h-full w-full"
          >
            <ViewportFit placed={placed} openCount={opened.size} />
          </ReactFlow>
        </CategoryMatchContext>
      </LitEndContext>
    </MapActionsContext>
  );
}

export function MapCanvas(props: MapCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
