// User settings, per-song timing offsets and small localStorage helpers.

const SETTINGS_KEY = "synced-lyrics:settings";
const OFFSETS_KEY = "synced-lyrics:offsets";
export const MXM_TOKEN_KEY = "synced-lyrics:mxm-token";

export const PROVIDER_LABELS = {
  lrclib: "LRCLIB",
  musixmatch: "Musixmatch",
  netease: "NetEase",
};

const DEFAULT_SETTINGS = {
  order: ["lrclib", "musixmatch", "netease"],
  enabled: { lrclib: true, musixmatch: true, netease: true },
  karaoke: false,
};

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const settings = (() => {
  const saved = readJSON(SETTINGS_KEY, {});
  const merged = {
    ...DEFAULT_SETTINGS,
    ...saved,
    enabled: { ...DEFAULT_SETTINGS.enabled, ...(saved.enabled || {}) },
  };
  // Keep the order list in sync with known providers.
  const order = (saved.order || []).filter((p) => p in PROVIDER_LABELS);
  for (const p of DEFAULT_SETTINGS.order) if (!order.includes(p)) order.push(p);
  merged.order = order;
  return merged;
})();

export const saveSettings = () => writeJSON(SETTINGS_KEY, settings);

const offsets = readJSON(OFFSETS_KEY, {});
export const getOffset = (uri) => offsets[uri] || 0;
export function setOffset(uri, ms) {
  if (ms) offsets[uri] = ms;
  else delete offsets[uri];
  writeJSON(OFFSETS_KEY, offsets);
}
