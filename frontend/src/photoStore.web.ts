// Web: photos are small data URLs stored inside the saved record (see CheckScreen); nothing to copy or delete.
export async function persistPhoto(uri: string): Promise<string> { return uri; }
export const PHOTO_STORAGE_KIND = 'web' as const;
export async function deletePhoto(): Promise<void> {}
