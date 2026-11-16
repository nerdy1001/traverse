// Drawings of the map, not captures of it. Nothing in them is labelled: a box with a
// name on it is a claim about somebody's code, so names are drawn as bars. Every
// colour comes from the canvas's own tokens through Tailwind's fill and stroke
// utilities, which is what lets them switch theme along with everything else.
//
// They're laid out the way the map lays out: left to right, importers on the left,
// lines arriving at a box's left edge and leaving from its right.

import type { ReactNode } from "react";

type Tone = "incoming" | "outgoing" | "plain" | "faint";

const EDGE: Record<Tone, string> = {
  incoming: "stroke-incoming",
  outgoing: "stroke-outgoing",
  plain: "stroke-muted",
  faint: "stroke-edge",
};

// Strokes stay one device pixel wide at any size, as they do on the canvas.
const HAIRLINE = { vectorEffect: "non-scaling-stroke" } as const;

function Figure({ viewBox, children }: { viewBox: string; children: ReactNode }) {
  return (
    <svg viewBox={viewBox} aria-hidden fill="none" className="block h-auto w-full max-w-full">
      {children}
    </svg>
  );
}

/** One elbow, the shape the canvas draws between ranks. */
function Edge({ from, to, bend, tone }: { from: [number, number]; to: [number, number]; bend: number; tone: Tone }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const d = y1 === y2 ? `M${x1} ${y1}H${x2}` : `M${x1} ${y1}H${bend}V${y2}H${x2}`;
  return <path d={d} className={EDGE[tone]} strokeWidth={1} style={HAIRLINE} />;
}

/** A collapsed folder: a name and a line of counts, both drawn as bars. */
function Box({ x, y, w = 120, h = 52, lit = false }: { x: number; y: number; w?: number; h?: number; lit?: boolean }) {
  return (
    <g>
      <rect
        x={x + 0.5}
        y={y + 0.5}
        width={w}
        height={h}
        rx={2}
        className={`fill-surface ${lit ? "stroke-accent" : "stroke-border"}`}
        style={HAIRLINE}
      />
      <rect x={x + 12} y={y + h / 2 - 8} width={w * 0.52} height={6} rx={1} className={lit ? "fill-foreground" : "fill-muted"} />
      <rect x={x + 12} y={y + h / 2 + 4} width={w * 0.3} height={4} rx={1} className="fill-border" />
    </g>
  );
}

// ---- The hero: a folder opened into its files, one of them selected ---------------

const PANEL = { x: 230, y: 50, w: 160, header: 48, row: 30 };
const ROW_WIDTHS = [70, 54, 82, 62, 48, 76, 58, 66];
const SELECTED_ROW = 2;
const rowCentre = (index: number) => PANEL.y + PANEL.header + PANEL.row * index + PANEL.row / 2;

export function MapIllustration() {
  const panelHeight = PANEL.header + PANEL.row * ROW_WIDTHS.length;
  const left = PANEL.x;
  const right = PANEL.x + PANEL.w;
  const selected = rowCentre(SELECTED_ROW);

  return (
    <Figure viewBox="0 0 600 400">
      {/* What isn't connected to the selection sits back, as it does on the canvas. */}
      <g opacity={0.45}>
        <Edge from={[140, 266]} to={[left, rowCentre(5)]} bend={190} tone="faint" />
        <Edge from={[140, 356]} to={[left, rowCentre(7)]} bend={205} tone="faint" />
        <Edge from={[right, rowCentre(4)]} to={[470, 276]} bend={425} tone="faint" />
        <Edge from={[right, rowCentre(6)]} to={[470, 356]} bend={440} tone="faint" />
        <Box x={10} y={240} w={130} />
        <Box x={10} y={330} w={130} />
        <Box x={470} y={250} />
        <Box x={470} y={330} />
      </g>

      <Edge from={[140, 56]} to={[left, selected]} bend={180} tone="incoming" />
      <Edge from={[140, selected]} to={[left, selected]} bend={185} tone="incoming" />
      <Edge from={[right, selected]} to={[470, 56]} bend={430} tone="outgoing" />
      <Edge from={[right, selected]} to={[470, selected]} bend={430} tone="outgoing" />

      <Box x={10} y={30} w={130} />
      <Box x={10} y={selected - 26} w={130} />
      <Box x={470} y={30} />
      <Box x={470} y={selected - 26} />

      {/* The open folder: a header, then one row per file with its two counts. */}
      <rect
        x={left + 0.5}
        y={PANEL.y + 0.5}
        width={PANEL.w}
        height={panelHeight}
        rx={2}
        className="fill-surface stroke-muted"
        style={HAIRLINE}
      />
      <rect x={left + 12} y={PANEL.y + 15} width={64} height={6} rx={1} className="fill-foreground" />
      <rect x={left + 12} y={PANEL.y + 28} width={92} height={4} rx={1} className="fill-border" />
      <path d={`M${left} ${PANEL.y + PANEL.header + 0.5}H${right}`} className="stroke-border" style={HAIRLINE} />

      {ROW_WIDTHS.map((width, index) => {
        const centre = rowCentre(index);
        const isSelected = index === SELECTED_ROW;
        return (
          <g key={index}>
            {isSelected && (
              <rect
                x={left + 0.5}
                y={centre - PANEL.row / 2 + 0.5}
                width={PANEL.w}
                height={PANEL.row - 1}
                className="fill-background stroke-accent"
                style={HAIRLINE}
              />
            )}
            <rect
              x={left + 12}
              y={centre - 3}
              width={width}
              height={6}
              rx={1}
              className={isSelected ? "fill-foreground" : "fill-muted"}
              opacity={isSelected ? 1 : 0.6}
            />
            <rect x={right - 46} y={centre - 2} width={12} height={4} rx={1} className={isSelected ? "fill-incoming" : "fill-border"} />
            <rect x={right - 26} y={centre - 2} width={12} height={4} rx={1} className={isSelected ? "fill-outgoing" : "fill-border"} />
          </g>
        );
      })}
    </Figure>
  );
}

// ---- Blast radius: everything that leads to one file, a rank per level -------------

export function ReachIllustration() {
  const levelOne = [60, 154, 248];
  const levelTwo = [10, 82, 154, 226, 298];
  // Which first-level box each second-level box imports.
  const feeds = [0, 0, 1, 2, 2];
  const target = 180;

  return (
    <Figure viewBox="0 0 520 352">
      {levelTwo.map((y, index) => (
        <Edge
          key={`two-${index}`}
          from={[140, y + 26]}
          to={[200, levelOne[feeds[index]] + 26]}
          bend={170}
          tone="incoming"
        />
      ))}
      {levelOne.map((y, index) => (
        <Edge key={`one-${index}`} from={[320, y + 26]} to={[380, target]} bend={350} tone="incoming" />
      ))}
      {levelTwo.map((y, index) => (
        <Box key={`two-${index}`} x={20} y={y} />
      ))}
      {levelOne.map((y, index) => (
        <Box key={`one-${index}`} x={200} y={y} />
      ))}
      <Box x={380} y={target - 26} lit />
    </Figure>
  );
}

// ---- Resolution: each import ends at a real file, outside the repository, or nowhere

const LINE_WIDTHS = [96, 120, 84, 72, 108, 90];
const lineCentre = (index: number) => 70 + 40 * index;

export function ResolutionIllustration() {
  const source = { x: 20, y: 20, w: 200, h: 300 };
  const out = source.x + source.w;

  return (
    <Figure viewBox="0 0 520 340">
      <Edge from={[out, lineCentre(0)]} to={[340, 66]} bend={280} tone="plain" />
      <Edge from={[out, lineCentre(1)]} to={[340, 166]} bend={290} tone="plain" />
      <Edge from={[out, lineCentre(2)]} to={[340, 66]} bend={300} tone="plain" />
      <Edge from={[out, lineCentre(5)]} to={[340, 276]} bend={310} tone="plain" />

      {/* A package: the line reaches the edge of the repository and stops at a mark. */}
      <path d={`M${out} ${lineCentre(3)}H286`} className="stroke-muted" style={HAIRLINE} />
      <circle cx={290} cy={lineCentre(3)} r={4} className="fill-background stroke-muted" style={HAIRLINE} />

      {/* Unresolved: it leaves the file and arrives nowhere. Counted, never drawn to a guess. */}
      <path d={`M${out} ${lineCentre(4)}H272`} className="stroke-muted" strokeDasharray="3 3" style={HAIRLINE} />
      <path d={`M272 ${lineCentre(4) - 6}V${lineCentre(4) + 6}`} className="stroke-muted" style={HAIRLINE} />

      <rect
        x={source.x + 0.5}
        y={source.y + 0.5}
        width={source.w}
        height={source.h}
        rx={2}
        className="fill-surface stroke-accent"
        style={HAIRLINE}
      />
      {LINE_WIDTHS.map((width, index) => (
        <g key={index}>
          <rect x={source.x + 16} y={lineCentre(index) - 3} width={28} height={6} rx={1} className="fill-muted" />
          <rect x={source.x + 52} y={lineCentre(index) - 3} width={width} height={6} rx={1} className="fill-border" />
        </g>
      ))}

      <Box x={340} y={40} w={160} />
      <Box x={340} y={140} w={160} />
      <Box x={340} y={250} w={160} />
    </Figure>
  );
}
