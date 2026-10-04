import React from 'react';
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';

export type PS = PressableStateCallbackType & { focused?: boolean };
import type { Attention } from '../domain/model';
import { attentionStyle, color, MIN_TOUCH, radius, space, type } from './theme';

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'warn' | 'alert' | 'info' | 'plain' }) {
  const toneStyle = tone === 'warn' ? { backgroundColor: color.turmericSoft, borderColor: '#D9A300' }
    : tone === 'alert' ? { backgroundColor: color.claySoft, borderColor: color.clay }
    : tone === 'info' ? { backgroundColor: color.skySoft, borderColor: color.sky } : null;
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" style={type.display}>{children}</Text>;
}
export function H2({ children, glyph }: { children: React.ReactNode; glyph?: string }) {
  return <Text accessibilityRole="header" style={[type.title, { marginTop: space(2) }]}>{glyph ? `${glyph}  ` : ''}{children}</Text>;
}
export function Body({ children, style, soft }: { children: React.ReactNode; style?: object; soft?: boolean }) {
  return <Text style={[soft ? type.small : type.body, style]}>{children}</Text>;
}

type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger';
export function Button({ label, onPress, kind = 'primary', disabled, icon, hint, style, a11yLabel }: {
  label: string; a11yLabel?: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; icon?: string; hint?: string; style?: StyleProp<ViewStyle>;
}) {
  const k = buttonKinds[kind];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11yLabel ?? label} accessibilityHint={hint} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed, focused }: PS) => [styles.button, { backgroundColor: k.bg, borderColor: k.border }, pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] }, focused && styles.focus, disabled && { opacity: 0.45 }, style]}>
      {icon ? <Text aria-hidden style={[styles.buttonText, { color: k.fg }]}>{icon}</Text> : null}
      <Text style={[styles.buttonText, { color: k.fg }]}>{label}</Text>
    </Pressable>
  );
}
const buttonKinds: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
  primary: { bg: color.leaf, fg: color.onLeaf, border: color.leafDark },
  secondary: { bg: color.card, fg: color.leafDark, border: color.leaf },
  quiet: { bg: 'transparent', fg: color.leafDark, border: 'transparent' },
  danger: { bg: color.clay, fg: '#fff', border: '#7E2412' },
};

export function AttentionBadge({ level, label }: { level: Attention; label: string }) {
  const s = attentionStyle[level];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.fg }]} accessible accessibilityLabel={label}>
      <Text aria-hidden style={[styles.badgeText, { color: s.fg }]}>{s.glyph}</Text>
      <Text style={[styles.badgeText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

export function Tag({ label, tone = 'stone' }: { label: string; tone?: 'stone' | 'warn' | 'info' | 'alert' }) {
  const map = { stone: [color.stoneSoft, color.inkSoft], warn: [color.turmericSoft, '#6B4B00'], info: [color.skySoft, color.sky], alert: [color.claySoft, color.clay] } as const;
  const [bg, fg] = map[tone];
  return <View style={[styles.tag, { backgroundColor: bg }]}><Text style={[type.label, { color: fg }]}>{label}</Text></View>;
}

/** Large selectable row used for checklists and single/multi choice. */
export function Choice({ label, selected, onPress, glyph, multi = true, detail }: {
  label: string; selected: boolean; onPress: () => void; glyph?: string; multi?: boolean; detail?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={multi ? { checked: selected } : { selected }} accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ focused }: PS) => [styles.choice, selected && styles.choiceOn, focused && styles.focus]}>
      <View aria-hidden style={[styles.tick, multi ? null : { borderRadius: 14 }, selected && styles.tickOn]}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{selected ? '✓' : ''}</Text>
      </View>
      {glyph ? <Text aria-hidden style={styles.choiceGlyph}>{glyph}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, selected && { fontWeight: '700' }]}>{label}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
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
      <Row>
        {[1, 2, 3].map(i => <View key={i} style={[styles.seg, i <= filled && styles.segOn]} />)}
      </Row>
      <Text style={type.heading}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.md, borderWidth: 1.5, borderColor: color.border, padding: space(4), gap: space(3) },
  button: { minHeight: MIN_TOUCH + 4, borderRadius: radius.md, borderWidth: 2, paddingHorizontal: space(5), paddingVertical: space(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2) },
  buttonText: { fontSize: 17, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  focus: { outlineStyle: 'solid', outlineWidth: 3, outlineColor: color.focus, outlineOffset: 2 } as object,
  badge: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: space(1) },
  badgeText: { fontSize: 15, fontWeight: '800' },
  tag: { borderRadius: 6, paddingHorizontal: space(2), paddingVertical: 3, alignSelf: 'flex-start' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: MIN_TOUCH + 8, padding: space(3), borderRadius: radius.md, borderWidth: 2, borderColor: color.border, backgroundColor: color.card },
  choiceOn: { borderColor: color.leaf, backgroundColor: '#EAF3EC' },
  choiceGlyph: { fontSize: 24, width: 30, textAlign: 'center', color: color.leafDark },
  tick: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: color.stone, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  tickOn: { backgroundColor: color.leaf, borderColor: color.leaf },
  seg: { flex: 1, height: 14, borderRadius: 4, backgroundColor: color.stoneSoft, borderWidth: 1, borderColor: color.border },
  segOn: { backgroundColor: color.sky, borderColor: color.sky },
});
