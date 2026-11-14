// FR-8.5: the Body progress screen's on-model numbers (BodyModelProps.regionLabels),
// drawn like an anatomy diagram: a dot on each labelled muscle and a line
// out to its text in a column beside the body. Each region has an anchor on
// each side of the body; the shared scene (shared/BodyModelScene.tsx)
// projects anchors to screen pixels every frame, and these pure functions
// decide which labels are shown and where. The labels themselves are drawn
// by shared/RegionLabelOverlay.tsx on top of the canvas, identically on web
// and native. Pure (no three.js, no React), so both renderer adapters get
// identical layouts by construction (asserted in the cross-renderer parity
// suite).

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** One of a region's anchors, projected to screen pixels (origin top-left). */
export interface ScreenAnchor {
  x: number;
  y: number;
  /** Whether this anchor's side of the body faces the camera (see isFacingCamera). */
  facing: boolean;
}

/** One label that could be shown: its text and its region's anchors (one per side of the body). */
export interface LabelCandidate {
  regionId: string;
  text: string;
  anchors: readonly ScreenAnchor[];
}

export type LabelSide = 'left' | 'right';

export interface PlacedLabel {
  regionId: string;
  text: string;
  /** Which column the text sits in. */
  side: LabelSide;
  /** The dot on the muscle, where the line starts. */
  anchorX: number;
  anchorY: number;
  /** Where the line ends, next to the text; the text is vertically centred on y. */
  x: number;
  y: number;
}

export const LABEL_HEIGHT_PX = 16;
const LABEL_CHAR_WIDTH_PX = 6.8;
/** Vertical gap kept between two labels in a column. */
const LABEL_GAP_PX = 3;
/** How far beyond the outermost dot in a column its line ends. */
const LABEL_REACH_PX = 56;
/** Space kept between a column's text and the viewport edge. */
const EDGE_MARGIN_PX = 4;
/** Space between a line's end and its text. */
export const LABEL_TEXT_GAP_PX = 3;
/** A layout counts as unchanged while no label moves further than this. */
export const LABEL_MOVE_TOLERANCE_PX = 0.5;

/** Estimated width of a label's text, used to keep it inside the viewport. */
export function labelWidth(text: string): number {
  return Math.ceil(LABEL_CHAR_WIDTH_PX * text.length) + 2;
}

/**
 * Anchor of a region from its vertex positions (model-local, flat xyz
 * triples): the bounding-box centre of the vertices on the body's left side
 * (x >= 0). Region meshes join both sides, so the centre of the whole mesh
 * would put a bilateral muscle such as the biceps on the body's midline.
 * Midline muscles still straddle x = 0 and keep a central anchor. The
 * body is symmetric, so mirroring x gives the right-side anchor. Returns
 * null for a mesh with no vertices.
 */
export function regionAnchorFromPositions(positions: ArrayLike<number>): Point3 | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const include = (pass: 'left' | 'all') => {
    let found = false;
    for (let i = 0; i + 2 < positions.length; i += 3) {
      if (pass === 'left' && positions[i] < 0) continue;
      found = true;
      for (let a = 0; a < 3; a++) {
        const v = positions[i + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
    return found;
  };
  if (!include('left') && !include('all')) return null;
  return { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 };
}

/** Radius (model units, the body is 1.9 tall) of the slice of body around an anchor that sectionCentre averages. */
export const SECTION_RADIUS = 0.08;
/** How many horizontal view directions facingShares samples (every 45 degrees). */
export const FACING_DIRECTIONS = 8;
/** How far (model units) past its section centre a vertex must be to count toward a direction. */
const FACING_MARGIN = 0.01;
/**
 * Share of a region's vertices that must face the camera for its label to
 * show. On the real mesh the chest is 95% front and 0% back, the quadriceps
 * 63% / 8%, and muscles on the side of a limb such as the shoulders 29% /
 * 50%, so those show from both sides.
 */
export const FACING_MIN_SHARE = 0.2;

/**
 * Horizontal centre (x, z) of the body around an anchor: the mean of the
 * body vertices (flat xyz triples, body-left side x >= 0, as the anchors
 * are) within SECTION_RADIUS of it in the front view (x, y). For a limb
 * muscle that is the limb's centre, for a trunk muscle the trunk's. Null
 * when no vertex is that close.
 */
export function sectionCentre(
  bodyPositions: ArrayLike<number>,
  anchor: Point3,
  radius = SECTION_RADIUS,
): { x: number; z: number } | null {
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (let i = 0; i + 2 < bodyPositions.length; i += 3) {
    const dx = bodyPositions[i] - anchor.x;
    const dy = bodyPositions[i + 1] - anchor.y;
    if (dx * dx + dy * dy > radius * radius) continue;
    sumX += bodyPositions[i];
    sumZ += bodyPositions[i + 2];
    count++;
  }
  return count > 0 ? { x: sumX / count, z: sumZ / count } : null;
}

/** Horizontal unit direction k of FACING_DIRECTIONS: k = 0 is the front (+z), counting toward +x. */
function facingDirection(k: number): { x: number; z: number } {
  const angle = (2 * Math.PI * k) / FACING_DIRECTIONS;
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

/**
 * For each of FACING_DIRECTIONS horizontal view directions, the share of a
 * region's body-left vertices (flat xyz triples) that sit more than
 * FACING_MARGIN past the section centre toward that direction: how much of
 * the muscle a camera looking from there sees. Computed once per model, so
 * the per-frame test (isFacingCamera) is a lookup.
 */
export function facingShares(regionPositions: ArrayLike<number>, centre: { x: number; z: number }): number[] {
  const shares = new Array<number>(FACING_DIRECTIONS).fill(0);
  let count = 0;
  for (let i = 0; i + 2 < regionPositions.length; i += 3) {
    if (regionPositions[i] < 0) continue;
    count++;
    const ox = regionPositions[i] - centre.x;
    const oz = regionPositions[i + 2] - centre.z;
    for (let k = 0; k < FACING_DIRECTIONS; k++) {
      const d = facingDirection(k);
      if (ox * d.x + oz * d.z > FACING_MARGIN) shares[k]++;
    }
  }
  return shares.map((n) => (count > 0 ? n / count : 0));
}

/**
 * Whether enough of a region faces the camera for its label to show (see
 * FACING_MIN_SHARE), from its facingShares and the camera position.
 * `mirrored` is for the body-right anchor (x negated): the shares were
 * measured on the body-left side, so the view direction is mirrored too.
 */
export function isFacingCamera(
  shares: readonly number[],
  anchor: Point3,
  cameraPosition: Point3,
  mirrored = false,
): boolean {
  let toCameraX = cameraPosition.x - anchor.x;
  const toCameraZ = cameraPosition.z - anchor.z;
  if (toCameraX === 0 && toCameraZ === 0) return true;
  if (mirrored) toCameraX = -toCameraX;
  const angle = Math.atan2(toCameraX, toCameraZ);
  const k = ((Math.round((angle / (2 * Math.PI)) * FACING_DIRECTIONS) % FACING_DIRECTIONS) + FACING_DIRECTIONS) % FACING_DIRECTIONS;
  return (shares[k] ?? 0) >= FACING_MIN_SHARE;
}

interface Assigned {
  regionId: string;
  text: string;
  anchor: ScreenAnchor;
}

/** Spreads a column's labels vertically so none overlap, each as close to its dot's height as fits. */
function stackColumn(items: Assigned[], height: number): number[] {
  const step = LABEL_HEIGHT_PX + LABEL_GAP_PX;
  const top = EDGE_MARGIN_PX + LABEL_HEIGHT_PX / 2;
  const bottom = height - EDGE_MARGIN_PX - LABEL_HEIGHT_PX / 2;
  const ys = items.map((item) => item.anchor.y);
  for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], top, i > 0 ? ys[i - 1] + step : -Infinity);
  for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], bottom, i < ys.length - 1 ? ys[i + 1] - step : Infinity);
  return ys;
}

/**
 * The labels to draw. In priority order (the selected region first, then
 * the order of `candidates`) each region takes one of its anchors that faces
 * the camera and is inside the viewport, on whichever side of the screen
 * has fewer labels so far, until both columns are full. Each column's text
 * is stacked without overlaps, ending just past its outermost dot, and
 * kept inside the viewport.
 */
export function layoutRegionLabels(
  candidates: readonly LabelCandidate[],
  viewport: { width: number; height: number },
  selectedRegionId: string | null = null,
): PlacedLabel[] {
  const { width, height } = viewport;
  const midX = width / 2;
  const perColumn = Math.max(0, Math.floor((height - 2 * EDGE_MARGIN_PX + LABEL_GAP_PX) / (LABEL_HEIGHT_PX + LABEL_GAP_PX)));
  const ordered = [
    ...candidates.filter((c) => c.regionId === selectedRegionId),
    ...candidates.filter((c) => c.regionId !== selectedRegionId),
  ];
  const columns: Record<LabelSide, Assigned[]> = { left: [], right: [] };

  for (const c of ordered) {
    const usable = c.anchors.filter(
      (a) => a.facing && Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 0 && a.x <= width && a.y >= 0 && a.y <= height,
    );
    const bySide = (side: LabelSide) => {
      const onSide = usable.filter((a) => (side === 'right' ? a.x >= midX : a.x < midX));
      // The outermost anchor on that side, so its line crosses less of the body.
      return onSide.sort((a, b) => (side === 'right' ? b.x - a.x : a.x - b.x))[0];
    };
    const preferred: LabelSide = columns.left.length < columns.right.length ? 'left' : 'right';
    const other: LabelSide = preferred === 'left' ? 'right' : 'left';
    for (const side of [preferred, other]) {
      const anchor = bySide(side);
      if (!anchor || columns[side].length >= perColumn) continue;
      columns[side].push({ regionId: c.regionId, text: c.text, anchor });
      break;
    }
  }

  const placed: PlacedLabel[] = [];
  for (const side of ['left', 'right'] as const) {
    const items = columns[side].sort((a, b) => a.anchor.y - b.anchor.y || a.regionId.localeCompare(b.regionId));
    if (items.length === 0) continue;
    const widest = Math.max(...items.map((item) => labelWidth(item.text))) + LABEL_TEXT_GAP_PX;
    const x =
      side === 'right'
        ? Math.min(Math.max(...items.map((i) => i.anchor.x)) + LABEL_REACH_PX, width - EDGE_MARGIN_PX - widest)
        : Math.max(Math.min(...items.map((i) => i.anchor.x)) - LABEL_REACH_PX, EDGE_MARGIN_PX + widest);
    const ys = stackColumn(items, height);
    items.forEach((item, i) =>
      placed.push({
        regionId: item.regionId,
        text: item.text,
        side,
        anchorX: item.anchor.x,
        anchorY: item.anchor.y,
        x,
        y: ys[i],
      }),
    );
  }
  return placed;
}

/** Whether two layouts show the same labels within LABEL_MOVE_TOLERANCE_PX, so the overlay needn't re-render. */
export function sameLabelLayout(a: readonly PlacedLabel[], b: readonly PlacedLabel[]): boolean {
  if (a.length !== b.length) return false;
  const near = (p: number, q: number) => Math.abs(p - q) <= LABEL_MOVE_TOLERANCE_PX;
  return a.every((label, i) => {
    const other = b[i];
    return (
      label.regionId === other.regionId &&
      label.text === other.text &&
      label.side === other.side &&
      near(label.anchorX, other.anchorX) &&
      near(label.anchorY, other.anchorY) &&
      near(label.x, other.x) &&
      near(label.y, other.y)
    );
  });
}
