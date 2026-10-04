import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { LOCALES } from '../i18n';
import type { Connection } from '../state/connection';
import { useStore } from '../state/store';
import { Body, Button, Card, Choice, H1, H2, Row } from '../ui/components';
import { color, space, type } from '../ui/theme';
import { inputStyle } from './FieldsScreen';

export function SettingsScreen() {
  const { t, state, updateSettings, testConnection, reset } = useStore();
  const [url, setUrl] = useState(state.settings.baseUrl);
  const [confirming, setConfirming] = useState(false);
  const [tested, setTested] = useState<Connection>();
  const [testing, setTesting] = useState(false);
  useEffect(() => setUrl(state.settings.baseUrl), [state.settings.baseUrl]);

  return (
    <View style={{ gap: space(4) }}>
      <H1>{t('settings.title')}</H1>

      <Card>
        <H2>{t('settings.language')}</H2>
        <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
          {LOCALES.map(l => <Choice key={l.code} multi={false} label={l.name} detail={l.supported ? undefined : t('settings.notAvailable')}
            selected={state.settings.locale === l.code} onPress={() => updateSettings({ locale: l.code })} />)}
        </View>
      </Card>

      <Card>
        <H2>{t('settings.source')}</H2>
        <View accessibilityRole="radiogroup" style={{ gap: space(2) }}>
          <Choice multi={false} label={t('settings.source.mock')} detail={t('settings.source.mock.detail')} selected={state.settings.source === 'mock'} onPress={() => { setTested(undefined); updateSettings({ source: 'mock' }); }} />
          <Choice multi={false} label={t('settings.source.http')} detail={t('settings.source.http.detail')} selected={state.settings.source === 'http'} onPress={() => { setTested(undefined); updateSettings({ source: 'http' }); }} />
        </View>
        {state.settings.source === 'http' ? (
          <View style={{ gap: space(2) }}>
            <Text style={type.heading}>{t('settings.url')}</Text>
            <TextInput value={url} onChangeText={setUrl} onBlur={() => updateSettings({ baseUrl: url.trim() })} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              accessibilityLabel={t('settings.url')} style={inputStyle} />
            <Button kind="secondary" icon="⇄" label={testing ? t('mode.http.checking') : t('settings.test')}
              onPress={async () => { const target = url.trim(); updateSettings({ baseUrl: target }); setTesting(true); setTested(undefined); try { setTested(await testConnection(target)); } finally { setTesting(false); } }} />
            {tested?.kind === 'ok' ? <Text accessibilityRole="alert" style={[type.body, { color: color.leaf }]}>✓ {t('settings.test.ok', { version: tested.health.contract_version, mode: tested.health.data_mode })}</Text> : null}
            {tested?.kind === 'unreachable' ? <Text accessibilityRole="alert" style={[type.body, { color: color.clay }]}>✕ {t('settings.test.fail', { message: tested.message })}</Text> : null}
          </View>
        ) : null}
      </Card>

      <Card>
        <H2>{t('settings.storage')}</H2>
        <Body>{t('history.count', { n: state.records.length })}</Body>
        {confirming ? (
          <Card tone="alert">
            <Text accessibilityRole="alert" style={type.body}>{t('settings.reset.confirm')}</Text>
            <Row wrap>
              <Button kind="danger" label={t('settings.reset.yes')} onPress={async () => { await reset(); setConfirming(false); }} />
              <Button kind="secondary" label={t('settings.reset.no')} onPress={() => setConfirming(false)} />
            </Row>
          </Card>
        ) : <Button kind="secondary" icon="↺" label={t('settings.reset')} onPress={() => setConfirming(true)} />}
      </Card>

      <Card tone="info">
        <H2>{t('settings.limits')}</H2>
        {(['inference', 'sync', 'map', 'notify', 'voice'] as const).map(k => <Body key={k}>• {t(`settings.limit.${k}`)}</Body>)}
      </Card>
    </View>
  );
}
