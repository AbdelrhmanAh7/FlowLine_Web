import type { CopyOverrides } from "./translate";

/** Public pages keep the built-in catalogue when the published-copy store is unavailable. */
export async function publishedCopyOrBase(read: () => Promise<CopyOverrides>, onFailure: () => void): Promise<CopyOverrides> {
  try {
    return await read();
  } catch {
    onFailure();
    return { ar: {}, en: {} };
  }
}
