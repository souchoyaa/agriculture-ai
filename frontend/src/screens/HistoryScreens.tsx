import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fieldAttention, followUpDue, type ObservationRecord } from '../domain/model';
import { formatDate, formatDateTime, type MessageId } from '../i18n';
import type { Nav } from '../navigation';
import { useStore } from '../state/store';
import { AttentionBadge, Body, Button, Card, H1, H2, Row, Tag } from '../ui/components';
import { color, radius, space, type } from '../ui/theme';
import type { PS } from '../ui/components';
import { reasonText } from './FieldsScreen';
import { LocationEditor } from './LocationEditor';

/** One check in a timeline: what was found, its state and any follow-up. */
function RecordRow({ record, nav, showField }: { record: ObservationRecord; nav: Nav; showField?: boolean }) {
  const { t, state } = useStore();
  const locale = state.settings.locale;
  const field = state.fields.find(f => f.id === record.fieldId);
  const a = record.analysis;
  const due = followUpDue(record, new Date());
  const title = a.kind === 'done' ? a.analysis.condition.label : t('history.waiting');
  const statusTag = a.kind === 'done'
    ? <Tag tone={a.analysis.status === 'needs_review' ? 'alert' : 'stone'} label={t(`result.status.${a.analysis.status}` as MessageId).toUpperCase()} />
    : <Tag tone="warn" label={`⏳ ${t('history.waiting').toUpperCase()}`} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${showField && field ? field.name + ', ' : ''}${title}, ${formatDateTime(record.createdAt, locale)}`}
      onPress={() => nav.push({ name: 'result', recordId: record.id })}
      style={({ pressed, focused }: PS) => [{ flexDirection: 'row', gap: space(3), padding: space(3), borderRadius: radius.md, backgroundColor: pressed ? color.stoneSoft : color.card, borderWidth: 1.5, borderColor: color.border, minHeight: 64 }, focused && { outlineStyle: 'solid', outlineWidth: 3, outlineColor: color.focus } as object]}>
      <View style={{ width: 4, borderRadius: 2, backgroundColor: a.kind === 'done' && a.analysis.status === 'needs_review' ? color.clay : a.kind === 'done' ? color.stone : color.turmeric }} />
      <View style={{ flex: 1, gap: space(1) }}>
        <Text style={type.label}>{formatDateTime(record.createdAt, locale).toUpperCase()}{showField && field ? ` · ${field.name.toUpperCase()}` : ''}</Text>
        <Text style={type.heading}>{title}</Text>
        <Row wrap>
          {statusTag}
          {a.kind === 'done' && (a.via === 'mock' || a.analysis.data_mode === 'demo') ? <Tag tone="warn" label={t('common.demo').toUpperCase()} /> : null}
          <Tag tone="info" label={t('history.onPhone').toUpperCase()} />
          {due ? <Tag tone={due.getTime() <= Date.now() ? 'alert' : 'stone'} label={(due.getTime() <= Date.now() ? t('history.followUpDue') : t('history.followUpOn', { date: formatDate(due.toISOString(), locale) })).toUpperCase()} /> : null}
          {record.photoUri ? <Tag label="📷" /> : null}
        </Row>
      </View>
      <Text aria-hidden style={[type.title, { color: color.stone, alignSelf: 'center' }]}>›</Text>
    </Pressable>
  );
}

export function HistoryScreen({ nav }: { nav: Nav }) {
  const { t, state } = useStore();
  const records = [...state.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <View style={{ gap: space(4) }}>
      <H1>{t('history.title')}</H1>
      <Body soft>{t('history.count', { n: records.length })}</Body>
      {records.length ? records.map(r => <RecordRow key={r.id} record={r} nav={nav} showField />) : <Card><Body>{t('history.empty')}</Body></Card>}
    </View>
  );
}

export function FieldScreen({ nav, fieldId }: { nav: Nav; fieldId: string }) {
  const { t, state, setFieldLocation } = useStore();
  const field = state.fields.find(f => f.id === fieldId);
  if (!field) return <Body>{t('common.loading')}</Body>;
  const records = state.records.filter(r => r.fieldId === fieldId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const att = fieldAttention(records, new Date());
  const cond = att.latest?.analysis.kind === 'done' ? att.latest.analysis.analysis.condition.label : undefined;
  return (
    <View style={{ gap: space(4) }}>
      <View style={{ gap: space(2) }}>
        <Text style={type.label}>{t('field.title').toUpperCase()} · {t(`crop.${field.crop}` as MessageId).toUpperCase()}{field.demo ? ` · ${t('fields.demoTag').toUpperCase()}` : ''}</Text>
        <H1>{field.name}</H1>
        <AttentionBadge level={att.level} label={t(`attention.${att.level}`)} />
        <Body>{reasonText(t, att.reason, cond)}</Body>
        {field.demo ? <Body soft>{field.location ? t('field.location', { lat: field.location.latitude.toFixed(3), lon: field.location.longitude.toFixed(3) }) : t('field.noLocation')}</Body> : null}
      </View>
      <Button label={t('field.newCheck')} icon="＋" onPress={() => nav.push({ name: 'check', fieldId })} />
      {!field.demo ? (
        <Card>
          <LocationEditor value={field.location && field.locationSource ? { value: field.location, source: field.locationSource } : undefined}
            onChange={v => setFieldLocation(field.id, v)} />
        </Card>
      ) : null}
      <CompareLastTwo records={records} />
      <H2>{t('field.timeline')}</H2>
      {records.length ? records.map(r => <RecordRow key={r.id} record={r} nav={nav} />) : <Card><Body>{t('field.noChecks')}</Body></Card>}
    </View>
  );
}

/** Monitor: the two most recent analysed checks side by side. Displays backend values only; no trend is inferred. */
function CompareLastTwo({ records }: { records: ObservationRecord[] }) {
  const { t, state } = useStore();
  const done = records.filter(r => r.analysis.kind === 'done').slice(0, 2);
  if (done.length < 2) return null;
  const cell = (r: ObservationRecord, label: string) => {
    const a = r.analysis.kind === 'done' ? r.analysis.analysis : undefined;
    if (!a) return null;
    return (
      <View style={{ flex: 1, minWidth: 140, gap: space(1), padding: space(3), borderRadius: radius.sm, backgroundColor: color.paper }}>
        <Text style={type.label}>{label.toUpperCase()} · {formatDate(r.createdAt, state.settings.locale)}</Text>
        <Text style={type.heading}>{a.condition.label}</Text>
        <Text style={type.small}>{t(`result.status.${a.status}` as MessageId)}</Text>
        <Text style={type.small}>{t('field.compare.score', { score: a.condition.confidence.toFixed(2) })}</Text>
        {a.weather_risk?.class ? <Text style={type.small}>{t('field.compare.weather', { cls: t(`result.weather.class.${a.weather_risk.class}` as MessageId) })}</Text> : null}
      </View>
    );
  };
  return (
    <Card>
      <H2 glyph="⇆">{t('field.compare')}</H2>
      <Row wrap style={{ alignItems: 'stretch' }}>{cell(done[1], t('field.compare.before'))}{cell(done[0], t('field.compare.latest'))}</Row>
      <Body soft>{t('field.compare.note')}</Body>
    </Card>
  );
}
