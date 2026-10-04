import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { ageText, formatDate, isMachineTranslated, isSupported, LOCALES } from './src/i18n';
import { freshness } from './src/sync/sync';
import type { Nav, Route, TabName } from './src/navigation';
import { CheckScreen } from './src/screens/CheckScreen';
import { FieldsScreen } from './src/screens/FieldsScreen';
import { FieldScreen, HistoryScreen } from './src/screens/HistoryScreens';
import { RESULT_TWO_COLUMN_MIN, ResultScreen } from './src/screens/ResultScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StoreProvider, useStore } from './src/state/store';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
// Only the 5 weights used, imported per file (the package index would export every weight and italic).
const FONTS = {
  Manrope_700Bold: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
  Manrope_800ExtraBold: require('@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf'),
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
};
import { color, font, gradient, radius, shadow, space, type } from './src/ui/theme';
import { Icon, type PS } from './src/ui/components';

export default function App() {
  // Fonts ship inside the bundle (no network). Render anyway if loading fails.
  const [fontsLoaded, fontsError] = useFonts(FONTS);
  if (!(fontsLoaded || fontsError)) return <View style={{ flex: 1, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.leaf} size="large" /></View>;
  return <StoreProvider><Shell /></StoreProvider>;
}

const TABS: { name: TabName; icon: string; iconOn: string; label: 'tab.fields' | 'tab.check' | 'tab.history' | 'tab.settings' }[] = [
  { name: 'fields', icon: 'sprout-outline', iconOn: 'sprout', label: 'tab.fields' },
  { name: 'check', icon: 'plus-circle-outline', iconOn: 'plus-circle', label: 'tab.check' },
  { name: 'history', icon: 'clipboard-text-clock-outline', iconOn: 'clipboard-text-clock', label: 'tab.history' },
  { name: 'settings', icon: 'cog-outline', iconOn: 'cog', label: 'tab.settings' },
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
      <Header onMode={() => goTab('settings')} showBrand={!wide} />
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        {wide ? tabs : null}
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space(wide ? 8 : 4), paddingTop: space(wide ? 8 : 2), paddingBottom: space(8), width: '100%', maxWidth: route.name === 'result' && width >= RESULT_TWO_COLUMN_MIN ? 1180 : 760, alignSelf: 'center', gap: space(3) }}>
          <LanguageNotice />
          {storageError ? <Text accessibilityRole="alert" style={[type.body, { color: color.clay }]}>Storage error: {storageError}</Text> : null}
          {recovered ? <Text accessibilityRole="alert" style={[type.small, { color: color.clay }]}>Saved data could not be read; example data restored (backup kept).</Text> : null}
          {nav.canGoBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('field.back')} onPress={nav.back} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space(1), minHeight: 44, paddingRight: space(4), paddingLeft: space(2), borderRadius: radius.pill, backgroundColor: color.card }}>
              <Icon name="chevron-left" size={22} color={color.leafDark} />
              <Text style={[type.heading, { color: color.leafDark }]}>{t('field.back')}</Text>
            </Pressable>
          ) : null}
          {screen}
        </ScrollView>
      </View>
      {wide ? null : tabs}
    </View>
  );
}

function ModeChip({ onPress }: { onPress: () => void }) {
  const { t, api, connection, state, sync, syncing } = useStore();
  let chip: string; let detail: string; let icon = 'flask-outline'; let bg = color.turmericSoft; let fg = color.turmericInk;
  if (api.kind === 'mock') { chip = t('mode.chip.mock'); detail = t('mode.mock.detail'); }
  else if (api.kind === 'local') {
    // On-device: offline is normal; show quiet data freshness instead of a connection state.
    icon = 'cellphone-check'; bg = color.leafTint; fg = color.leafDark; chip = t('mode.chip.local');
    const f = freshness(sync);
    const parts = [syncing ? t('sync.syncing') : f.lastSuccessAt ? t('sync.weatherAge', { age: ageText(t, f.ageHours ?? 0) }) : t('sync.never')];
    if (f.forecastUntil) parts.push(t('sync.forecastUntil', { date: formatDate(f.forecastUntil, state.settings.locale) }));
    detail = parts.join(' · ');
  }
  else {
    icon = 'server-network'; bg = color.skySoft; fg = color.sky;
    chip = t('mode.chip.http');
    if (connection.kind === 'unreachable') { chip = t('mode.chip.unreachable'); detail = t('mode.http.unreachable'); icon = 'cloud-off-outline'; bg = color.claySoft; fg = color.clay; }
    else if (connection.kind === 'unverified') detail = t('mode.http.unverified');
    else if (connection.kind === 'checking') detail = t('mode.http.checking');
    else {
      // Health describes service capability only; result provenance is labelled per analysis.
      const caps = connection.kind === 'ok' ? connection.health.capabilities : undefined;
      const limited = !caps || /^none/i.test(String(caps.image_inference ?? '')) || /^none/i.test(String(caps.calibration ?? ''));
      detail = limited ? t('mode.http.limits') : t('mode.http.live');
    }
    detail = `${t('mode.http', { url: state.settings.baseUrl })} · ${detail}`;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${chip}. ${detail}`}
      style={({ focused }: PS) => [{ gap: 2, alignItems: 'flex-end', maxWidth: 260, flexShrink: 1 }, focused && { outlineStyle: 'solid', outlineWidth: 3, outlineColor: color.focus, borderRadius: 12 } as object]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, paddingHorizontal: space(3), paddingVertical: 6, borderRadius: radius.pill }}>
        <Icon name={icon} size={16} color={fg} />
        <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: fg }}>{chip}</Text>
      </View>
      <Text numberOfLines={2} style={[type.small, { fontSize: 12, lineHeight: 15, textAlign: 'right', color: color.muted }]}>{detail}</Text>
    </Pressable>
  );
}

function Header({ onMode, showBrand }: { onMode: () => void; showBrand: boolean }) {
  const { t } = useStore();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3), paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(2), backgroundColor: color.paper }}>
      {showBrand ? <Brand label={t('app.name')} /> : <View />}
      <ModeChip onPress={onMode} />
    </View>
  );
}

function Brand({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2.5) }}>
      <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="sprout" size={22} color="#fff" />
      </LinearGradient>
      <Text style={{ fontFamily: font.display, fontSize: 18, color: color.ink, letterSpacing: -0.3 }}>{label}</Text>
    </View>
  );
}

function LanguageNotice() {
  const { t, state } = useStore();
  if (isMachineTranslated(state.settings.locale)) return (
    <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center', backgroundColor: color.skySoft, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(2) }}>
      <Icon name="translate" size={18} color={color.sky} />
      <Text style={[type.small, { flex: 1 }]}>{t('lang.machine')}</Text>
    </View>
  );
  if (isSupported(state.settings.locale)) return null;
  const name = LOCALES.find(l => l.code === state.settings.locale)?.name ?? state.settings.locale;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: space(2), alignItems: 'center', backgroundColor: color.skySoft, borderRadius: radius.md, padding: space(3) }}>
      <Icon name="translate" size={20} color={color.sky} />
      <Text style={[type.body, { flex: 1 }]}>{t('lang.fallback', { language: name })}</Text>
    </View>
  );
}

function TabBar({ active, onSelect, vertical }: { active: TabName; onSelect: (t: TabName) => void; vertical: boolean }) {
  const { t } = useStore();
  return (
    <View accessibilityRole="tablist" style={vertical
      ? { width: 232, paddingTop: space(6), paddingHorizontal: space(4), gap: space(1.5), backgroundColor: color.card, borderRightWidth: 1, borderRightColor: color.line }
      : [{ flexDirection: 'row', marginHorizontal: space(3), marginBottom: Platform.OS === 'ios' ? space(6) : space(3), padding: space(1.5), borderRadius: radius.lg, backgroundColor: color.card }, shadow]}>
      {vertical ? <View style={{ marginBottom: space(6), paddingHorizontal: space(2) }}><Brand label={t('app.name')} /></View> : null}
      {TABS.map(tab => {
        const on = tab.name === active;
        return (
          <Pressable key={tab.name} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t(tab.label)} onPress={() => onSelect(tab.name)}
            style={({ focused }: PS) => [vertical
              ? { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 50, paddingHorizontal: space(3), borderRadius: radius.md, backgroundColor: on ? color.leafTint : 'transparent' }
              : { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58, paddingVertical: space(1.5), borderRadius: radius.md, gap: 2, backgroundColor: on ? color.leafTint : 'transparent' },
              focused && { outlineStyle: 'solid', outlineWidth: 3, outlineColor: color.focus } as object]}>
            <Icon name={on ? tab.iconOn : tab.icon} size={vertical ? 22 : 24} color={on ? color.leaf : color.muted} />
            <Text numberOfLines={1} style={{ textAlign: 'center', fontFamily: on ? font.semibold : font.medium, fontSize: vertical ? 15.5 : 12, color: on ? color.leafDark : color.inkSoft }}>{t(tab.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
