import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, StyleSheet } from 'react-native';
import { mockApi, demoObservation, Analysis } from './src/api';
export default function App() {
  const [result, setResult] = useState<Analysis>();
  useEffect(() => { mockApi.analyze(demoObservation).then(setResult); }, []);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Field companion</Text>
    <Text accessibilityRole="alert">DEMO DATA · Offline mock · No model inference</Text>
    <Text style={styles.heading}>{result?.condition.label ?? 'Loading demo…'}</Text>
    <Text>{result?.condition.uncertainty}</Text>
    <Text style={styles.heading}>Inspect next</Text>
    {result?.scouting.map(item => <Text key={item.id}>{item.text}</Text>)}
    <Text style={styles.heading}>Environment and map</Text>
    <Text>Unavailable in bootstrap. Cached synthetic example is stale; no upload has occurred.</Text>
    {result?.recommendations.map(item => <Text key={item.id}>{item.text}</Text>)}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f4f2e9' }, content: { padding: 24, gap: 16, maxWidth: 720 }, title: { fontSize: 32, fontWeight: '700', color: '#183c2c' }, heading: { fontSize: 22, fontWeight: '600', color: '#183c2c' } });
