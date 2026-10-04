import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { Analysis } from '../api';
import { describeFeatures, horizonLayers, levelGlyph, priorityBucket, project, timeSlots, type FeatureView } from '../domain/mapFeatures';
import { formatDateTime, type MessageId } from '../i18n';
import { useStore } from '../state/store';
import { Body, Card, Choice, H2, Icon, Row } from '../ui/components';
import { color, font, radius, space, type } from '../ui/theme';

const compassIndex = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

// Sequential priority palette (light → dark) — buckets are also named in text and legend.
const BUCKET = { low: '#F3E3B3', mid: '#E6A040', high: '#B4441F' } as const;
const LEVEL_COLOR: Record<string, string> = { low: '#5E8C6A', moderate: '#C98A00', medium: '#C98A00', high: color.clay, very_high: '#6E1A0B' };

/**
 * Tile-free schematic of backend map features (works offline). Hidden from screen readers;
 * the ranked scouting list below carries the same information as text.
 */
export function RiskMap({ map, scouting }: { map: Analysis['map']; scouting: Analysis['scouting'] }) {
  const { t, state } = useStore();
  const views = useMemo(() => describeFeatures(map.features), [map.features]);
  const slots = timeSlots(views);
  const [slot, setSlot] = useState(slots[0]);
  const shown = slot ? views.filter(v => !v.time || v.time === slot) : views;
  const horizon = typeof map.horizon_days === 'number' ? map.horizon_days : undefined;
  const isPriority = map.value_kind === 'relative_scouting_priority' || shown.some(v => v.role === 'cell');
  const cellCount = shown.filter(v => v.role === 'cell').length;
  const layers = useMemo(() => horizonLayers(map, cellCount), [map, cellCount]);
  const defaultHours = (horizon ?? 7) * 24;
  const [hours, setHours] = useState(defaultHours);
  const layer = layers.find(l => l.hours === hours);

  if (map.status !== 'available' || views.length === 0) {
    return (
      <Card>
        <H2 glyph="◎">{t('result.map')}</H2>
        <Body>{map.status === 'unsupported' ? t('result.map.unsupported') : t('result.map.unavailable')}</Body>
        <Body soft>{t('result.map.limits', { text: map.limitations })}</Body>
      </Card>
    );
  }

  const allPts: [number, number][] = [];
  for (const v of shown) {
    if (v.bounds) { allPts.push([v.bounds[0], v.bounds[1]], [v.bounds[2], v.bounds[3]]); }
  }
  const proj = project(allPts);
  // Priorities for the selected forecast window (same grid geometry, row-major).
  const cells = shown.filter(v => v.role === 'cell' && v.bounds && v.priority !== undefined)
    .map((c, i) => layer ? { ...c, priority: layer.priorities[i] } : c);
  const uncertainty = shown.find(v => v.role === 'uncertainty' && v.bounds);
  const markers = shown.filter(v => v.role !== 'cell' && v.role !== 'uncertainty' && v.center);
  const ranked = scouting.filter(s => typeof s.rank === 'number').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const levels = [...new Set(markers.map(v => v.level).filter((l): l is string => !!l))];
  const timeLabel = (s: string) => formatDateTime(s, state.settings.locale) === '—' ? s : formatDateTime(s, state.settings.locale);

  return (
    <Card>
      <H2 glyph="◎">{t('result.map')}</H2>
      {isPriority ? <Body>{t('result.map.question')}</Body> : null}
      {layers.length > 1 ? (
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: color.sunken, borderRadius: radius.pill, padding: 4, gap: 4 }}>
          {layers.map(l => {
            const on = l.hours === hours;
            return (
              <Text key={l.hours} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setHours(l.hours)}
                style={{ flex: 1, textAlign: 'center', paddingVertical: space(2.5), borderRadius: radius.pill, overflow: 'hidden', fontFamily: on ? font.semibold : font.medium, fontSize: 15,
                  color: on ? '#fff' : color.inkSoft, backgroundColor: on ? color.leaf : 'transparent' }}>
                {l.hours < 48 ? t('result.map.h24') : t('result.map.days', { n: Math.round(l.hours / 24) })}
              </Text>
            );
          })}
        </View>
      ) : null}
      {layer ? (
        <Row style={{ gap: space(2) }}>
          <Icon name="weather-windy" size={18} color={color.sky} />
          <Text style={[type.small, { flex: 1 }]}>{layer.wind_used && layer.wind_from_deg != null ? t('result.map.wind', { dir: t(`compass.${compassIndex(layer.wind_from_deg)}` as MessageId) }) : t('result.map.windVariable')}</Text>
        </Row>
      ) : null}
      {slots.length > 1 ? (
        <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
          {slots.map(s => <Choice key={s} multi={false} label={t('result.map.validFor', { time: timeLabel(s) })} selected={slot === s} onPress={() => setSlot(s)} />)}
        </View>
      ) : slot ? <Body soft>{t('result.map.validFor', { time: timeLabel(slot) })}</Body> : null}

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ width: '100%', maxWidth: 420, aspectRatio: 1, alignSelf: 'center', borderRadius: radius.sm, backgroundColor: '#EDE8D8', borderWidth: 1.5, borderColor: color.border, overflow: 'hidden' }}>
        {cells.map(c => {
          const a = proj([c.bounds![0], c.bounds![3]]); const b = proj([c.bounds![2], c.bounds![1]]);
          return <View key={c.key} style={{ position: 'absolute', left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${(b.x - a.x) * 100}%`, height: `${(b.y - a.y) * 100}%`, backgroundColor: BUCKET[priorityBucket(c.priority!)], opacity: 0.35 + 0.65 * c.priority!, borderWidth: 0.5, borderColor: '#ffffff88' }} />;
        })}
        {uncertainty ? (() => { const a = proj([uncertainty.bounds![0], uncertainty.bounds![3]]); const b = proj([uncertainty.bounds![2], uncertainty.bounds![1]]);
          return <View style={{ position: 'absolute', left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${(b.x - a.x) * 100}%`, height: `${(b.y - a.y) * 100}%`, borderRadius: 9999, borderWidth: 2, borderStyle: 'dashed', borderColor: color.leafDark, backgroundColor: 'rgba(23,100,58,0.06)' }} />; })() : null}
        {markers.map(m => <Marker key={m.key} view={m} pos={proj(m.center!)} reportedLabel={t('result.map.reported')} />)}
        <Text style={[type.label, { position: 'absolute', top: 6, right: 8, color: color.ink }]}>▲ {t('result.map.north')}</Text>
      </View>

      <View style={{ gap: space(1) }}>
        <Text style={type.label}>{t('result.map.legend').toUpperCase()}</Text>
        <Row wrap style={{ gap: space(3) }}>
          {cells.length ? (['low', 'mid', 'high'] as const).map(b => (
            <Row key={b} style={{ gap: space(1) }}>
              <View style={{ width: 18, height: 18, borderRadius: 3, backgroundColor: BUCKET[b], borderWidth: 1, borderColor: color.border }} />
              <Text style={type.small}>{t(`result.map.${b}`)}</Text>
            </Row>
          )) : null}
          {uncertainty ? <Row style={{ gap: space(1) }}><View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderStyle: 'dashed', borderColor: color.leafDark }} /><Text style={type.small}>{t('result.map.uncertainty', { m: Number(uncertainty.properties.radius_m) || '—' })}</Text></Row> : null}
          {markers.some(m => m.role === 'reported') ? <Row style={{ gap: space(1) }}><Text style={{ fontSize: 18, color: color.leafDark }}>✚</Text><Text style={type.small}>{t('result.map.reported')}</Text></Row> : null}
          {markers.some(m => m.role === 'scouting_point') ? <Row style={{ gap: space(1) }}><View style={pin}><Text style={pinText}>1</Text></View><Text style={type.small}>{t('result.map.points')}</Text></Row> : null}
          {levels.map(l => <Row key={l} style={{ gap: space(1) }}><Text style={{ fontSize: 20, color: LEVEL_COLOR[l.toLowerCase()] ?? color.sky }}>{levelGlyph(l)}</Text><Text style={type.small}>{l}</Text></Row>)}
        </Row>
      </View>

      {ranked.length ? (
        <View style={{ gap: space(2) }}>
          <Text style={type.label}>{t('result.map.points').toUpperCase()}</Text>
          {ranked.map(s => (
            <Row key={s.id} style={{ alignItems: 'flex-start' }}>
              <View style={pin}><Text style={pinText}>{s.rank}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{s.text}</Text>
                <Text style={type.small}>{s.distance_m ? t('result.map.distance', { m: s.distance_m }) : t('result.map.here')}{s.priority !== undefined ? ` · ${t(`result.map.${priorityBucket(s.priority)}`)}` : ''}</Text>
              </View>
            </Row>
          ))}
        </View>
      ) : (
        <View style={{ gap: space(1) }}>
          <Text style={type.label}>{t('result.map.list').toUpperCase()}</Text>
          {markers.map(v => <Body key={v.key}>{levelGlyph(v.level)} {v.label}{v.level ? ` — ${v.level}` : ''}{v.score !== undefined ? ` (${v.score})` : ''}</Body>)}
        </View>
      )}
      <Body soft>{t('result.map.limits', { text: map.limitations })}</Body>
    </Card>
  );
}

function Marker({ view, pos, reportedLabel }: { view: FeatureView; pos: { x: number; y: number }; reportedLabel: string }) {
  const style = { position: 'absolute' as const, left: `${pos.x * 100}%` as const, top: `${pos.y * 100}%` as const, transform: [{ translateX: -12 }, { translateY: -12 }] };
  if (view.role === 'scouting_point') return <View style={[style, pin]}><Text style={pinText}>{view.rank ?? '•'}</Text></View>;
  if (view.role === 'reported') return <View style={[style, { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: color.leafDark, alignItems: 'center', justifyContent: 'center' }]} accessibilityLabel={reportedLabel}><Text style={{ color: color.leafDark, fontWeight: '900', fontSize: 14 }}>✚</Text></View>;
  return <View style={style}><Text style={{ fontSize: 22, color: (view.level && LEVEL_COLOR[view.level.toLowerCase()]) ?? color.sky }}>{levelGlyph(view.level)}</Text></View>;
}

const pin = { width: 24, height: 24, borderRadius: 12, backgroundColor: color.ink, borderWidth: 2, borderColor: '#fff', alignItems: 'center' as const, justifyContent: 'center' as const };
const pinText = { color: '#fff', fontWeight: '900' as const, fontSize: 12 };
