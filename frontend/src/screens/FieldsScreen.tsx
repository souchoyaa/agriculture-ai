import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { fieldAttention, sortFieldsByAttention, type Field } from '../domain/model';
import { formatDate, type MessageId } from '../i18n';
import type { Nav } from '../navigation';
import { useStore } from '../state/store';
import { AttentionBadge, Body, Button, Card, Choice, H1, H2, Row, Tag } from '../ui/components';
import { color, radius, space, type } from '../ui/theme';

export const CROPS = ['coffee', 'maize', 'beans', 'banana'] as const;

export function useFieldSummaries() {
  const { state } = useStore();
  return useMemo(() => {
    const now = new Date();
    return sortFieldsByAttention(state.fields.map(field => ({ field, ...fieldAttention(state.records.filter(r => r.fieldId === field.id), now) })));
  }, [state.fields, state.records]);
}

export function reasonText(t: ReturnType<typeof useStore>['t'], reason: string, condition?: string) {
  return t(`reason.${reason}` as MessageId, { condition: condition ?? '' });
}

export function FieldsScreen({ nav }: { nav: Nav }) {
  const { t, state } = useStore();
  const summaries = useFieldSummaries();
  const actCount = summaries.filter(s => s.level === 'act').length;
  const top = summaries[0] && summaries[0].level !== 'ok' ? summaries[0] : undefined;
  const [adding, setAdding] = useState(false);

  return (
    <View style={{ gap: space(4) }}>
      <View style={{ gap: space(1) }}>
        <H1>{t('fields.title')}</H1>
        <Body soft>{actCount > 0 ? t('fields.summary.act', { n: actCount }) : t('fields.summary.none')}</Body>
      </View>

      {top ? (
        <View style={{ backgroundColor: color.leafDark, borderRadius: radius.lg, padding: space(5), gap: space(3) }}>
          <Text style={[type.label, { color: '#CFE3D5' }]}>{t('fields.startHere').toUpperCase()}</Text>
          <Text accessibilityRole="header" style={[type.display, { color: '#fff' }]}>{top.field.name}</Text>
          <AttentionBadge level={top.level} label={t(`attention.${top.level}`)} />
          <Text style={[type.body, { color: '#F1F5EF' }]}>{reasonText(t, top.reason, condLabel(top.latest))}</Text>
          <Row wrap>
            {top.latest && top.latest.analysis.kind !== 'not_requested'
              ? <Button kind="secondary" label={t('fields.open')} a11yLabel={`${t('fields.open')}: ${top.field.name}`} icon="→" onPress={() => nav.push({ name: 'result', recordId: top.latest!.id })} />
              : null}
            <Button kind="secondary" label={t('fields.checkThis')} a11yLabel={`${t('fields.checkThis')}: ${top.field.name}`} icon="＋" onPress={() => nav.push({ name: 'check', fieldId: top.field.id })} />
          </Row>
        </View>
      ) : null}

      <View style={{ gap: space(3) }}>
        {summaries.filter(s => s !== top).map(s => <FieldCard key={s.field.id} summary={s} nav={nav} />)}
      </View>

      {adding ? <AddField onDone={() => setAdding(false)} /> : <Button kind="secondary" icon="＋" label={t('fields.add')} onPress={() => setAdding(true)} />}
      <Body soft>{t('history.count', { n: state.records.length })}</Body>
    </View>
  );
}

function condLabel(r?: { analysis: { kind: string; analysis?: { condition: { label: string } } } }) {
  return r?.analysis.kind === 'done' ? r.analysis.analysis?.condition.label : undefined;
}

function FieldCard({ summary, nav }: { summary: ReturnType<typeof useFieldSummaries>[number]; nav: Nav }) {
  const { t, state } = useStore();
  const { field, level, latest, reason } = summary;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} wrap>
        <View style={{ flex: 1, minWidth: 180, gap: space(1) }}>
          <Text accessibilityRole="header" style={type.title}>{field.name}</Text>
          <Row wrap>
            <Tag label={t(`crop.${field.crop}` as MessageId).toUpperCase()} />
            {field.demo ? <Tag tone="warn" label={t('fields.demoTag').toUpperCase()} /> : null}
          </Row>
        </View>
        <AttentionBadge level={level} label={t(`attention.${level}`)} />
      </Row>
      <Body>{reasonText(t, reason, condLabel(latest))}</Body>
      <Body soft>{latest ? t('fields.lastChecked', { date: formatDate(latest.createdAt, state.settings.locale) }) : t('fields.neverChecked')}</Body>
      <Row wrap>
        <Button label={t('fields.checkThis')} a11yLabel={`${t('fields.checkThis')}: ${field.name}`} icon="＋" onPress={() => nav.push({ name: 'check', fieldId: field.id })} style={{ flexGrow: 1 }} />
        <Button kind="secondary" label={t('fields.open')} a11yLabel={`${t('fields.open')}: ${field.name}`} icon="→" onPress={() => nav.push({ name: 'field', fieldId: field.id })} style={{ flexGrow: 1 }} />
      </Row>
    </Card>
  );
}

function AddField({ onDone }: { onDone: (f?: Field) => void }) {
  const { t, addField } = useStore();
  const [name, setName] = useState('');
  const [crop, setCrop] = useState<string>('coffee');
  const [error, setError] = useState(false);
  return (
    <Card>
      <H2>{t('fields.add')}</H2>
      <Text nativeID="field-name-label" style={type.heading}>{t('fields.add.name')}</Text>
      <TextInput value={name} onChangeText={v => { setName(v); setError(false); }} accessibilityLabel={t('fields.add.name')}
        style={inputStyle} placeholderTextColor={color.stone} autoFocus />
      {error ? <Text accessibilityRole="alert" style={[type.body, { color: color.clay }]}>{t('fields.add.nameRequired')}</Text> : null}
      <Text style={type.heading}>{t('fields.add.crop')}</Text>
      <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
        {CROPS.map(c => <Choice key={c} multi={false} label={t(`crop.${c}`)} selected={crop === c} onPress={() => setCrop(c)} />)}
      </View>
      <Row wrap>
        <Button label={t('fields.add.save')} onPress={async () => { if (!name.trim()) { setError(true); return; } onDone(await addField(name, crop)); }} />
        <Button kind="quiet" label={t('fields.add.cancel')} onPress={() => onDone()} />
      </Row>
    </Card>
  );
}

export const inputStyle = { ...type.body, minHeight: 52, borderWidth: 2, borderColor: color.border, borderRadius: radius.sm, paddingHorizontal: space(3), backgroundColor: '#fff' };
