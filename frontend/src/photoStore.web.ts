// Web: photos are already small data URLs stored with the record (see CheckScreen).
export async function persistPhoto(uri: string): Promise<string> { return uri; }
export async function deletePhoto(): Promise<void> {}
