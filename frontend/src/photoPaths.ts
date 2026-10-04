// Pure ownership check (testable without native modules): a photo is app-owned only if it
// lives directly inside the app's own documents/photos directory. Never touch other files.
export function isAppOwnedPhoto(uri: string, photosDirUri: string): boolean {
  if (!uri || !photosDirUri) return false;
  const dir = photosDirUri.endsWith('/') ? photosDirUri : `${photosDirUri}/`;
  if (!uri.startsWith(dir)) return false;
  const rest = uri.slice(dir.length);
  return rest.length > 0 && !rest.includes('/') && !rest.includes('..');
}
