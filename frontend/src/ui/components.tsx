import React from 'react';
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import createIconSet from '@expo/vector-icons/createIconSet';
import fieldGlyphs from './fieldIcons.json';

// Subset of MaterialCommunityIcons with only the glyphs this app uses (scripts/build-icons.mjs, ~16 KB vs 1.3 MB).
const FieldIcons = createIconSet(fieldGlyphs as Record<string, number>, 'FieldIcons', require('../../assets/fonts/FieldIcons.ttf'));
import type { Attention } from '../domain/model';
import { attentionStyle, color, font, MIN_TOUCH, radius, shadow, space, type } from './theme';

export type PS = PressableStateCallbackType & { focused?: boolean };
type IconName = string;

// Legacy glyph strings used across screens → icon names (one consistent icon set).
const GLYPH: Record<string, string> = {
  '＋': 'plus', '→': 'arrow-right', '←': 'arrow-left', '✓': 'check', '✕': 'close', '◉': 'camera-outline', '▤': 'image-outline',
  '↻': 'refresh', '↺': 'restore', '⇄': 'lan-connect', '✉': 'message-text-outline', '↗': 'share-variant-outline', '✎': 'pencil-outline',
  '◎': 'crosshairs-gps', '☁': 'weather-partly-rainy', '☏': 'account-tie-voice-outline', '⏳': 'progress-clock', '✍': 'clipboard-text-outline',
  '☑': 'format-list-checks', '◔': 'chart-donut', '⇆': 'compare-horizontal', '▦': 'sprout-outline', '☰': 'history', '⚙': 'cog-outline',
};
export const iconName = (g?: string): IconName | undefined => (g ? ((GLYPH[g] ?? g) as IconName) : undefined);

export function Icon({ name, size = 20, color: c = color.ink, style }: { name?: string; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const n = iconName(name);
  if (!n) return null;
  return <FieldIcons name={n as never} size={size} color={c} style={style} aria-hidden accessibilityElementsHidden importantForAccessibility="no" />;
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'warn' | 'alert' | 'info' | 'plain' }) {
  const toneStyle = tone === 'warn' ? { backgroundColor: color.turmericSoft }
    : tone === 'alert' ? { backgroundColor: color.claySoft }
    : tone === 'info' ? { backgroundColor: color.skySoft } : null;
  return <View style={[styles.card, tone && tone !== 'plain' ? styles.flat : shadow, toneStyle, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" style={type.display}>{children}</Text>;
}
export function H2({ children, glyph }: { children: React.ReactNode; glyph?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2.5) }}>
      {glyph ? <View style={styles.h2Icon}><Icon name={glyph} size={18} color={color.leaf} /></View> : null}
      <Text accessibilityRole="header" style={[type.title, { flexShrink: 1 }]}>{children}</Text>
    </View>
  );
}
export function Body({ children, style, soft }: { children: React.ReactNode; style?: StyleProp<TextStyle>; soft?: boolean }) {
  return <Text style={[soft ? type.small : type.body, style]}>{children}</Text>;
}

type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger' | 'light';
export function Button({ label, onPress, kind = 'primary', disabled, icon, hint, style, a11yLabel, textColor, testID }: {
  label: string; a11yLabel?: string; textColor?: string; testID?: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; icon?: string; hint?: string; style?: StyleProp<ViewStyle>;
}) {
  const k = textColor ? { ...buttonKinds[kind], fg: textColor } : buttonKinds[kind];
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={a11yLabel ?? label} accessibilityHint={hint} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed, focused }: PS) => [styles.button, { backgroundColor: k.bg, borderColor: k.border }, kind === 'primary' && shadow, pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] }, focused && styles.focus, disabled && { opacity: 0.45 }, style]}>
      {icon ? <Icon name={icon} size={20} color={k.fg} /> : null}
      <Text style={[styles.buttonText, { color: k.fg }]}>{label}</Text>
    </Pressable>
  );
}
const buttonKinds: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
  primary: { bg: color.leaf, fg: color.onLeaf, border: color.leaf },
  secondary: { bg: color.leafTint, fg: color.leafDark, border: color.leafTint },
  light: { bg: '#FFFFFF', fg: color.leafDark, border: '#FFFFFF' },
  quiet: { bg: 'transparent', fg: color.leaf, border: 'transparent' },
  danger: { bg: color.clay, fg: '#fff', border: color.clay },
};

export function AttentionBadge({ level, label }: { level: Attention; label: string }) {
  const s = attentionStyle[level];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]} accessible accessibilityLabel={label}>
      <Icon name={s.icon} size={16} color={s.fg} />
      <Text style={[styles.badgeText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

export function Tag({ label, tone = 'stone', icon }: { label: string; tone?: 'stone' | 'warn' | 'info' | 'alert' | 'ok'; icon?: string }) {
  const map = { stone: [color.stoneSoft, color.inkSoft], warn: [color.turmericSoft, color.turmericInk], info: [color.skySoft, color.sky], alert: [color.claySoft, color.clay], ok: [color.okSoft, color.leaf] } as const;
  const [bg, fg] = map[tone];
  const text = label.replace(/^[^\p{L}\p{N}]+\s*/u, ''); // drop legacy leading glyphs like "⚠ " / "⏳ "
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      {text ? <Text style={[styles.tagText, { color: fg }]}>{text}</Text> : null}
    </View>
  );
}

/** Selectable tile used for checklists and single/multi choice. */
export function Choice({ label, selected, onPress, glyph, multi = true, detail }: {
  label: string; selected: boolean; onPress: () => void; glyph?: string; multi?: boolean; detail?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={multi ? { checked: selected } : { selected }} accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ focused, pressed }: PS) => [styles.choice, selected && styles.choiceOn, pressed && { opacity: 0.9 }, focused && styles.focus]}>
      {glyph ? <View style={[styles.choiceIcon, selected && { backgroundColor: '#fff' }]}><Icon name={glyph} size={22} color={selected ? color.leaf : color.inkSoft} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontFamily: selected ? font.semibold : font.medium }]}>{label}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
      <View aria-hidden style={[styles.tick, multi ? null : { borderRadius: 12 }, selected && styles.tickOn]}>
        {selected ? <Icon name="check" size={16} color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

export function Row({ children, style, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space(2) }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

/** Three-segment meter; text always accompanies it. */
export function StrengthMeter({ level, label }: { level: 'weak' | 'moderate' | 'strong'; label: string }) {
  const filled = level === 'weak' ? 1 : level === 'moderate' ? 2 : 3;
  return (
    <View accessible accessibilityLabel={label} style={{ gap: space(2) }}>
      <Row style={{ gap: 6 }}>
        {[1, 2, 3].map(i => <View key={i} style={[styles.seg, i <= filled && styles.segOn]} />)}
      </Row>
      <Text style={[type.heading, { fontFamily: font.heading }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.lg, padding: space(5), gap: space(3) },
  flat: { shadowOpacity: 0, elevation: 0 },
  h2Icon: { width: 34, height: 34, borderRadius: 12, backgroundColor: color.leafTint, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: MIN_TOUCH + 4, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: space(5), paddingVertical: space(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2) },
  buttonText: { fontFamily: font.semibold, fontSize: 16, textAlign: 'center', flexShrink: 1 },
  focus: { outlineStyle: 'solid', outlineWidth: 3, outlineColor: color.focus, outlineOffset: 2 } as object,
  badge: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: 5 },
  badgeText: { fontFamily: font.semibold, fontSize: 14 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: 3, alignSelf: 'flex-start' },
  tagText: { fontFamily: font.semibold, fontSize: 12.5 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: MIN_TOUCH + 12, paddingVertical: space(3), paddingHorizontal: space(4), borderRadius: radius.md, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: color.sunken },
  choiceOn: { borderColor: color.leafBright, backgroundColor: color.leafTint },
  choiceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: color.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  tickOn: { backgroundColor: color.leaf, borderColor: color.leaf },
  seg: { flex: 1, height: 10, borderRadius: 5, backgroundColor: color.stoneSoft },
  segOn: { backgroundColor: color.sky },
});
