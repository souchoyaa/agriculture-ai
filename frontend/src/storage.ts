// Durable local key/value storage. AsyncStorage persists to device storage on native
// and to localStorage on web. Tests inject the in-memory implementation.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const deviceStore: KeyValueStore = AsyncStorage;
