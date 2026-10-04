// Device location, requested only when the user taps "Use my current location".
// Foreground, one-shot, balanced accuracy; the result is rounded before it is returned.
import * as Location from 'expo-location';
import { roundLocation, type FieldLocation } from './domain/location';

export type LocateResult =
  | { kind: 'ok'; location: FieldLocation; accuracyM?: number }
  | { kind: 'denied' }
  | { kind: 'unavailable'; message: string };

export async function locateOnce(timeoutMs = 15000): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { kind: 'denied' };
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return { kind: 'ok', location: roundLocation(pos.coords), accuracyM: pos.coords.accuracy ?? undefined };
  } catch (e) {
    return { kind: 'unavailable', message: String((e as Error)?.message ?? e) };
  }
}
