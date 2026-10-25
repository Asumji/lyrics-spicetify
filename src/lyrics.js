// Lyrics state for the current track: loading from cache/providers and refetching.
// The UI subscribes with onLyricsChange() and reads `state` / `karaoke` / `refetching`.
import { lyricsCache } from "./cache.js";
import { hasWordSync } from "./lyricsfile.js";
import { providers } from "./providers/registry.js";
import { settings } from "./settings.js";
import { withTimeout } from "./util.js";

let requestId = 0;
let karaokeRequestId = 0;
export let refetching = false;

// status: "idle" | "loading" | "synced" | "plain" | "instrumental" | "notfound" | "unsupported"
export let state = { track: null, status: "idle", source: null, url: null, lines: null, plain: null };

// Word-synced lyrics for the karaoke view, used when the main lyrics have no word timings.
// status: "idle" | "loading" | "found" | "notfound"
export let karaoke = { uri: null, status: "idle", source: null, url: null, lines: null };

const listeners = new Set();

// Registers fn(kind) to be called when "state", "karaoke" or "refetching" changes.
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

function setKaraoke(next) {
  karaoke = next;
  emit("karaoke");
}

export const mainHasWordSync = () => state.status === "synced" && hasWordSync(state.lines);

const karaokeCacheKey = (uri) => `${uri}#karaoke`;

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

// Asks the enabled providers (except `skip`) for word-synced lyrics. Returns undefined if superseded.
async function searchWordSync(track, skip, id) {
  for (const name of settings.order) {
    if (!settings.enabled[name] || name === skip) continue;
    try {
      const r = await withTimeout(providers[name](track), 10000);
      if (id !== karaokeRequestId) return undefined;
      if (hasWordSync(r?.synced)) return { status: "synced", source: name, url: r.url || null, lines: r.synced };
    } catch (err) {
      if (id !== karaokeRequestId) return undefined;
      console.warn(`[synced-lyrics] ${name} failed:`, err);
    }
  }
  return null;
}

// Makes sure the karaoke view has word-synced lyrics to show: when the main lyrics don't have
// word timings, the other services are asked for them. With force, the cache is bypassed and a
// previously cached result is only replaced when new word-synced lyrics are found.
// Returns false if force found nothing new.
export async function ensureKaraoke({ force = false } = {}) {
  const track = state.track;
  if (!settings.karaoke || !track || !isSupported(track)) return true;
  if (state.status === "idle" || state.status === "loading" || mainHasWordSync()) return true;
  if (!force && karaoke.uri === track.uri) return true;

  const id = ++karaokeRequestId;
  setKaraoke({ uri: track.uri, status: "loading", source: null, url: null, lines: null });

  const cached = await lyricsCache.get(karaokeCacheKey(track.uri));
  if (id !== karaokeRequestId) return true;
  let found = force ? null : cached;
  if (!found) {
    found = await searchWordSync(track, state.source, id);
    if (found === undefined) return true;
    if (found) lyricsCache.set(karaokeCacheKey(track.uri), found);
  }

  const result = found || (force ? cached : null);
  setKaraoke(
    result
      ? { uri: track.uri, status: "found", source: result.source, url: result.url, lines: result.lines }
      : { uri: track.uri, status: "notfound", source: null, url: null, lines: null }
  );
  return !force || !!found;
}

async function loadLyrics(track) {
  const id = ++requestId;
  karaokeRequestId++;
  karaoke = { uri: null, status: "idle", source: null, url: null, lines: null };
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
  ensureKaraoke();
}

// Fetches from the internet again; only a synced result replaces what's cached.
// In the karaoke view, word-synced lyrics from the other services are fetched again as well.
export async function refetchLyrics() {
  const track = state.track;
  if (!track || !isSupported(track) || refetching) return;

  const id = ++requestId;
  setRefetching(true);
  const cached = await lyricsCache.get(track.uri);
  const result = id === requestId ? await searchProviders(track, id) : null;
  if (id !== requestId || !result) return; // song changed meanwhile

  const foundMain = result.status === "synced";
  if (foundMain) {
    lyricsCache.set(track.uri, result);
    setState({ track, ...result });
  } else if (cached) {
    // Restore the cached lyrics in case the view was showing something else.
    if (state.status !== "synced") setState({ track, ...cached });
  } else {
    setState({ track, ...result });
  }

  if (settings.karaoke) {
    const foundKaraoke = mainHasWordSync() || (await ensureKaraoke({ force: true }));
    if (id !== requestId) return;
    setRefetching(false);
    if (!foundKaraoke) {
      Spicetify.showNotification?.(
        karaoke.status === "found"
          ? "Synced Lyrics: couldn't find new word-synced lyrics. Keeping the saved ones."
          : "Synced Lyrics: couldn't find word-synced lyrics for this song.",
        true
      );
    }
    return;
  }

  setRefetching(false);
  if (!foundMain) {
    Spicetify.showNotification?.(
      cached
        ? "Synced Lyrics: couldn't find new synced lyrics. Keeping the saved ones."
        : "Synced Lyrics: couldn't find synced lyrics for this song.",
      true
    );
  }
}

// Loads lyrics for the playing track unless they're already loaded or loading.
export function onSongChange() {
  const track = getCurrentTrack();
  if (!track) return;
  if (state.track?.uri === track.uri && state.status !== "idle") return;
  loadLyrics(track);
}
