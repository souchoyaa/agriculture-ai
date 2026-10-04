// Device location, requested only when the user taps "Use my current location".
// Foreground, one-shot; positions keep their reported accuracy (accuracy_m) and basis.
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
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return { kind: 'ok', location: roundLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_m: pos.coords.accuracy ?? undefined, basis: 'device_gps' }), accuracyM: pos.coords.accuracy ?? undefined };
  } catch (e) {
    return { kind: 'unavailable', message: String((e as Error)?.message ?? e) };
  }
}

/** Current position only if permission was ALREADY granted (never prompts). Used automatically at photo time. */
export async function locateIfPermitted(timeoutMs = 8000): Promise<FieldLocation | undefined> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return undefined;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return roundLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_m: pos.coords.accuracy ?? undefined, basis: 'device_gps' });
  } catch { return undefined; }
}
