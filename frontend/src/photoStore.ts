// Native: copy picked photos into the app's document directory so they survive cache clearing.
// Photos stay on the device; nothing here uploads anything.
import { Directory, File, Paths } from 'expo-file-system';

export async function persistPhoto(uri: string, id: string): Promise<string> {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = (uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  const dest = new File(dir, `${id}.${ext}`);
  if (dest.exists) dest.delete();
  new File(uri).copy(dest);
  return dest.uri;
}

export async function deletePhoto(uri: string): Promise<void> {
  try { const f = new File(uri); if (f.uri.includes('/photos/') && f.exists) f.delete(); } catch { /* best effort */ }
}
