import React, { useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { MessageId } from '../i18n';
import type { Nav } from '../navigation';
import { useStore } from '../state/store';
import { Body, Button, Card, Choice, H1, Icon, Row } from '../ui/components';
import { color, font, radius, space, type } from '../ui/theme';
import { CROP_ICON } from './FieldsScreen';

const MAX_WEB_PHOTO_CHARS = 1_200_000; // localStorage-friendly data URL (≈0.9 MB JPEG)
export const SAMPLE_PHOTO = '/samples/coffee-leaf-rust.jpg';

/** Downscale a web data URL so it stays small enough to keep with the record. */
async function shrinkDataUrl(dataUrl: string, maxSide = 1280, quality = 0.8): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return dataUrl;
  const img = new window.Image(); img.src = dataUrl; await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); });
}

/**
 * Photo-first check: pick the field (only if needed), take or choose one photo, and the app does the rest.
 * No symptom questionnaire — the on-device model looks at the photo.
 */
export function CheckScreen({ nav, fieldId, analyseAnywayFor }: { nav: Nav; fieldId?: string; analyseAnywayFor?: string }) {
  const { t, state, checkPhoto } = useStore();
  const [field, setField] = useState(fieldId ?? state.fields[0]?.id);
  const [msg, setMsg] = useState<MessageId>();
  const [busy, setBusy] = useState(false);
  const selected = state.fields.find(f => f.id === field);

  async function start(source: 'camera' | 'library' | 'sample') {
    if (!field) return;
    setMsg(undefined);
    try {
      let uri: string | undefined;
      if (source === 'sample') uri = await shrinkDataUrl(await toDataUrl(SAMPLE_PHOTO));
      else {
        if (source === 'camera' && Platform.OS !== 'web') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { setMsg('check.photo.denied'); return; }
        }
        const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, base64: Platform.OS === 'web', exif: false };
        const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled || !result.assets?.[0]) return;
        const a = result.assets[0];
        uri = Platform.OS === 'web'
          ? await shrinkDataUrl(a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri)
          : a.uri;
      }
      if (Platform.OS === 'web' && uri && uri.length > MAX_WEB_PHOTO_CHARS) { setMsg('check.photo.tooLarge'); return; }
      setBusy(true);
      const record = await checkPhoto({ fieldId: field, photoUri: uri!, replacesId: analyseAnywayFor });
      nav.replace({ name: 'result', recordId: record.id });
    } catch {
      setMsg('check.photo.unavailable');
    } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: space(5) }}>
      <View style={{ gap: space(1) }}>
        <H1>{t('check.title')}</H1>
        <Body soft>{t('check.photoFirst.lead')}</Body>
      </View>

      {state.fields.length > 1 && !fieldId ? (
        <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
          {state.fields.map(f => <Choice key={f.id} multi={false} glyph={CROP_ICON[f.crop] ?? 'sprout'} label={f.name} detail={t(`crop.${f.crop}` as MessageId)} selected={field === f.id} onPress={() => setField(f.id)} />)}
        </View>
      ) : selected ? (
        <Row style={{ gap: space(2) }}>
          <Icon name={CROP_ICON[selected.crop] ?? 'sprout'} size={22} color={color.leaf} />
          <Text style={[type.heading, { fontFamily: font.heading }]}>{selected.name}</Text>
        </Row>
      ) : null}

      {selected?.demo && selected.location ? <Card tone="warn"><Body>{t('location.example')}</Body></Card> : null}
      {selected && !selected.location ? <Body soft>{t('location.missing')}</Body> : null}

      <Card style={{ alignItems: 'center', gap: space(4), paddingVertical: space(8) }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: color.leafTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="camera-iris" size={64} color={color.leaf} />
        </View>
        <Text style={[type.title, { textAlign: 'center' }]}>{t('check.photoFirst.title')}</Text>
        <View style={{ gap: space(2), alignSelf: 'stretch' }}>
          {(['tip.closeLeaf', 'tip.daylight', 'tip.underside'] as const).map(k => (
            <Row key={k} style={{ gap: space(2) }}><Icon name="check-circle-outline" size={18} color={color.leaf} /><Text style={[type.body, { flex: 1 }]}>{t(`check.${k}` as MessageId)}</Text></Row>
          ))}
        </View>
        <Button label={busy ? t('check.saving') : t('check.photo.take')} icon="camera" disabled={busy} onPress={() => start('camera')} style={{ alignSelf: 'stretch' }} />
        <Row wrap style={{ alignSelf: 'stretch' }}>
          <Button kind="secondary" label={t('check.photo.pick')} icon="image-outline" disabled={busy} onPress={() => start('library')} style={{ flexGrow: 1 }} />
          <Button kind="secondary" label={t('check.photo.sample')} icon="leaf" testID="check-sample-photo" disabled={busy} onPress={() => start('sample')} style={{ flexGrow: 1 }} />
        </Row>
      </Card>

      {msg ? <Card tone="warn"><Text accessibilityRole="alert" style={type.body}>{t(msg)}</Text></Card> : null}
      <Row style={{ gap: space(2), alignItems: 'flex-start' }}>
        <Icon name="shield-lock-outline" size={18} color={color.muted} />
        <Text style={[type.small, { flex: 1, color: color.muted }]}>{t('check.photoFirst.privacy')}</Text>
      </Row>
    </View>
  );
}

export function PhotoPreview({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: color.stoneSoft }} resizeMode="cover" accessibilityIgnoresInvertColors />;
}
