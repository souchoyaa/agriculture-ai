import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { fieldAttention, sortFieldsByAttention, type Field } from '../domain/model';
import { formatDate, type MessageId } from '../i18n';
import type { Nav } from '../navigation';
import { useStore } from '../state/store';
import { LinearGradient } from 'expo-linear-gradient';
import { AttentionBadge, Body, Button, Card, Choice, H1, H2, Icon, Row, Tag } from '../ui/components';
import { color, font, gradient, radius, shadow, space, type } from '../ui/theme';
import { LocationEditor, type LocationValue } from './LocationEditor';

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
  const wide = useWindowDimensions().width >= 1180;

  return (
    <View style={{ gap: space(5) }}>
      <View style={{ gap: space(1) }}>
        <H1>{t('fields.title')}</H1>
        <Body soft>{actCount > 0 ? t('fields.summary.act', { n: actCount }) : t('fields.summary.none')}</Body>
      </View>

      {top ? (
        <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius.lg, padding: space(5), gap: space(3), overflow: 'hidden' }, shadow]}>
          <Icon name={CROP_ICON[top.field.crop] ?? 'sprout'} size={150} color="rgba(255,255,255,0.08)" style={{ position: 'absolute', right: -24, top: -18 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <Icon name="target" size={16} color="#BFE3CB" />
            <Text style={[type.label, { color: '#BFE3CB' }]}>{t('fields.startHere').toUpperCase()}</Text>
          </View>
          <Text accessibilityRole="header" style={[type.display, { color: '#fff' }]}>{top.field.name}</Text>
          <AttentionBadge level={top.level} label={t(`attention.${top.level}`)} />
          <Text style={[type.body, { color: '#E8F3EC' }]}>{reasonText(t, top.reason, condLabel(top.latest))}</Text>
          <Row wrap style={{ marginTop: space(1) }}>
            <Button kind="light" testID={`check-field-${top.field.id}`} label={t('fields.checkThis')} a11yLabel={`${t('fields.checkThis')}: ${top.field.name}`} icon="camera-plus-outline" onPress={() => nav.push({ name: 'check', fieldId: top.field.id })} style={{ flexGrow: 1 }} />
            {top.latest && top.latest.analysis.kind !== 'not_requested'
              ? <Button kind="quiet" label={t('fields.open')} a11yLabel={`${t('fields.open')}: ${top.field.name}`} icon="arrow-right" onPress={() => nav.push({ name: 'result', recordId: top.latest!.id })} style={{ borderColor: 'rgba(255,255,255,0.35)', flexGrow: 1 }} textColor="#fff" />
              : null}
          </Row>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('field.timeline')}: ${top.field.name}`} onPress={() => nav.push({ name: 'field', fieldId: top.field.id })}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space(2), alignSelf: 'flex-start' }}>
            <Icon name="history" size={18} color="#BFE3CB" />
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: '#E8F3EC' }}>{t('field.timeline')}</Text>
          </Pressable>
        </LinearGradient>
      ) : null}

      <View style={wide ? { flexDirection: 'row', flexWrap: 'wrap', gap: space(4) } : { gap: space(3) }}>
        {summaries.filter(s => s !== top).map(s => <View key={s.field.id} style={wide ? { flexBasis: '47%', flexGrow: 1 } : undefined}><FieldCard summary={s} nav={nav} /></View>)}
      </View>

      {adding ? <AddField onDone={() => setAdding(false)} /> : <Button kind="secondary" icon="plus" label={t('fields.add')} onPress={() => setAdding(true)} />}
      <Row style={{ justifyContent: 'center', gap: space(1.5) }}>
        <Icon name="cellphone-lock" size={16} color={color.muted} />
        <Text style={[type.small, { color: color.muted }]}>{t('history.count', { n: state.records.length })}</Text>
      </Row>
    </View>
  );
}

export const CROP_ICON: Record<string, string> = { coffee: 'fruit-cherries', maize: 'corn', beans: 'seed-outline', banana: 'leaf' };

function condLabel(r?: { analysis: { kind: string; analysis?: { condition: { label: string } } } }) {
  return r?.analysis.kind === 'done' ? r.analysis.analysis?.condition.label : undefined;
}

function FieldCard({ summary, nav }: { summary: ReturnType<typeof useFieldSummaries>[number]; nav: Nav }) {
  const { t, state } = useStore();
  const { field, level, latest, reason } = summary;
  return (
    <Card style={{ gap: space(3) }}>
      <Row style={{ alignItems: 'flex-start', gap: space(3) }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: color.leafTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={CROP_ICON[field.crop] ?? 'sprout'} size={26} color={color.leaf} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text accessibilityRole="header" style={type.title}>{field.name}</Text>
          <Row wrap style={{ gap: 6 }}>
            <Text style={type.small}>{t(`crop.${field.crop}` as MessageId)}</Text>
            {field.demo ? <Tag tone="warn" icon="flask-outline" label={t('fields.demoTag')} /> : null}
          </Row>
        </View>
      </Row>
      <AttentionBadge level={level} label={t(`attention.${level}`)} />
      <Body>{reasonText(t, reason, condLabel(latest))}</Body>
      <Row style={{ gap: space(1.5) }}>
        <Icon name="calendar-check-outline" size={16} color={color.muted} />
        <Text style={[type.small, { color: color.muted }]}>{latest ? t('fields.lastChecked', { date: formatDate(latest.createdAt, state.settings.locale) }) : t('fields.neverChecked')}</Text>
      </Row>
      <Row wrap>
        <Button testID={`check-field-${field.id}`} label={t('fields.checkThis')} a11yLabel={`${t('fields.checkThis')}: ${field.name}`} icon="camera-plus-outline" onPress={() => nav.push({ name: 'check', fieldId: field.id })} style={{ flexGrow: 1 }} />
        <Button kind="secondary" label={t('fields.open')} a11yLabel={`${t('fields.open')}: ${field.name}`} icon="arrow-right" onPress={() => nav.push({ name: 'field', fieldId: field.id })} style={{ flexGrow: 1 }} />
      </Row>
    </Card>
  );
}

function AddField({ onDone }: { onDone: (f?: Field) => void }) {
  const { t, addField } = useStore();
  const [name, setName] = useState('');
  const [crop, setCrop] = useState<string>('coffee');
  const [error, setError] = useState(false);
  const [location, setLocation] = useState<LocationValue>();
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
      <LocationEditor value={location} onChange={setLocation} />
      <Row wrap>
        <Button label={t('fields.add.save')} onPress={async () => { if (!name.trim()) { setError(true); return; } onDone(await addField(name, crop, location)); }} />
        <Button kind="quiet" label={t('fields.add.cancel')} onPress={() => onDone()} />
      </Row>
    </Card>
  );
}

export const inputStyle = { ...type.body, minHeight: 52, borderWidth: 2, borderColor: color.border, borderRadius: radius.sm, paddingHorizontal: space(3), backgroundColor: '#fff' };
