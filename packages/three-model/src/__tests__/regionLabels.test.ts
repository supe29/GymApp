import {
  facingShares,
  isFacingCamera,
  LABEL_HEIGHT_PX,
  labelWidth,
  layoutRegionLabels,
  regionAnchorFromPositions,
  sameLabelLayout,
  sectionCentre,
  type LabelCandidate,
} from '../regionLabels';

const viewport = { width: 320, height: 360 };

/** A region with mirrored anchors `dx` px either side of the screen centre, both facing unless said otherwise. */
function candidate(regionId: string, dx: number, y: number, facing: [boolean, boolean] = [true, true], text = '50%'): LabelCandidate {
  return {
    regionId,
    text,
    anchors: [
      { x: 160 + dx, y, facing: facing[0] },
      { x: 160 - dx, y, facing: facing[1] },
    ],
  };
}

function expectPoint(actual: { x: number; y: number; z: number } | null, expected: { x: number; y: number; z: number }) {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(expected.x);
  expect(actual!.y).toBeCloseTo(expected.y);
  expect(actual!.z).toBeCloseTo(expected.z);
}

describe('regionAnchorFromPositions', () => {
  test('anchors a bilateral mesh on the body-left side, not the midline', () => {
    // Two boxes mirrored across x = 0 (like both biceps in one region mesh).
    const positions = [-0.3, 1.1, 0, -0.2, 1.3, 0.05, 0.2, 1.1, 0, 0.3, 1.3, 0.05];
    expectPoint(regionAnchorFromPositions(positions), { x: 0.25, y: 1.2, z: 0.025 });
  });

  test('keeps a central anchor for a midline mesh', () => {
    // A sheet spanning x = -0.1..0.1 (like the abs): its left half is 0..0.1.
    const positions = [-0.1, 1, 0.1, 0, 1, 0.12, 0.1, 1.2, 0.1];
    expectPoint(regionAnchorFromPositions(positions), { x: 0.05, y: 1.1, z: 0.11 });
  });

  test('falls back to every vertex for a mesh entirely on the right side', () => {
    expectPoint(regionAnchorFromPositions([-0.4, 1, 0, -0.2, 2, 0]), { x: -0.3, y: 1.5, z: 0 });
  });

  test('returns null for a mesh with no vertices', () => {
    expect(regionAnchorFromPositions([])).toBeNull();
  });
});

describe('sectionCentre', () => {
  test('averages only the vertices near the anchor in the front view', () => {
    const arm = [0.2, 1.3, 0.04, 0.22, 1.35, -0.06];
    const farAway = [0.1, 0.5, 0.5];
    const centre = sectionCentre([...arm, ...farAway], { x: 0.21, y: 1.32, z: 0.03 });
    expect(centre!.x).toBeCloseTo(0.21);
    expect(centre!.z).toBeCloseTo(-0.01);
  });

  test('is null with no vertex nearby', () => {
    expect(sectionCentre([0.1, 0.5, 0], { x: 0.2, y: 1.3, z: 0 })).toBeNull();
  });
});

describe('facingShares / isFacingCamera', () => {
  const front = { x: 0, y: 1, z: 3 };
  const back = { x: 0, y: 1, z: -3 };
  const side = { x: 3, y: 1, z: 0 };
  const centre = { x: 0.1, z: 0 };
  // Vertices in front of the centre only (like the chest), behind only (like the glutes), and wrapping round (like the shoulders).
  const chest = [0.1, 1.4, 0.08, 0.12, 1.4, 0.06, 0.14, 1.45, 0.05];
  const glutes = [0.1, 0.9, -0.08, 0.12, 0.9, -0.06];
  const shoulder = [0.1, 1.5, 0.05, 0.1, 1.5, -0.05, 0.2, 1.5, 0];
  const anchor = { x: 0.12, y: 1.4, z: 0 };

  test('front muscles face a front camera, back muscles do not', () => {
    expect(isFacingCamera(facingShares(chest, centre), anchor, front)).toBe(true);
    expect(isFacingCamera(facingShares(glutes, centre), anchor, front)).toBe(false);
  });

  test('turning to the back swaps them', () => {
    expect(isFacingCamera(facingShares(chest, centre), anchor, back)).toBe(false);
    expect(isFacingCamera(facingShares(glutes, centre), anchor, back)).toBe(true);
  });

  test('a muscle wrapping round a limb shows from both sides', () => {
    const shares = facingShares(shoulder, centre);
    expect(isFacingCamera(shares, anchor, front)).toBe(true);
    expect(isFacingCamera(shares, anchor, back)).toBe(true);
  });

  test('the mirrored (body-right) anchor faces the opposite side camera', () => {
    // Shoulder vertices extend toward +x (body-left), so a camera on +x sees the left one, not the right.
    const shares = facingShares(shoulder, centre);
    expect(isFacingCamera(shares, anchor, side)).toBe(true);
    expect(isFacingCamera(shares, { ...anchor, x: -anchor.x }, side, true)).toBe(false);
  });

  test('ignores body-right vertices', () => {
    expect(facingShares([-0.3, 1, 0.5], centre).every((share) => share === 0)).toBe(true);
  });
});

describe('layoutRegionLabels', () => {
  test('hides a region with no anchor facing the camera or inside the viewport', () => {
    const placed = layoutRegionLabels(
      [candidate('chest', 40, 100), candidate('glutes', 30, 200, [false, false]), candidate('calves', 400, 300)],
      viewport,
    );
    expect(placed.map((l) => l.regionId)).toEqual(['chest']);
  });

  test('alternates columns so both sides of the body are used', () => {
    const placed = layoutRegionLabels([candidate('chest', 40, 100), candidate('abs', 20, 150), candidate('quads', 30, 250)], viewport);
    const side = Object.fromEntries(placed.map((l) => [l.regionId, l.side]));
    expect(side).toEqual({ chest: 'right', abs: 'left', quads: 'right' });
  });

  test('uses the anchor on the label side, so the line does not cross the body', () => {
    const placed = layoutRegionLabels([candidate('chest', 40, 100), candidate('abs', 20, 150)], viewport);
    const chest = placed.find((l) => l.regionId === 'chest')!;
    const abs = placed.find((l) => l.regionId === 'abs')!;
    expect(chest.anchorX).toBe(200);
    expect(chest.x).toBeGreaterThan(chest.anchorX);
    expect(abs.anchorX).toBe(140);
    expect(abs.x).toBeLessThan(abs.anchorX);
  });

  test('a region facing on one side only goes in that column', () => {
    const [biceps] = layoutRegionLabels([candidate('chest', 40, 100), candidate('biceps', 60, 120, [true, false])], viewport).filter(
      (l) => l.regionId === 'biceps',
    );
    expect(biceps.side).toBe('right');
  });

  test('stacks labels in a column without overlap and inside the viewport', () => {
    const many = Array.from({ length: 6 }, (_, i) => candidate(`m${i}`, 50, 350, [true, false]));
    const placed = layoutRegionLabels(many, viewport);
    const ys = placed.map((l) => l.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(LABEL_HEIGHT_PX);
    expect(Math.max(...ys) + LABEL_HEIGHT_PX / 2).toBeLessThanOrEqual(viewport.height);
    for (const l of placed) expect(l.x + labelWidth(l.text)).toBeLessThanOrEqual(viewport.width);
  });

  test('drops the lowest-priority labels once both columns are full, keeping the selected one', () => {
    const short = { width: 320, height: 60 };
    const placed = layoutRegionLabels(
      Array.from({ length: 8 }, (_, i) => candidate(`m${i}`, 40, 30)),
      short,
      'm7',
    );
    expect(placed.length).toBeLessThan(8);
    expect(placed.map((l) => l.regionId)).toContain('m7');
    expect(placed.map((l) => l.regionId)).not.toContain('m6');
  });
});

describe('sameLabelLayout', () => {
  const layout = [{ regionId: 'chest', text: '50%', side: 'right' as const, anchorX: 200, anchorY: 100, x: 240, y: 100 }];

  test('ignores sub-pixel movement', () => {
    expect(sameLabelLayout(layout, [{ ...layout[0], anchorX: 200.3 }])).toBe(true);
  });

  test('notices movement, text changes and different labels', () => {
    expect(sameLabelLayout(layout, [{ ...layout[0], anchorY: 102 }])).toBe(false);
    expect(sameLabelLayout(layout, [{ ...layout[0], text: '60%' }])).toBe(false);
    expect(sameLabelLayout(layout, [])).toBe(false);
  });
});
