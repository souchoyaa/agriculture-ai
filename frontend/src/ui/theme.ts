// Visual language: "sunlit field" — calm sage canvas, white surfaces with soft depth, a deep
// forest primary and warm harvest accents. Status always pairs colour with an icon and a word.
import type { TextStyle, ViewStyle } from 'react-native';
import type { Attention } from '../domain/model';

export const color = {
  paper: '#F2F5EF',        // app canvas
  card: '#FFFFFF',
  sunken: '#F6F8F4',       // inset areas inside cards
  ink: '#0E1F17',
  inkSoft: '#46564D',
  muted: '#7A887F',
  line: '#E3E9E1',
  border: '#D5DDD3',
  leaf: '#17643A',         // primary
  leafDark: '#0D3F25',
  leafBright: '#2E9A5E',
  leafTint: '#E4F2E8',
  onLeaf: '#FFFFFF',
  turmeric: '#F2A516',     // attention / demo
  turmericSoft: '#FFF3D6',
  turmericInk: '#7A4B00',
  clay: '#C2410C',         // act now
  claySoft: '#FDEBDF',
  sky: '#2457C5',          // information / server
  skySoft: '#E6EDFC',
  stone: '#6B776F',
  stoneSoft: '#EEF1EC',
  okSoft: '#E4F2E8',
  focus: '#2457C5',
};

export const gradient = {
  hero: ['#0D3F25', '#17643A', '#2E8A55'] as const,
  demo: ['#FFE7A8', '#FFD36B'] as const,
};

/** MaterialCommunityIcons names. */
export const attentionStyle: Record<Attention, { icon: string; fg: string; bg: string }> = {
  act: { icon: 'alert', fg: color.clay, bg: color.claySoft },
  check: { icon: 'clock-outline', fg: color.turmericInk, bg: color.turmericSoft },
  unknown: { icon: 'help-circle-outline', fg: color.stone, bg: color.stoneSoft },
  ok: { icon: 'check-circle-outline', fg: color.leaf, bg: color.okSoft },
};

export const font = {
  display: 'Manrope_800ExtraBold',
  heading: 'Manrope_700Bold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};

export const space = (n: number) => n * 4;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const type: Record<'display' | 'title' | 'heading' | 'body' | 'small' | 'label', TextStyle> = {
  display: { fontFamily: font.display, fontSize: 30, lineHeight: 36, color: color.ink, letterSpacing: -0.6 },
  title: { fontFamily: font.heading, fontSize: 21, lineHeight: 27, color: color.ink, letterSpacing: -0.3 },
  heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 23, color: color.ink },
  body: { fontFamily: font.body, fontSize: 16.5, lineHeight: 24, color: color.ink },
  small: { fontFamily: font.body, fontSize: 14.5, lineHeight: 20, color: color.inkSoft },
  label: { fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16, letterSpacing: 0.4, color: color.muted },
};

export const shadow: ViewStyle = {
  shadowColor: '#0E2A1C', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2,
};

export const MIN_TOUCH = 48;
