import React, { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import type { Analysis } from '../api';
import { followUpDue, signalStrength, type ObservationRecord } from '../domain/model';
import { formatDate, formatDateTime, type MessageId } from '../i18n';
import type { Nav } from '../navigation';
import { useStore } from '../state/store';
import { Body, Button, Card, Choice, H1, H2, Row, StrengthMeter, Tag } from '../ui/components';
import { color, radius, space, type } from '../ui/theme';
import { RiskMap } from './RiskMap';

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
    ? (a.code === 'network_unavailable' || a.code === 'interrupted' ? t('pending.network') : a.retryable ? t('pending.error', { code: a.code }) : t('pending.permanent', { code: a.code }))
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
  const field = state.fields.find(f => f.id === record.fieldId);
  const sourceById = new Map(analysis.sources.map(s => [s.id, s]));
  const due = followUpDue(record, new Date());
  const isDemo = analysis.data_mode === 'demo' || via === 'mock';

  return (
    <View style={{ gap: space(4) }}>
      <View accessibilityRole="alert" style={{ backgroundColor: isDemo ? color.turmeric : color.skySoft, borderRadius: radius.sm, padding: space(3), borderWidth: 2, borderColor: isDemo ? '#8A6A00' : color.sky }}>
        <Text style={[type.label, { color: color.ink, fontSize: 14 }]}>{isDemo ? t('result.demoStamp') : t('result.liveStamp')}</Text>
      </View>

      <Card style={{ borderColor: status.fg, borderWidth: 2.5 }}>
        <Row wrap>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5), backgroundColor: status.bg, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: space(1), borderWidth: 1.5, borderColor: status.fg }}>
            <Text aria-hidden style={{ color: status.fg, fontWeight: '900' }}>{status.glyph}</Text>
            <Text style={{ color: status.fg, fontWeight: '800', fontSize: 15 }}>{t(`result.status.${analysis.status}` as MessageId)}</Text>
          </View>
        </Row>
        <Text accessibilityRole="header" style={type.display}>{analysis.condition.label}</Text>
        <Body>{analysis.condition.uncertainty}</Body>
        {locale !== 'en' ? <Body soft>ⓘ {t('lang.contentEnglish')}</Body> : null}
        {analysis.status === 'unsupported' ? <Body>{t('result.unsupported')}</Body> : null}
      </Card>

      {analysis.status !== 'unsupported' ? (
        <Card>
          <H2 glyph="◔">{t('result.howSure')}</H2>
          <StrengthMeter level={strength} label={t(`result.strength.${strength}`)} />
          <Body soft>{t('result.notProbability', { score: analysis.condition.confidence.toFixed(2) })}</Body>
        </Card>
      ) : null}

      <Card>
        <H2 glyph="☑">{t('result.doNext')}</H2>
        {analysis.scouting.length ? analysis.scouting.map(s => (
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
      </Card>

      <EnvironmentCard env={analysis.environment} />
      <RiskMap map={analysis.map} fieldLocation={field?.location} />

      <Card>
        <H2 glyph="↻">{t('result.followUp')}</H2>
        <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
          {[3, 7, 14].map(n => <Choice key={n} multi={false} label={t('result.followUp.in', { n })} selected={record.followUpDays === n} onPress={() => setFollowUp(record.id, n)} />)}
          <Choice multi={false} label={t('result.followUp.clear')} selected={record.followUpDays === undefined} onPress={() => setFollowUp(record.id, undefined)} />
        </View>
        <Body soft>{due ? t('result.followUp.set', { date: formatDate(due.toISOString(), locale) }) : t('result.followUp.none')}</Body>
      </Card>

      <Details analysis={analysis} record={record} />
    </View>
  );
}

function EnvironmentCard({ env }: { env: Analysis['environment'] }) {
  const { t, state } = useStore();
  const v = (n: number | null, unit: string) => n === null ? t('result.env.missing') : `${n} ${unit}`;
  return (
    <Card tone={env.status === 'stale' ? 'warn' : undefined}>
      <H2 glyph="☁">{t('result.env')}</H2>
      {env.status === 'unavailable' ? <Body>{t('result.env.unavailable')}</Body> : (
        <>
          <Body>{env.status === 'stale' ? `⚠ ${t('result.env.stale', { date: formatDateTime(env.as_of, state.settings.locale) })}` : t('result.env.fresh', { date: formatDateTime(env.as_of, state.settings.locale) })}</Body>
          <Row wrap style={{ gap: space(3) }}>
            {[[t('result.env.temp'), v(env.temperature_c, '°C')], [t('result.env.humidity'), v(env.relative_humidity_pct, '%')], [t('result.env.rain'), v(env.rainfall_mm, 'mm')]].map(([k, val]) => (
              <View key={k} style={{ minWidth: 120, flexGrow: 1, padding: space(3), borderRadius: radius.sm, backgroundColor: color.paper }}>
                <Text style={type.label}>{k.toUpperCase()}</Text>
                <Text style={type.title}>{val}</Text>
              </View>
            ))}
          </Row>
        </>
      )}
    </Card>
  );
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
          <Image source={{ uri: record.photoUri }} style={{ width: '100%', height: 200, borderRadius: radius.sm, backgroundColor: color.stoneSoft }} resizeMode="cover" accessibilityLabel={t('result.photo')} />
        </View>
      ) : null}
    </Card>
  );
}

function Details({ analysis, record }: { analysis: Analysis; record: ObservationRecord }) {
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
