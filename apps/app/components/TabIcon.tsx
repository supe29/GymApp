import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type TabIconName = 'dashboard' | 'plan' | 'nutrition' | 'progress' | 'profile';

export interface TabIconProps {
  name: TabIconName;
  color: string;
  size: number;
}

/**
 * Simple stroke icons for the bottom tabs, drawn with react-native-svg
 * (already a dependency) so both web and native get real icons without
 * adding an icon-font package.
 */
export default function TabIcon({ name, color, size }: TabIconProps) {
  const stroke = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'dashboard' ? (
        <>
          <Path d="M3 11l9-7 9 7" {...stroke} />
          <Path d="M5 10v10h14V10" {...stroke} />
        </>
      ) : null}
      {name === 'plan' ? (
        <>
          <Path d="M2 12h3M19 12h3" {...stroke} />
          <Rect x="5" y="7" width="3" height="10" rx="1" {...stroke} />
          <Rect x="16" y="7" width="3" height="10" rx="1" {...stroke} />
          <Path d="M8 12h8" {...stroke} />
        </>
      ) : null}
      {name === 'nutrition' ? (
        <>
          <Path d="M7 3v8a2 2 0 0 0 4 0V3M9 3v18" {...stroke} />
          <Path d="M17 21V3c-2 1-3 4-3 7h3" {...stroke} />
        </>
      ) : null}
      {name === 'progress' ? (
        <>
          <Path d="M3 20h18" {...stroke} />
          <Path d="M5 16l5-5 4 3 6-7" {...stroke} />
        </>
      ) : null}
      {name === 'profile' ? (
        <>
          <Circle cx="12" cy="8" r="4" {...stroke} />
          <Path d="M4 21c1-4 4-6 8-6s7 2 8 6" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}
