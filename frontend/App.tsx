import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { isSupported, LOCALES } from './src/i18n';
import type { Nav, Route, TabName } from './src/navigation';
import { CheckScreen } from './src/screens/CheckScreen';
import { FieldsScreen } from './src/screens/FieldsScreen';
import { FieldScreen, HistoryScreen } from './src/screens/HistoryScreens';
import { RESULT_TWO_COLUMN_MIN, ResultScreen } from './src/screens/ResultScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StoreProvider, useStore } from './src/state/store';
import { color, space, type } from './src/ui/theme';
import type { PS } from './src/ui/components';

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}

const TABS: { name: TabName; glyph: string; label: 'tab.fields' | 'tab.check' | 'tab.history' | 'tab.settings' }[] = [
  { name: 'fields', glyph: '▦', label: 'tab.fields' },
  { name: 'check', glyph: '＋', label: 'tab.check' },
  { name: 'history', glyph: '☰', label: 'tab.history' },
  { name: 'settings', glyph: '⚙', label: 'tab.settings' },
];
const tabOf = (r: Route): TabName => r.name === 'field' || r.name === 'result' ? 'fields' : r.name;

function Shell() {
  const { ready, t, storageError, recovered } = useStore();
  const [stack, setStack] = useState<Route[]>([{ name: 'fields' }]);
  const scroll = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const route = stack[stack.length - 1];

  const nav: Nav = useMemo(() => ({
    push: r => setStack(s => [...s, r]),
    replace: r => setStack(s => [...s.slice(0, -1), r]),
    back: () => setStack(s => s.length > 1 ? s.slice(0, -1) : s),
    canGoBack: stack.length > 1,
  }), [stack.length]);

  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [route]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (stack.length > 1) { nav.back(); return true; } return false; });
    return () => sub.remove();
  }, [nav, stack.length]);

  const goTab = useCallback((name: TabName) => setStack([{ name } as Route]), []);

  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.paper }}><ActivityIndicator color={color.leaf} size="large" /><Text style={type.body}>{t('common.loading')}</Text></View>;

  const screen = (() => {
    switch (route.name) {
      case 'fields': return <FieldsScreen nav={nav} />;
      case 'field': return <FieldScreen nav={nav} fieldId={route.fieldId} />;
      case 'check': return <CheckScreen key={JSON.stringify(stack)} nav={nav} fieldId={route.fieldId} />;
      case 'result': return <ResultScreen nav={nav} recordId={route.recordId} />;
      case 'history': return <HistoryScreen nav={nav} />;
      case 'settings': return <SettingsScreen />;
    }
  })();

  const tabs = <TabBar active={tabOf(route)} onSelect={goTab} vertical={wide} />;
  return (
    <View style={{ flex: 1, backgroundColor: color.paper, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      <StatusBar barStyle="dark-content" />
      <ModeBar onPress={() => goTab('settings')} />
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        {wide ? tabs : null}
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space(wide ? 8 : 4), paddingBottom: space(10), width: '100%', maxWidth: route.name === 'result' && width >= RESULT_TWO_COLUMN_MIN ? 1180 : 760, alignSelf: 'center', gap: space(3) }}>
          <LanguageNotice />
          {storageError ? <Text accessibilityRole="alert" style={[type.body, { color: color.clay }]}>⚠ Storage error: {storageError}</Text> : null}
          {recovered ? <Text accessibilityRole="alert" style={[type.small, { color: color.clay }]}>⚠ Saved data could not be read; example data restored (backup kept).</Text> : null}
          {nav.canGoBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('field.back')} onPress={nav.back} style={{ alignSelf: 'flex-start', minHeight: 48, minWidth: 48, justifyContent: 'center', paddingRight: space(3) }}>
              <Text style={[type.heading, { color: color.leafDark }]}>← {t('field.back')}</Text>
            </Pressable>
          ) : null}
          {screen}
        </ScrollView>
      </View>
      {wide ? null : tabs}
    </View>
  );
}

function ModeBar({ onPress }: { onPress: () => void }) {
  const { t, api, connection, state } = useStore();
  let text: string; let detail: string; let bg = color.turmeric; let fg = color.ink;
  if (api.kind === 'mock') { text = t('mode.mock'); detail = t('mode.mock.detail'); }
  else if (connection.kind === 'unreachable') { text = t('mode.http.unreachable'); detail = connection.message; bg = color.clay; fg = '#fff'; }
  else if (connection.kind === 'unverified') { text = t('mode.http', { url: state.settings.baseUrl }); detail = t('mode.http.unverified'); bg = color.skySoft; }
  else if (connection.kind === 'checking') { text = t('mode.http', { url: state.settings.baseUrl }); detail = t('mode.http.checking'); bg = color.skySoft; }
  else {
    text = t('mode.http', { url: state.settings.baseUrl });
    // Health describes service capability only; result provenance is labelled per analysis.
    const caps = connection.kind === 'ok' ? connection.health.capabilities : undefined;
    const limited = !caps || /^none/i.test(String(caps.image_inference ?? '')) || /^none/i.test(String(caps.calibration ?? ''));
    detail = limited ? t('mode.http.limits') : t('mode.http.live');
    bg = color.skySoft;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${text}. ${detail}`} style={({ focused }: PS) => [focused && { outlineStyle: 'solid', outlineWidth: 3, outlineColor: color.focus, outlineOffset: -3 } as object, { backgroundColor: bg, paddingHorizontal: space(4), paddingVertical: space(2), borderBottomWidth: 2, borderBottomColor: '#0002', minHeight: 48, justifyContent: 'center' }]}>
      <Text style={[type.label, { color: fg, fontSize: 13 }]}>{text}</Text>
      <Text style={[type.small, { color: fg, fontSize: 13, lineHeight: 17 }]} numberOfLines={2}>{detail}</Text>
    </Pressable>
  );
}

function LanguageNotice() {
  const { t, state } = useStore();
  if (isSupported(state.settings.locale)) return null;
  const name = LOCALES.find(l => l.code === state.settings.locale)?.name ?? state.settings.locale;
  return <View accessibilityRole="alert" style={{ backgroundColor: color.skySoft, borderRadius: 8, padding: space(3), borderWidth: 1.5, borderColor: color.sky }}><Text style={type.body}>ⓘ {t('lang.fallback', { language: name })}</Text></View>;
}

function TabBar({ active, onSelect, vertical }: { active: TabName; onSelect: (t: TabName) => void; vertical: boolean }) {
  const { t } = useStore();
  return (
    <View accessibilityRole="tablist" style={vertical
      ? { width: 200, paddingTop: space(6), paddingHorizontal: space(3), gap: space(2), borderRightWidth: 1.5, borderRightColor: color.border, backgroundColor: '#EFE8D6' }
      : { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: color.border, backgroundColor: color.card, paddingBottom: Platform.OS === 'ios' ? space(5) : 0 }}>
      {vertical ? <Text style={[type.title, { marginBottom: space(4), paddingHorizontal: space(2) }]}>{t('app.name')}</Text> : null}
      {TABS.map(tab => {
        const on = tab.name === active;
        return (
          <Pressable key={tab.name} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t(tab.label)} onPress={() => onSelect(tab.name)}
            style={({ focused }: PS) => [vertical
              ? { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 52, paddingHorizontal: space(3), borderRadius: 12, backgroundColor: on ? color.leaf : 'transparent' }
              : { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 64, paddingVertical: space(2), borderTopWidth: 4, borderTopColor: on ? color.leaf : 'transparent' },
              focused && { outlineStyle: 'solid', outlineWidth: 3, outlineColor: color.focus } as object]}>
            <Text aria-hidden style={{ fontSize: 22, color: vertical && on ? '#fff' : on ? color.leafDark : color.stone }}>{tab.glyph}</Text>
            <Text numberOfLines={vertical ? 1 : 2} style={{ textAlign: 'center', fontSize: vertical ? 16 : 13, fontWeight: on ? '800' : '600', color: vertical && on ? '#fff' : on ? color.leafDark : color.inkSoft }}>{t(tab.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
