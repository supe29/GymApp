// FR-8.5: draws the on-model numbers laid out by ../regionLabels.ts on top
// of the 3D canvas, like an anatomy diagram: plain black text beside the
// body and a black arrow from it that runs out horizontally, bends, and
// points into the muscle. Every line and arrowhead has a thin white edge so
// it stays visible where it crosses the grey body.
// Lines are SVG (react-native-svg, which also renders on web) and the text is
// plain React Native, so the same component works in both adapters. It never
// takes touches, so taps and drags still reach the model underneath. Hidden
// from screen readers: the Body progress list carries the same numbers
// accessibly.

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { LABEL_HEIGHT_PX, LABEL_TEXT_GAP_PX, labelWidth, type PlacedLabel } from '../regionLabels';

const INK = '#111111';
const HALO = '#ffffff';
/** Length of the horizontal stroke that starts each arrow at its text. */
const LEADER_SHELF_PX = 12;
/** Arrowhead length and half-width. */
const ARROW_LENGTH_PX = 6;
const ARROW_HALF_WIDTH_PX = 2.5;

/** Where the arrow bends: no further out than the muscle, so the line never doubles back. */
function bendX(label: PlacedLabel): number {
  return label.side === 'right'
    ? Math.max(label.anchorX, label.x - LEADER_SHELF_PX)
    : Math.min(label.anchorX, label.x + LEADER_SHELF_PX);
}

/**
 * The arrow's shaft (text end -> bend -> base of the arrowhead) and its
 * arrowhead, whose tip is on the muscle and which points along the last
 * segment of the shaft.
 */
function arrowGeometry(label: PlacedLabel): { shaft: string; head: string } {
  const bx = bendX(label);
  let dx = label.anchorX - bx;
  let dy = label.anchorY - label.y;
  let length = Math.hypot(dx, dy);
  if (length < 1) {
    // Muscle level with the bend: point straight in from the text side.
    dx = label.side === 'right' ? -1 : 1;
    dy = 0;
    length = 1;
  }
  const ux = dx / length;
  const uy = dy / length;
  const baseX = label.anchorX - ux * ARROW_LENGTH_PX;
  const baseY = label.anchorY - uy * ARROW_LENGTH_PX;
  const head = [
    `${label.anchorX},${label.anchorY}`,
    `${baseX - uy * ARROW_HALF_WIDTH_PX},${baseY + ux * ARROW_HALF_WIDTH_PX}`,
    `${baseX + uy * ARROW_HALF_WIDTH_PX},${baseY - ux * ARROW_HALF_WIDTH_PX}`,
  ].join(' ');
  return { shaft: `${label.x},${label.y} ${bx},${label.y} ${baseX},${baseY}`, head };
}

export default function RegionLabelOverlay({ labels }: { labels: readonly PlacedLabel[] }) {
  if (labels.length === 0) return null;
  const arrows = labels.map((label) => ({ label, ...arrowGeometry(label) }));
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {/* Explicit size: on web an unsized <svg> is 300x150 px and clips the lower arrows. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        {arrows.map(({ label, shaft }) => (
          <Polyline
            key={`halo-${label.regionId}`}
            points={shaft}
            fill="none"
            stroke={HALO}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {arrows.map(({ label, shaft }) => (
          <Polyline
            key={`line-${label.regionId}`}
            points={shaft}
            fill="none"
            stroke={INK}
            strokeWidth={1}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {arrows.map(({ label, head }) => (
          <Polygon
            key={`arrow-${label.regionId}`}
            testID={`body-model-arrow-${label.regionId}`}
            points={head}
            fill={INK}
            stroke={HALO}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        ))}
      </Svg>
      {labels.map((label) => {
        const width = labelWidth(label.text);
        const left = label.side === 'right' ? label.x + LABEL_TEXT_GAP_PX : label.x - LABEL_TEXT_GAP_PX - width;
        return (
          <Text
            key={label.regionId}
            testID={`body-model-label-${label.regionId}`}
            numberOfLines={1}
            style={[
              styles.text,
              { left, width, top: label.y - LABEL_HEIGHT_PX / 2, textAlign: label.side === 'right' ? 'left' : 'right' },
            ]}
          >
            {label.text}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    height: LABEL_HEIGHT_PX,
    lineHeight: LABEL_HEIGHT_PX,
    color: INK,
    fontSize: 11,
    fontWeight: '700',
  },
});
