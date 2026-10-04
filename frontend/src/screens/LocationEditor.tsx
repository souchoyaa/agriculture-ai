import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { DISPLAY_DECIMALS, parseCoordinates, type FieldLocation } from '../domain/location';
import type { MessageId } from '../i18n';
import { locateOnce } from '../locationService';
import { useStore } from '../state/store';
import { Body, Button, Card, Row } from '../ui/components';
import { color, space, type } from '../ui/theme';
import { inputStyle } from './FieldsScreen';

export interface LocationValue { value: FieldLocation; source: 'gps' | 'manual' }

/**
 * Optional field location: device GPS on tap (permission asked only then) or typed coordinates.
 * Always rounded; denial/unavailability keeps the field usable without a location.
 */
export function LocationEditor({ value, onChange }: { value?: LocationValue; onChange: (v?: LocationValue) => void }) {
  const { t } = useStore();
  const [mode, setMode] = useState<'idle' | 'locating' | 'manual'>('idle');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [msg, setMsg] = useState<{ id: MessageId; tone: 'warn' | 'alert' }>();

  async function useGps() {
    setMsg(undefined); setMode('locating');
    const r = await locateOnce();
    setMode('idle');
    if (r.kind === 'ok') onChange({ value: r.location, source: 'gps' });
    else setMsg({ id: r.kind === 'denied' ? 'location.denied' : 'location.unavailable', tone: 'warn' });
  }

  function saveManual() {
    const r = parseCoordinates(lat, lon);
    if (!r.ok) { setMsg({ id: `location.error.${r.error}` as MessageId, tone: 'alert' }); return; }
    setMsg(undefined); setMode('idle'); onChange({ value: r.value, source: 'manual' });
  }

  return (
    <View style={{ gap: space(2) }}>
      <Text style={type.heading}>{t('location.title')}</Text>
      {value ? (
        <Card>
          <Body>{value.value.latitude.toFixed(DISPLAY_DECIMALS)}, {value.value.longitude.toFixed(DISPLAY_DECIMALS)}</Body>
          {value.value.accuracy_m ? <Body soft>{t('location.accuracy', { m: value.value.accuracy_m })}</Body> : null}
          <Body soft>{t(value.source === 'gps' ? 'location.fromGps' : 'location.fromManual')}</Body>
          <Button kind="quiet" icon="✕" label={t('location.remove')} onPress={() => onChange(undefined)} />
        </Card>
      ) : null}
      {mode === 'manual' ? (
        <View style={{ gap: space(2) }}>
          <TextInput value={lat} onChangeText={setLat} placeholder="-1.950" keyboardType="numbers-and-punctuation" accessibilityLabel={t('location.latitude')} style={inputStyle} placeholderTextColor={color.stone} />
          <TextInput value={lon} onChangeText={setLon} placeholder="30.060" keyboardType="numbers-and-punctuation" accessibilityLabel={t('location.longitude')} style={inputStyle} placeholderTextColor={color.stone} />
          <Row wrap>
            <Button label={t('location.saveManual')} onPress={saveManual} />
            <Button kind="quiet" label={t('fields.add.cancel')} onPress={() => { setMode('idle'); setMsg(undefined); }} />
          </Row>
        </View>
      ) : (
        <Row wrap>
          <Button kind="secondary" icon="◎" label={mode === 'locating' ? t('location.locating') : t('location.useGps')} disabled={mode === 'locating'} onPress={useGps} style={{ flexGrow: 1 }} />
          <Button kind="secondary" icon="✎" label={t('location.enterManual')} onPress={() => { setMode('manual'); setMsg(undefined); }} style={{ flexGrow: 1 }} />
        </Row>
      )}
      {msg ? <Text accessibilityRole="alert" style={[type.body, { color: msg.tone === 'alert' ? color.clay : '#6B4B00' }]}>{t(msg.id)}</Text> : null}
      <Body soft>🔒 {t('location.privacy')}</Body>
    </View>
  );
}
