// Visual language: "field notebook in sunlight" — warm paper, deep ink, high-contrast
// status colours that always pair with a glyph and a word (never colour alone).
import type { Attention } from '../domain/model';

export const color = {
  paper: '#F6F1E4',
  card: '#FFFDF7',
  ink: '#16261C',
  inkSoft: '#3C4A40',
  line: '#1626231F',
  border: '#C9BFA6',
  leaf: '#1F5A3A',
  leafDark: '#123B26',
  onLeaf: '#FFFFFF',
  turmeric: '#F2B705',
  turmericSoft: '#FCEFC2',
  clay: '#A8361E',
  claySoft: '#F7DDD5',
  sky: '#1D4E89',
  skySoft: '#DCE8F5',
  stone: '#6B6A5E',
  stoneSoft: '#ECE7DA',
  okSoft: '#DCEFE2',
  focus: '#1D4E89',
};

export const attentionStyle: Record<Attention, { glyph: string; fg: string; bg: string }> = {
  act: { glyph: '▲', fg: color.clay, bg: color.claySoft },
  check: { glyph: '◆', fg: '#7A5600', bg: color.turmericSoft },
  unknown: { glyph: '?', fg: color.stone, bg: color.stoneSoft },
  ok: { glyph: '✓', fg: color.leaf, bg: color.okSoft },
};

export const space = (n: number) => n * 4;
export const radius = { sm: 8, md: 14, lg: 22 };
export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800' as const, color: color.ink, letterSpacing: -0.5 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' as const, color: color.ink },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const, color: color.ink },
  body: { fontSize: 17, lineHeight: 25, color: color.ink },
  small: { fontSize: 15, lineHeight: 21, color: color.inkSoft },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '800' as const, letterSpacing: 0.6, color: color.inkSoft },
};
export const MIN_TOUCH = 48;
