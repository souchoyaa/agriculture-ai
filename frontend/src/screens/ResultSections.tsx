import React, { useState } from 'react';
import { Linking, Pressable, Share, Text, View } from 'react-native';
import type { Analysis } from '../api';
import type { ObservationRecord } from '../domain/model';
import { formatDate, formatDateTime, type MessageId, type Translate } from '../i18n';
import { useStore } from '../state/store';
import { Body, Button, Card, H2, Icon, Row, Tag } from '../ui/components';
import { color, radius, space, type } from '../ui/theme';

const CLASS_STYLE = { low: { icon: 'gauge-low', fg: color.leaf, bg: color.okSoft }, moderate: { icon: 'gauge', fg: color.turmericInk, bg: color.turmericSoft }, high: { icon: 'gauge-full', fg: color.clay, bg: color.claySoft } } as const;

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: space(2) }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={[type.heading, { color: color.leafDark }]}>{open ? '▾' : '▸'}  {title}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

export function WeatherCard({ env, risk }: { env: Analysis['environment']; risk?: Analysis['weather_risk'] }) {
  const { t, state } = useStore();
  const locale = state.settings.locale;
  const v = (n: number | null, unit: string) => n === null ? t('result.env.missing') : `${Math.round(n * 10) / 10} ${unit}`;
  const cls = risk?.class && CLASS_STYLE[risk.class] ? risk.class : undefined;
  const days = Array.isArray(risk?.days) ? risk!.days! : [];
  const periodHours = typeof env.period_hours === 'number' ? env.period_hours : undefined;
  const meta = [periodHours ? t('result.env.period', { hours: periodHours }) : null, typeof env.provider === 'string' ? env.provider : null, typeof env.data_kind === 'string' ? env.data_kind : null].filter(Boolean).join(' · ');

  return (
    <Card tone={env.status === 'stale' ? 'warn' : undefined}>
      <H2 glyph="☁">{t('result.weather')}</H2>
      {risk && risk.status !== 'unavailable' && cls ? (
        <View style={{ gap: space(2) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), alignSelf: 'flex-start', backgroundColor: CLASS_STYLE[cls].bg, borderColor: CLASS_STYLE[cls].fg, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: space(1) }}>
            <Icon name={CLASS_STYLE[cls].icon} size={18} color={CLASS_STYLE[cls].fg} />
            <Text style={{ color: CLASS_STYLE[cls].fg, fontWeight: '800', fontSize: 16 }}>{t(`result.weather.class.${cls}` as MessageId)}</Text>
          </View>
          {risk.summary ? <Body>{risk.summary}</Body> : null}
          {days.length ? (
            <View style={{ gap: space(1) }}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                {days.map(d => {
                  const forecast = d.period && d.period !== 'history';
                  return <View key={d.date} style={{ width: 13, height: 26, borderRadius: 3, backgroundColor: d.complete === false ? 'transparent' : d.favourable ? color.sky : '#fff', borderWidth: 1.5, borderColor: d.complete === false ? color.stone : color.sky, borderStyle: forecast ? 'dashed' : 'solid' }} />;
                })}
              </View>
              {typeof risk.favourable_days === 'number' && typeof risk.assessed_days === 'number'
                ? <Body soft>{t('result.weather.days', { n: risk.favourable_days, total: risk.assessed_days, back: risk.history_days ?? '—', ahead: risk.forecast_days ?? '—' })}</Body> : null}
              <Row wrap style={{ gap: space(3) }} >
                <Row style={{ gap: space(1) }}><View style={[legendBox, { backgroundColor: color.sky }]} /><Text style={type.small}>{t('result.weather.fav')}</Text></Row>
                <Row style={{ gap: space(1) }}><View style={[legendBox, { backgroundColor: '#fff' }]} /><Text style={type.small}>{t('result.weather.notFav')}</Text></Row>
                <Row style={{ gap: space(1) }}><View style={[legendBox, { borderStyle: 'dashed' }]} /><Text style={type.small}>{t('result.weather.forecast')}</Text></Row>
              </Row>
            </View>
          ) : null}
          {risk.climatology?.summary ? (
            <View style={{ backgroundColor: color.paper, borderRadius: radius.sm, padding: space(3), gap: space(1) }}>
              <Text style={type.label}>{t('result.weather.compare').toUpperCase()}</Text>
              <Body>{risk.climatology.summary}</Body>
              {risk.climatology.caveat ? <Body soft>{risk.climatology.caveat}</Body> : null}
            </View>
          ) : null}
          {risk.interpretation ? <Body soft>ⓘ {risk.interpretation}</Body> : null}
          {risk.limitations?.length ? (
            <Disclosure title={t('result.weather.limits')}>
              {risk.limitations.map((l, i) => <Body key={i} soft>• {l}</Body>)}
            </Disclosure>
          ) : null}
        </View>
      ) : <Body>{t('result.weather.unavailable')}</Body>}

      <View style={{ borderTopWidth: 1, borderTopColor: color.line, paddingTop: space(3), gap: space(2) }}>
        <Text style={type.label}>{t('result.env').toUpperCase()}</Text>
        {env.status === 'unavailable' ? <Body>{t('result.env.unavailable')}</Body> : (
          <>
            {env.status === 'stale' ? <Body>⚠ {t('result.env.stale', { date: formatDateTime(env.as_of, locale) })}</Body> : null}
            <Body soft>{typeof env.age_hours === 'number'
              ? t('result.env.fetched', { age: Math.round(env.age_hours * 10) / 10, cached: env.origin === 'cached' ? t('result.env.cached') : '' })
              : t('result.env.fresh', { date: formatDateTime(env.as_of, locale) })}</Body>
            <Row wrap style={{ gap: space(2) }}>
              {[[t('result.env.temp'), v(env.temperature_c, '°C')], [t('result.env.humidity'), v(env.relative_humidity_pct, '%')], [t('result.env.rain'), v(env.rainfall_mm, 'mm')]].map(([k, val]) => (
                <View key={k} style={{ minWidth: 96, flexGrow: 1, padding: space(3), borderRadius: radius.sm, backgroundColor: color.paper }}>
                  <Text style={type.label}>{k.toUpperCase()}</Text>
                  <Text style={type.title}>{val}</Text>
                </View>
              ))}
            </Row>
            {meta ? <Body soft>{meta}</Body> : null}
          </>
        )}
      </View>
    </Card>
  );
}
const legendBox = { width: 12, height: 18, borderRadius: 3, borderWidth: 1.5, borderColor: color.sky };

export function reviewMessage(t: Translate, analysis: Analysis, record: ObservationRecord, locale: string, cropLabel: string): string {
  return t('result.review.message', {
    crop: cropLabel,
    date: formatDate(record.createdAt, locale),
    condition: analysis.condition.label,
    status: t(`result.status.${analysis.status}` as MessageId),
    symptoms: record.symptoms.map(s => t(`symptom.${s}` as MessageId)).join(', ') || '—',
    reasons: (analysis.review?.reasons ?? []).map(r => r.text).join(' ') || '—',
    id: record.id,
  });
}

/** Officer review: the user previews exact text, then opens the OS share sheet. Nothing is sent automatically. */
export function ReviewCard({ analysis, record }: { analysis: Analysis; record: ObservationRecord }) {
  const { t, state } = useStore();
  const [stage, setStage] = useState<'idle' | 'preview' | 'opened' | 'unavailable'>('idle');
  if (!analysis.review?.suggested) return null;
  const field = state.fields.find(f => f.id === record.fieldId);
  const message = reviewMessage(t, analysis, record, state.settings.locale, t(`crop.${field?.crop ?? record.observation.crop}` as MessageId));
  return (
    <Card tone="info">
      <H2 glyph="☏">{t('result.review')}</H2>
      {(analysis.review.reasons ?? []).map(r => <Body key={r.id}>• {r.text}</Body>)}
      <Body soft>{t('result.review.never')}</Body>
      {stage === 'idle' ? <Button kind="secondary" icon="✉" label={t('result.review.start')} onPress={() => setStage('preview')} /> : (
        <View style={{ gap: space(2) }}>
          <Body>{t('result.review.preview')}</Body>
          <View style={{ backgroundColor: '#fff', borderRadius: radius.sm, borderWidth: 1.5, borderColor: color.border, padding: space(3) }}>
            <Text selectable style={type.body}>{message}</Text>
          </View>
          {stage === 'preview' ? (
            <Row wrap>
              <Button icon="↗" label={t('result.review.share')} onPress={async () => {
                try { await Share.share({ message }); setStage('opened'); } catch { setStage('unavailable'); }
              }} />
              <Button kind="quiet" label={t('result.review.cancel')} onPress={() => setStage('idle')} />
            </Row>
          ) : <Text accessibilityRole="alert" style={type.body}>{stage === 'opened' ? t('result.review.opened') : t('result.review.unavailable')}</Text>}
        </View>
      )}
    </Card>
  );
}

/** Region-specific sourced context from the backend (e.g. Rwanda survey), shown near guidance. */
export function RegionalContext({ items, sources }: { items?: Analysis['regional_context']; sources: Analysis['sources'] }) {
  const { t } = useStore();
  if (!items?.length) return null;
  const byId = new Map(sources.map(s => [s.id, s]));
  return (
    <View style={{ gap: space(2), backgroundColor: color.skySoft, borderRadius: radius.sm, padding: space(3) }}>
      <Text style={type.label}>⌖ {t('result.regional').toUpperCase()}</Text>
      {items.filter(i => i && typeof i.text === 'string').map(i => (
        <View key={i.id} style={{ gap: 2 }}>
          <Body>{i.text}</Body>
          {i.regional_scope?.note ? <Body soft>ⓘ {i.regional_scope.note}</Body> : null}
          {(i.source_ids ?? []).map(id => byId.get(id)).filter(Boolean).map(s => (
            <Pressable key={s!.id} accessibilityRole="link" onPress={() => Linking.openURL(s!.url)}>
              <Text style={[type.small, { color: color.sky, textDecorationLine: 'underline' }]}>{s!.title}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ScopeCard({ scope }: { scope?: Analysis['guidance_scope'] }) {
  const { t } = useStore();
  if (!scope || (!scope.local_check_required?.length && !scope.regions_of_guidance_sources?.length)) return null;
  return (
    <View style={{ gap: space(1), backgroundColor: color.turmericSoft, borderRadius: radius.sm, padding: space(3) }}>
      <Text style={type.label}>⚠ {t('result.scope').toUpperCase()}</Text>
      {scope.local_check_required?.map((c, i) => <Body key={i}>• {c}</Body>)}
      {scope.regions_of_guidance_sources?.length ? <Body soft>{t('result.scope.regions', { regions: scope.regions_of_guidance_sources.join(', ') })}</Body> : null}
    </View>
  );
}

export function SourcesList({ sources }: { sources: Analysis['sources'] }) {
  const { t, state } = useStore();
  if (!sources.length) return null;
  return (
    <Disclosure title={t('result.sources.all', { n: sources.length })}>
      {sources.map(s => (
        <View key={s.id} style={{ gap: 2, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space(2) }}>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(s.url)}>
            <Text style={[type.body, { color: color.sky, textDecorationLine: 'underline' }]}>{s.title}</Text>
          </Pressable>
          <Text style={type.small}>{[s.publisher, s.kind?.replace(/_/g, ' '), s.license, t('result.accessed', { date: formatDate(s.accessed_at, state.settings.locale) })].filter(Boolean).join(' · ')}</Text>
        </View>
      ))}
    </Disclosure>
  );
}

export function EvidenceList({ evidence }: { evidence?: Analysis['evidence'] }) {
  const { t } = useStore();
  if (!evidence?.length) return null;
  return (
    <View style={{ gap: space(2) }}>
      <Text style={type.label}>{t('result.evidence').toUpperCase()}</Text>
      {evidence.map((e, i) => {
        const key = `symptom.${e.label}` as MessageId;
        const name = t(key) === key ? e.label.replace(/_/g, ' ') : t(key);
        return (
          <Row key={`${e.label}-${i}`} wrap>
            <Text style={[type.body, { flexShrink: 1 }]}>{name}</Text>
            <Tag tone={e.recognized ? 'info' : 'stone'} label={(e.recognized ? t('result.evidence.recognized') : t('result.evidence.unrecognized'))} />
            {e.specific ? <Tag tone="info" label={t('result.evidence.specific')} /> : null}
          </Row>
        );
      })}
    </View>
  );
}
