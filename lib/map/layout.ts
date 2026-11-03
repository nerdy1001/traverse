import { graphlib, layout } from "@dagrejs/dagre";
import type { Folding } from "./fold.ts";
import type { Box } from "./view.ts";

/**
 * How many of each folder's links shape the layout. Real repositories are
 * dense and cyclic, and giving dagre every link strings the nodes across a dozen
 * ranks, too wide to read at any zoom. This only decides position: every edge the
 * parser found is still drawn.
 */
const LINKS_SHAPING_LAYOUT = 2;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedView {
  /** Top-left corner of each box, by id. */
  positions: Map<string, { x: number; y: number }>;
  bounds: Rect;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Each folder's heaviest outgoing links, with ties broken by name so the choice is stable. */
function shapingLinks(folding: Folding): { from: string; to: string }[] {
  return folding.nodes.flatMap(({ directory }) =>
    folding.edges
      .filter(({ from }) => from === directory)
      .sort((a, b) => b.count - a.count || compare(a.to, b.to))
      .slice(0, LINKS_SHAPING_LAYOUT),
  );
}

/**
 * Deterministic: the input is sorted and dagre uses no randomness, so the same
 * data and open folders give the same positions. The shaping links come from the
 * folded map, so opening a folder doesn't change which links count, and scrolling
 * a panel can't move anything.
 */
export function placeBoxes(boxes: readonly Box[], folding: Folding): PlacedView {
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 10, ranksep: 48, edgesep: 2 });
  graph.setDefaultEdgeLabel(() => ({}));

  const idOf = new Map(boxes.map(({ directory, id }) => [directory, id]));
  for (const { id, width, height } of boxes) graph.setNode(id, { width, height });
  for (const { from, to } of shapingLinks(folding)) {
    const source = idOf.get(from);
    const target = idOf.get(to);
    if (source !== undefined && target !== undefined) graph.setEdge(source, target);
  }

  layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const { id, width, height } of boxes) {
    // Dagre gives centres. React Flow wants corners.
    const { x: centreX, y: centreY } = graph.node(id);
    const x = Math.round(centreX - width / 2);
    const y = Math.round(centreY - height / 2);
    positions.set(id, { x, y });
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }

  return { positions, bounds: { x: left, y: top, width: right - left, height: bottom - top } };
}
