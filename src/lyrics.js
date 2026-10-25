// Lyrics state for the current track: loading from cache/providers and refetching.
// The UI subscribes with onLyricsChange() and reads `state` / `refetching`.
import { lyricsCache } from "./cache.js";
import { providers } from "./providers/registry.js";
import { settings } from "./settings.js";
import { withTimeout } from "./util.js";

let requestId = 0;
export let refetching = false;

// status: "idle" | "loading" | "synced" | "plain" | "instrumental" | "notfound" | "unsupported"
export let state = { track: null, status: "idle", source: null, url: null, lines: null, plain: null };

const listeners = new Set();

// Registers fn(kind) to be called when "state" or "refetching" changes.
export function onLyricsChange(fn) {
  listeners.add(fn);
}

function emit(kind) {
  for (const fn of listeners) fn(kind);
}

function setRefetching(value) {
  if (refetching === value) return;
  refetching = value;
  emit("refetching");
}

function setState(next) {
  state = next;
  emit("state");
}

function getCurrentTrack() {
  const { Player } = Spicetify;
  const item = Player.data?.item || Player.data?.track;
  if (!item?.uri) return null;
  const meta = item.metadata || {};
  return {
    uri: item.uri,
    title: meta.title || item.name || "",
    artist: meta.artist_name || item.artists?.[0]?.name || "",
    album: meta.album_title || item.album?.name || "",
    duration: Number(meta.duration) || item.duration?.milliseconds || Player.getDuration() || 0,
    image: meta.image_xlarge_url || meta.image_large_url || meta.image_url || "",
  };
}

const isSupported = (track) =>
  !!track.title && (track.uri.startsWith("spotify:track:") || track.uri.startsWith("spotify:local:"));

// Searches the enabled providers in order. Returns null if a newer request superseded this one.
async function searchProviders(track, id) {
  let plainFallback = null;
  let instrumentalFrom = null;
  let instrumentalUrl = null;

  for (const name of settings.order) {
    if (!settings.enabled[name]) continue;
    try {
      const r = await withTimeout(providers[name](track), 10000);
      if (id !== requestId) return null; // a newer song started meanwhile
      if (r?.synced?.length) return { status: "synced", source: name, url: r.url || null, lines: r.synced, plain: r.plain };
      if (r?.plain && !plainFallback) plainFallback = { status: "plain", source: name, url: r.url || null, lines: null, plain: r.plain };
      if (r?.instrumental && !instrumentalFrom) {
        instrumentalFrom = name;
        instrumentalUrl = r.url || null;
      }
    } catch (err) {
      if (id !== requestId) return null;
      console.warn(`[synced-lyrics] ${name} failed:`, err);
    }
  }

  if (plainFallback) return plainFallback;
  if (instrumentalFrom) return { status: "instrumental", source: instrumentalFrom, url: instrumentalUrl, lines: null, plain: null };
  return { status: "notfound", source: null, url: null, lines: null, plain: null };
}

async function loadLyrics(track) {
  const id = ++requestId;
  setRefetching(false);

  if (!isSupported(track)) {
    setState({ track, status: "unsupported", source: null, url: null, lines: null, plain: null });
    return;
  }
  setState({ track, status: "loading", source: null, url: null, lines: null, plain: null });

  let result = await lyricsCache.get(track.uri);
  if (id !== requestId) return;
  if (!result) {
    result = await searchProviders(track, id);
    if (!result) return;
    if (result.status === "synced") lyricsCache.set(track.uri, result);
  }
  setState({ track, ...result });
}

// Fetches from the internet again; only a synced result replaces what's cached.
export async function refetchLyrics() {
  const track = state.track;
  if (!track || !isSupported(track) || refetching) return;

  const id = ++requestId;
  setRefetching(true);
  const cached = await lyricsCache.get(track.uri);
  const result = id === requestId ? await searchProviders(track, id) : null;
  if (id !== requestId || !result) return; // song changed meanwhile
  setRefetching(false);

  if (result.status === "synced") {
    lyricsCache.set(track.uri, result);
    setState({ track, ...result });
    return;
  }

  Spicetify.showNotification?.(
    cached
      ? "Synced Lyrics: couldn't find new synced lyrics. Keeping the saved ones."
      : "Synced Lyrics: couldn't find synced lyrics for this song.",
    true
  );
  if (cached) {
    // Restore the cached lyrics in case the view was showing something else.
    if (state.status !== "synced") setState({ track, ...cached });
  } else {
    setState({ track, ...result });
  }
}

// Loads lyrics for the playing track unless they're already loaded or loading.
export function onSongChange() {
  const track = getCurrentTrack();
  if (!track) return;
  if (state.track?.uri === track.uri && state.status !== "idle") return;
  loadLyrics(track);
}
