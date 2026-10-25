// LRCLIB (https://lrclib.net): free, open lyrics database. Also provides word timings via Lyricsfile.
import { cleanTitle, fetchWithRetry, pickBest } from "../util.js";
import { parseLRC } from "../lrc.js";
import { parseLyricsfile } from "../lyricsfile.js";

export async function lrclib(track) {
  const toResult = (j) => ({
    // Prefer the Lyricsfile when it has word timings (used by the karaoke view).
    synced: (j.hasWordSync && parseLyricsfile(j.lyricsfile)) || parseLRC(j.syncedLyrics),
    plain: j.plainLyrics || null,
    instrumental: !!j.instrumental,
    url: j.id ? `https://lrclib.net/tracks/${j.id}` : null,
  });

  const exact = new URLSearchParams({
    track_name: track.title,
    artist_name: track.artist,
    album_name: track.album,
    duration: String(Math.round(track.duration / 1000)),
  });
  const res = await fetchWithRetry(`https://lrclib.net/api/get?${exact}`);
  if (res.ok) {
    const j = await res.json();
    if (j.syncedLyrics || j.plainLyrics || j.instrumental) return toResult(j);
  }

  const queries = [
    new URLSearchParams({ track_name: cleanTitle(track.title), artist_name: track.artist }),
    new URLSearchParams({ q: `${cleanTitle(track.title)} ${track.artist}` }),
  ];
  for (const q of queries) {
    const r = await fetchWithRetry(`https://lrclib.net/api/search?${q}`);
    if (!r.ok) continue;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) continue;
    const synced = list.filter((x) => x.syncedLyrics);
    const opts = { title: (x) => x.trackName, artist: (x) => x.artistName, duration: (x) => x.duration * 1000 };
    const best = pickBest(synced, track, opts) || pickBest(list, track, opts);
    if (best) return toResult(best);
  }
  return null;
}
