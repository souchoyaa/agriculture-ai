// Native: copy picked photos into the app's document directory so they survive cache clearing.
// The picked original is never modified. Photos stay on the device; nothing here uploads.
import { Directory, File, Paths } from 'expo-file-system';
import { isAppOwnedPhoto } from './photoPaths';

const photosDir = () => new Directory(Paths.document, 'photos');

/** Returns the app-owned copy's URI. Throws if the copy fails (caller keeps the original URI and says so). */
export async function persistPhoto(uri: string, id: string): Promise<string> {
  const dir = photosDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = (uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const dest = new File(dir, `${id}.${ext}`);
  if (dest.exists) dest.delete();
  new File(uri).copy(dest);
  if (!dest.exists) throw new Error('copy did not produce a file');
  return dest.uri;
}

export const PHOTO_STORAGE_KIND = 'app' as const;

/** Deletes only files inside the app's own documents/photos directory. */
export async function deletePhoto(uri: string): Promise<void> {
  try {
    if (!isAppOwnedPhoto(uri, photosDir().uri)) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch { /* best effort */ }
}
