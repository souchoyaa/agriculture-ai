import React, { useState } from 'react';
import { Image, Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';

export const RESULT_TWO_COLUMN_MIN = 1180;
import type { Analysis } from '../api';
import { followUpDue, signalStrength, type ObservationRecord } from '../domain/model';
import { formatDate, formatDateTime, type MessageId } from '../i18n';
import type { Nav } from '../navigation';
import { useStore } from '../state/store';
import { Body, Button, Card, Choice, H1, H2, Row, StrengthMeter, Tag } from '../ui/components';
import { color, radius, space, type } from '../ui/theme';
import { RiskMap } from './RiskMap';
import { EvidenceList, ReviewCard, ScopeCard, SourcesList, WeatherCard } from './ResultSections';

const STATUS_GLYPH: Record<Analysis['status'], { glyph: string; fg: string; bg: string }> = {
  needs_review: { glyph: '▲', fg: color.clay, bg: color.claySoft },
  supported: { glyph: '●', fg: color.leaf, bg: color.okSoft },
  unsupported: { glyph: '⊘', fg: color.stone, bg: color.stoneSoft },
  unavailable: { glyph: '–', fg: color.stone, bg: color.stoneSoft },
};

export function ResultScreen({ nav, recordId }: { nav: Nav; recordId: string }) {
  const { t, state } = useStore();
  const record = state.records.find(r => r.id === recordId);
  const field = record && state.fields.find(f => f.id === record.fieldId);
  if (!record) return <Body>{t('common.loading')}</Body>;

  return (
    <View style={{ gap: space(4) }}>
      <View style={{ gap: space(1) }}>
        <Text style={type.label}>{(field?.name ?? '').toUpperCase()} · {formatDateTime(record.createdAt, state.settings.locale)}</Text>
        <H1>{t('result.title')}</H1>
      </View>
      {record.analysis.kind === 'done'
        ? <AnalysisView record={record} analysis={record.analysis.analysis} via={record.analysis.via} nav={nav} />
        : <PendingView record={record} />}
      <ReportView record={record} />
    </View>
  );
}

function PendingView({ record }: { record: ObservationRecord }) {
  const { t, retry, busy, api } = useStore();
  const a = record.analysis;
  const working = busy[record.id] || a.kind === 'waiting';
  const msg = a.kind === 'failed'
    ? (a.code === 'network_unavailable' || a.code === 'timeout' || a.code === 'interrupted' ? t('pending.network') : a.retryable ? t('pending.error', { code: a.code }) : t('pending.permanent', { code: a.code }))
    : t('pending.analysing');
  return (
    <Card tone={a.kind === 'failed' && !a.retryable ? 'alert' : 'warn'}>
      <H2 glyph="⏳">{t('pending.title')}</H2>
      <Text accessibilityLiveRegion="polite" style={type.body}>{working ? t('pending.analysing') : msg}</Text>
      <Tag tone="info" label={t('history.onPhone').toUpperCase()} />
      {a.kind === 'failed' ? <Button label={working ? t('pending.retrying') : t('pending.retry')} icon="↻" disabled={working} onPress={() => retry(record.id)}
        hint={api.kind === 'mock' ? t('mode.mock.detail') : undefined} /> : null}
    </Card>
  );
}

function AnalysisView({ record, analysis, via, nav }: { record: ObservationRecord; analysis: Analysis; via: 'mock' | 'http'; nav: Nav }) {
  const { t, state, toggleScouting, setFollowUp } = useStore();
  const locale = state.settings.locale;
  const status = STATUS_GLYPH[analysis.status] ?? STATUS_GLYPH.unavailable;
  const strength = signalStrength(analysis.condition.confidence);
  const sourceById = new Map(analysis.sources.map(s => [s.id, s]));
  const due = followUpDue(record, new Date());
  const isDemo = analysis.data_mode === 'demo' || via === 'mock';
  // Wide screens: understanding/action on the left, spatial/weather/monitoring on the right.
  const twoCol = useWindowDimensions().width >= RESULT_TWO_COLUMN_MIN;
  // Ranked, located scouting points are listed with the map when it is available.
  const doNext = analysis.map.status === 'available' ? analysis.scouting.filter(s => typeof s.rank !== 'number') : analysis.scouting;

  return (
    <View style={{ flexDirection: twoCol ? 'row' : 'column', gap: space(4), alignItems: 'flex-start' }}>
    <View style={{ gap: space(4), flex: twoCol ? 1 : undefined, width: twoCol ? undefined : '100%' }}>
      <View accessibilityRole="alert" style={{ backgroundColor: isDemo ? color.turmeric : color.skySoft, borderRadius: radius.sm, padding: space(3), borderWidth: 2, borderColor: isDemo ? '#8A6A00' : color.sky }}>
        <Text style={[type.label, { color: color.ink, fontSize: 14 }]}>{isDemo ? t('result.demoStamp') : t('result.liveStamp')}</Text>
        {via === 'mock' ? <Text style={[type.small, { color: color.ink, marginTop: 2 }]}>{t('result.mockExample')}</Text>
          : !isDemo ? <Text style={[type.small, { color: color.ink, marginTop: 2 }]}>{t('result.estimateUncalibrated')}</Text> : null}
        {record.observation.provenance.adapter === 'farmer-report' ? <Text style={[type.small, { color: color.ink, marginTop: 2 }]}>{t('result.fromReport')}</Text> : null}
      </View>

      <Card style={{ borderColor: status.fg, borderWidth: 2.5 }}>
        <Row wrap>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5), backgroundColor: status.bg, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: space(1), borderWidth: 1.5, borderColor: status.fg }}>
            <Text aria-hidden style={{ color: status.fg, fontWeight: '900' }}>{status.glyph}</Text>
            <Text style={{ color: status.fg, fontWeight: '800', fontSize: 15 }}>{t(`result.status.${analysis.status}` as MessageId)}</Text>
          </View>
        </Row>
        <Text accessibilityRole="header" style={type.display}>{analysis.condition.label}</Text>
        {analysis.condition.pathogen && !analysis.condition.abstained ? <Text style={[type.small, { fontStyle: 'italic' }]}>{analysis.condition.pathogen}</Text> : null}
        {analysis.condition.abstained && analysis.status !== 'unsupported' ? <Body style={{ fontWeight: '700' }}>{t('result.abstained')}</Body> : null}
        <Body>{analysis.condition.uncertainty}</Body>
        {analysis.condition.differentials?.length ? (
          <View style={{ gap: space(1), backgroundColor: color.turmericSoft, borderRadius: radius.sm, padding: space(3) }}>
            <Text style={type.label}>{t('result.differentials').toUpperCase()}</Text>
            {analysis.condition.differentials.map(d => <Body key={d.condition_id}>• {d.label}</Body>)}
            {analysis.condition.support_blocked_by_differential ? <Body soft>{t('result.blocked')}</Body> : null}
          </View>
        ) : null}
        {analysis.condition.severity && typeof analysis.condition.severity.affected_leaf_area_pct === 'number' ? (
          <View style={{ gap: 2 }}>
            <Body>{t('result.severity', { pct: analysis.condition.severity.affected_leaf_area_pct, level: analysis.condition.severity.level ?? '—' })}</Body>
            {analysis.condition.severity.scope ? <Body soft>{analysis.condition.severity.scope}</Body> : null}
          </View>
        ) : null}
        <LocalizationNote analysis={analysis} locale={locale} />
        {analysis.status === 'unsupported' ? <Body>{t('result.unsupported')}</Body> : null}
      </Card>

      {analysis.status !== 'unsupported' ? (
        <Card>
          <H2 glyph="◔">{t('result.howSure')}</H2>
          <StrengthMeter level={strength} label={t(`result.strength.${strength}`)} />
          <Body soft>{t('result.notProbability', { score: analysis.condition.confidence.toFixed(2) })}</Body>
          <EvidenceList evidence={analysis.evidence} />
        </Card>
      ) : null}

      <Card>
        <H2 glyph="☑">{t('result.doNext')}</H2>
        {doNext.length ? doNext.map(s => (
          <Choice key={s.id} label={s.text} selected={record.completedScouting.includes(s.id)} onPress={() => toggleScouting(record.id, s.id)} />
        )) : <Body soft>{t('result.noScouting')}</Body>}
        {analysis.status === 'needs_review' || analysis.status === 'unavailable' ? <Body>{t('result.moreInfo')}</Body> : null}
        <Button kind="secondary" icon="＋" label={t('result.addEvidence')} onPress={() => nav.push({ name: 'check', fieldId: record.fieldId })} />
      </Card>

      <Card>
        <H2 glyph="✎">{t('result.guidance')}</H2>
        {analysis.recommendations.length ? analysis.recommendations.map(r => {
          const sources = r.source_ids.map(id => sourceById.get(id)).filter(Boolean) as Analysis['sources'];
          return (
            <View key={r.id} style={{ gap: space(1), borderLeftWidth: 4, borderLeftColor: sources.length ? color.leaf : color.turmeric, paddingLeft: space(3) }}>
              <Body>{r.text}</Body>
              {sources.length ? sources.map(s => (
                <Pressable key={s.id} accessibilityRole="link" onPress={() => Linking.openURL(s.url)}>
                  <Text style={[type.small, { color: color.sky, textDecorationLine: 'underline' }]}>{s.title} — {t('result.accessed', { date: formatDate(s.accessed_at, locale) })}</Text>
                </Pressable>
              )) : <Tag tone="warn" label={`⚠ ${t('result.noSource')}`} />}
            </View>
          );
        }) : <Body soft>{t('result.noGuidance')}</Body>}
        <ScopeCard scope={analysis.guidance_scope} />
        <SourcesList sources={analysis.sources} />
      </Card>

      <ReviewCard analysis={analysis} record={record} />
    </View>
    <View style={{ gap: space(4), flex: twoCol ? 1 : undefined, width: twoCol ? undefined : '100%' }}>
      <RiskMap map={analysis.map} scouting={analysis.scouting} />
      <WeatherCard env={analysis.environment} risk={analysis.weather_risk} />

      <Card>
        <H2 glyph="↻">{t('result.followUp')}</H2>
        <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
          {[3, 7, 14].map(n => <Choice key={n} multi={false} label={t('result.followUp.in', { n })} selected={record.followUpDays === n} onPress={() => setFollowUp(record.id, n)} />)}
          <Choice multi={false} label={t('result.followUp.clear')} selected={record.followUpDays === undefined} onPress={() => setFollowUp(record.id, undefined)} />
        </View>
        <Body soft>{due ? t('result.followUp.set', { date: formatDate(due.toISOString(), locale) }) : t('result.followUp.none')}</Body>
      </Card>

      <Details analysis={analysis} record={record} via={via} />
    </View>
    </View>
  );
}

function LocalizationNote({ analysis, locale }: { analysis: Analysis; locale: string }) {
  const { t } = useStore();
  const loc = analysis.localization;
  if (loc) {
    if (loc.fallback || (locale !== 'en' && loc.used === 'en')) return <Body soft>ⓘ {t('result.loc.fallback')}</Body>;
    if (loc.used && loc.used !== 'en' && loc.reviewed_by_native_speaker === false) return <Body soft>ⓘ {t('result.loc.unreviewed')}</Body>;
    return null;
  }
  return locale !== 'en' ? <Body soft>ⓘ {t('lang.contentEnglish')}</Body> : null;
}

function ReportView({ record }: { record: ObservationRecord }) {
  const { t } = useStore();
  return (
    <Card>
      <H2 glyph="✍">{t('result.yourReport')}</H2>
      <Body>{record.symptoms.map(s => t(`symptom.${s}` as MessageId)).join(' · ')}</Body>
      <Body soft>{t('check.certainty.q')} {t(`certainty.${record.certainty}`)}</Body>
      {record.evidence.length ? <Body soft>✓ {record.evidence.map(e => t(`evidence.${e}` as MessageId)).join(' · ')}</Body> : null}
      {record.note ? <Body>“{record.note}”</Body> : null}
      {record.photoUri ? (
        <View style={{ gap: space(1) }}>
          <Text style={type.label}>{t('result.photo').toUpperCase()}</Text>
          {record.photoStorage === 'picker' ? <Text accessibilityRole="alert" style={[type.small, { color: color.clay }]}>⚠ {t('result.photo.notDurable')}</Text> : null}
          <Image source={{ uri: record.photoUri }} style={{ width: '100%', height: 200, borderRadius: radius.sm, backgroundColor: color.stoneSoft }} resizeMode="cover" accessibilityLabel={t('result.photo')} />
        </View>
      ) : null}
    </Card>
  );
}

function Details({ analysis, record, via }: { analysis: Analysis; record: ObservationRecord; via: 'mock' | 'http' }) {
  const { t, state } = useStore();
  const [open, setOpen] = useState(false);
  const locale = state.settings.locale;
  const rows: [string, string][] = [
    [t('result.details.mode'), analysis.data_mode],
    [t('result.details.adapter'), analysis.provenance.adapter],
    [t('result.details.source'), analysis.provenance.source],
    [t('result.details.generated'), formatDateTime(analysis.generated_at, locale)],
    [t('result.details.observed'), formatDateTime(record.observation.observed_at, locale)],
    [t('result.details.id'), record.id],
    [t('result.details.contract'), analysis.contract_version],
  ];
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={type.heading}>{open ? '▾' : '▸'}  {t('result.details')}</Text>
      </Pressable>
      <Body soft>{via === 'http' ? t('result.sent.http') : t('result.sent.mock')}</Body>
      <Body soft>{t('result.sync')}</Body>
      {open ? rows.map(([k, v]) => (
        <View key={k} style={{ borderTopWidth: 1, borderTopColor: color.line, paddingTop: space(2) }}>
          <Text style={type.label}>{k.toUpperCase()}</Text>
          <Text selectable style={type.body}>{v}</Text>
        </View>
      )) : null}
    </Card>
  );
}
