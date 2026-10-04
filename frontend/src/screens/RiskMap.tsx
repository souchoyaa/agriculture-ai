import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { Analysis } from '../api';
import { describeFeatures, levelGlyph, project, timeSlots } from '../domain/mapFeatures';
import { formatDateTime } from '../i18n';
import { useStore } from '../state/store';
import { Body, Card, Choice, H2, Row } from '../ui/components';
import { color, radius, space, type } from '../ui/theme';

const LEVEL_COLOR: Record<string, string> = { low: '#5E8C6A', moderate: '#C98A00', medium: '#C98A00', high: color.clay, very_high: '#6E1A0B' };

/** Schematic (tile-free, offline) map plus a text list that carries the same information. */
export function RiskMap({ map, fieldLocation }: { map: Analysis['map']; fieldLocation?: { latitude: number; longitude: number } }) {
  const { t, state } = useStore();
  const views = useMemo(() => describeFeatures(map.features), [map.features]);
  const slots = timeSlots(views);
  const [slot, setSlot] = useState(slots[0]);
  const shown = slot ? views.filter(v => !v.time || v.time === slot) : views;

  if (map.status !== 'available' || views.length === 0) {
    return (
      <Card>
        <H2 glyph="◎">{t('result.map')}</H2>
        <Body>{map.status === 'unsupported' ? t('result.map.unsupported') : t('result.map.unavailable')}</Body>
        <Body soft>{t('result.map.limits', { text: map.limitations })}</Body>
      </Card>
    );
  }

  const here: [number, number] | undefined = fieldLocation ? [fieldLocation.longitude, fieldLocation.latitude] : undefined;
  const pts = shown.map(v => v.center).filter((c): c is [number, number] => !!c);
  const proj = project(here ? [...pts, here] : pts);
  const levels = [...new Set(shown.map(v => v.level).filter((l): l is string => !!l))];

  return (
    <Card>
      <H2 glyph="◎">{t('result.map')}</H2>
      {slots.length > 1 ? (
        <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
          {slots.map(s => <Choice key={s} multi={false} label={t('result.map.validFor', { time: formatDateTime(s, state.settings.locale) === '—' ? s : formatDateTime(s, state.settings.locale) })} selected={slot === s} onPress={() => setSlot(s)} />)}
        </View>
      ) : slot ? <Body soft>{t('result.map.validFor', { time: formatDateTime(slot, state.settings.locale) === '—' ? slot : formatDateTime(slot, state.settings.locale) })}</Body> : null}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ height: 220, borderRadius: radius.sm, backgroundColor: '#E9E4D2', borderWidth: 1.5, borderColor: color.border, overflow: 'hidden' }}>
        {shown.map(v => {
          if (!v.center) return null;
          const { x, y } = proj(v.center);
          const c = (v.level && LEVEL_COLOR[v.level.toLowerCase()]) ?? color.sky;
          return (
            <View key={v.key} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, transform: [{ translateX: -14 }, { translateY: -14 }], alignItems: 'center' }}>
              <Text style={{ fontSize: 26, color: c, lineHeight: 28 }}>{levelGlyph(v.level)}</Text>
              <Text numberOfLines={1} style={[type.label, { color: color.ink, backgroundColor: '#ffffffcc', paddingHorizontal: 4, borderRadius: 4 }]}>{v.label}</Text>
            </View>
          );
        })}
        {here ? (() => { const { x, y } = proj(here); return (
          <View style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, transform: [{ translateX: -12 }, { translateY: -12 }], alignItems: 'center' }}>
            <Text style={{ fontSize: 22, color: color.leafDark, lineHeight: 24 }}>⌂</Text>
            <Text style={[type.label, { color: '#fff', backgroundColor: color.leafDark, paddingHorizontal: 4, borderRadius: 4 }]}>{t('result.map.you')}</Text>
          </View>); })() : null}
      </View>
      {levels.length ? (
        <View style={{ gap: space(1) }}>
          <Text style={type.label}>{t('result.map.legend').toUpperCase()}</Text>
          <Row wrap>
            {levels.map(l => <Row key={l} style={{ gap: space(1) }}><Text style={{ fontSize: 20, color: LEVEL_COLOR[l.toLowerCase()] ?? color.sky }}>{levelGlyph(l)}</Text><Text style={type.small}>{l}</Text></Row>)}
            {here ? <Row style={{ gap: space(1) }}><Text style={{ fontSize: 18, color: color.leafDark }}>⌂</Text><Text style={type.small}>{t('result.map.you')}</Text></Row> : null}
          </Row>
        </View>
      ) : null}
      <Text style={type.label}>{t('result.map.list').toUpperCase()}</Text>
      {shown.map(v => (
        <Row key={v.key} style={{ alignItems: 'flex-start' }}>
          <Text aria-hidden style={{ fontSize: 18, width: 24, color: (v.level && LEVEL_COLOR[v.level.toLowerCase()]) ?? color.sky }}>{levelGlyph(v.level)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{v.label}{v.level ? ` — ${v.level}` : ''}{v.score !== undefined ? ` (${v.score})` : ''}</Text>
          </View>
        </Row>
      ))}
      <Body soft>{t('result.map.limits', { text: map.limitations })}</Body>
    </Card>
  );
}
