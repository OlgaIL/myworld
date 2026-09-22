export const COPY_GUIDE_STORAGE_KEY = "word2you-copy-guide-used-v14";
export const COPY_GUIDE_USED_EVENT = "word2you:copy-guide-used";

function resolveStorage(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function hasUsedCopyButton(storage) {
  try {
    return resolveStorage(storage)?.getItem(COPY_GUIDE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function rememberCopyButtonUse(storage) {
  try {
    resolveStorage(storage)?.setItem(COPY_GUIDE_STORAGE_KEY, "true");
  } catch {
    // Copying should keep working when browser storage is unavailable.
  }

  globalThis.window?.dispatchEvent(new Event(COPY_GUIDE_USED_EVENT));
}
