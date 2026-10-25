// User settings, per-song timing offsets and small localStorage helpers.

const SETTINGS_KEY = "synced-lyrics:settings";
const OFFSETS_KEY = "synced-lyrics:offsets";
export const MXM_TOKEN_KEY = "synced-lyrics:mxm-token";

export const PROVIDER_LABELS = {
  lrclib: "LRCLIB",
  lyricsplus: "Lyrics+",
  musixmatch: "Musixmatch",
  netease: "NetEase",
  genius: "Genius",
};

// Genius isn't in `order`: it's only asked as a final fallback when no other provider has lyrics.
const DEFAULT_SETTINGS = {
  order: ["lrclib", "lyricsplus", "musixmatch", "netease"],
  enabled: { lrclib: true, lyricsplus: true, musixmatch: true, netease: true, genius: true },
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
  // Keep the order list in sync with the ordered providers; newly added ones go in at their default position.
  const order = (saved.order || []).filter((p) => DEFAULT_SETTINGS.order.includes(p));
  DEFAULT_SETTINGS.order.forEach((p, i) => {
    if (!order.includes(p)) order.splice(Math.min(i, order.length), 0, p);
  });
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
