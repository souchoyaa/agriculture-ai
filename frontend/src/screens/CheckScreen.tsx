import React, { useState } from 'react';
import { Image, Platform, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { EVIDENCE_CHECKS, SYMPTOMS } from '../domain/model';
import type { MessageId } from '../i18n';
import type { Nav } from '../navigation';
import { useStore } from '../state/store';
import { Body, Button, Card, Choice, H1, H2, Row, Tag } from '../ui/components';
import { color, radius, space, type } from '../ui/theme';
import { inputStyle } from './FieldsScreen';

const MAX_WEB_PHOTO_CHARS = 700_000; // keep localStorage well under typical 5 MB quota

export function CheckScreen({ nav, fieldId }: { nav: Nav; fieldId?: string }) {
  const { t, state, saveCheck } = useStore();
  const [step, setStep] = useState(fieldId ? 2 : 1);
  const [field, setField] = useState(fieldId ?? state.fields[0]?.id);
  const [photo, setPhoto] = useState<string>();
  const [photoMsg, setPhotoMsg] = useState<MessageId>();
  const [evidence, setEvidence] = useState<string[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [certainty, setCertainty] = useState<'sure' | 'unsure'>('unsure');
  const [note, setNote] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const total = 3;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const toggleSymptom = (id: string) => {
    setError(false);
    if (id === 'none_visible') { setSymptoms(symptoms.includes(id) ? [] : [id]); return; }
    toggle(symptoms.filter(s => s !== 'none_visible'), setSymptoms, id);
  };

  async function getPhoto(source: 'camera' | 'library') {
    setPhotoMsg(undefined);
    try {
      if (source === 'camera' && Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setPhotoMsg('check.photo.denied'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4, base64: Platform.OS === 'web', exif: false };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (Platform.OS === 'web') {
        // Blob URLs vanish on reload; keep a small data URL so the saved check stays complete.
        const data = asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : asset.uri.startsWith('data:') ? asset.uri : undefined;
        if (!data || data.length > MAX_WEB_PHOTO_CHARS) { setPhotoMsg('check.photo.tooLarge'); return; }
        setPhoto(data);
      } else setPhoto(asset.uri);
    } catch {
      setPhotoMsg('check.photo.unavailable');
    }
  }

  async function save() {
    if (!field) return;
    if (symptoms.length === 0) { setError(true); return; }
    setSaving(true);
    try {
      const record = await saveCheck({ fieldId: field, symptoms, certainty, evidence, photoUri: photo, note });
      nav.replace({ name: 'result', recordId: record.id });
    } finally { setSaving(false); }
  }

  const selectedField = state.fields.find(f => f.id === field);
  const fieldName = selectedField?.name;

  return (
    <View style={{ gap: space(4) }}>
      <View style={{ gap: space(1) }}>
        <Text style={type.label}>{t('check.step', { n: step, total }).toUpperCase()}</Text>
        <H1>{t('check.title')}</H1>
        {step > 1 && fieldName ? <Body soft>{fieldName}</Body> : null}
        {selectedField?.demo && selectedField.location ? <Card tone="warn"><Body>{t('location.example')}</Body></Card> : null}
        {selectedField && !selectedField.location ? <Body soft>{t('location.missing')}</Body> : null}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: space(1), marginTop: space(2) }}>
          {[1, 2, 3].map(i => <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? color.leaf : color.stoneSoft }} />)}
        </View>
      </View>

      {step === 1 ? (
        <View style={{ gap: space(3) }}>
          <H2>{t('check.field.q')}</H2>
          <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
            {state.fields.map(f => <Choice key={f.id} multi={false} label={f.name} detail={t(`crop.${f.crop}` as MessageId)} selected={field === f.id} onPress={() => setField(f.id)} />)}
          </View>
          <Button label={t('check.next')} icon="→" disabled={!field} onPress={() => setStep(2)} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: space(3) }}>
          <H2>{t('check.photo.q')}</H2>
          {photo ? (
            <Card>
              <Image source={{ uri: photo }} style={{ width: '100%', height: 220, borderRadius: radius.sm, backgroundColor: color.stoneSoft }} resizeMode="cover" accessibilityLabel={t('result.photo')} />
              <Button kind="quiet" label={t('check.photo.remove')} icon="✕" onPress={() => setPhoto(undefined)} />
            </Card>
          ) : (
            <Row wrap>
              <Button label={t('check.photo.take')} icon="◉" onPress={() => getPhoto('camera')} style={{ flexGrow: 1 }} />
              <Button kind="secondary" label={t('check.photo.pick')} icon="▤" onPress={() => getPhoto('library')} style={{ flexGrow: 1 }} />
            </Row>
          )}
          {photoMsg ? <Card tone="warn"><Text accessibilityRole="alert" style={type.body}>{t(photoMsg)}</Text></Card> : null}
          <Card tone="info"><Body>🔒 {t('check.photo.privacy')}</Body></Card>
          <H2>{t('check.tips.title')}</H2>
          <View style={{ gap: space(2) }}>
            {EVIDENCE_CHECKS.map(id => <Choice key={id} label={t(`evidence.${id}`)} selected={evidence.includes(id)} onPress={() => toggle(evidence, setEvidence, id)} />)}
          </View>
          <Body soft>{t('check.tips.note')}</Body>
          <Row wrap>
            <Button kind="secondary" label={t('check.back')} icon="←" onPress={() => setStep(1)} />
            <Button label={t('check.next')} icon="→" onPress={() => setStep(3)} style={{ flexGrow: 1 }} />
          </Row>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: space(3) }}>
          <H2>{t('check.symptoms.q')}</H2>
          <Body soft>{t('check.symptoms.hint')}</Body>
          <View style={{ gap: space(2) }}>
            {SYMPTOMS.map(s => <Choice key={s.id} glyph={s.glyph} label={t(`symptom.${s.id}`)} selected={symptoms.includes(s.id)} onPress={() => toggleSymptom(s.id)} />)}
          </View>
          {error ? <Text accessibilityRole="alert" style={[type.heading, { color: color.clay }]}>{t('check.needSymptom')}</Text> : null}
          <H2>{t('check.certainty.q')}</H2>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {(['sure', 'unsure'] as const).map(c => (
              <View key={c} style={{ flexGrow: 1, minWidth: 140 }}>
                <Choice multi={false} label={t(`certainty.${c}`)} selected={certainty === c} onPress={() => setCertainty(c)} />
              </View>
            ))}
          </View>
          <Text style={type.heading}>{t('check.note')}</Text>
          <TextInput value={note} onChangeText={setNote} placeholder={t('check.note.placeholder')} accessibilityLabel={t('check.note')}
            multiline style={[inputStyle, { minHeight: 88, textAlignVertical: 'top', paddingTop: space(3) }]} placeholderTextColor={color.stone} />
          <Row wrap>
            <Tag tone="info" label={t('history.onPhone').toUpperCase()} />
            {photo ? <Tag label="📷" /> : null}
          </Row>
          <Row wrap>
            <Button kind="secondary" label={t('check.back')} icon="←" onPress={() => setStep(2)} />
            <Button label={saving ? t('check.saving') : t('check.save')} icon="✓" disabled={saving} onPress={save} style={{ flexGrow: 1 }} />
          </Row>
        </View>
      ) : null}
    </View>
  );
}
