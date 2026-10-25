// Musixmatch, via the desktop app's unofficial API (the same approach syncedlyrics uses).
import { cosmosGet, pickBest } from "../util.js";
import { parseLRC } from "../lrc.js";
import { MXM_TOKEN_KEY, readJSON, writeJSON } from "../settings.js";

export async function musixmatch(track) {
  const headers = { authority: "apic-desktop.musixmatch.com", cookie: "x-mxm-token-guid=" };
  const base = "https://apic-desktop.musixmatch.com/ws/1.1/";

  const getToken = async (force) => {
    const cached = readJSON(MXM_TOKEN_KEY, null);
    if (!force && cached && cached.expires > Date.now() && !/^0+$/.test(cached.token)) return cached.token;
    const j = await cosmosGet(`${base}token.get?app_id=web-desktop-app-v1.0`, headers);
    const token = j?.message?.body?.user_token;
    // When rate-limited, Musixmatch hands out a placeholder token that returns decoy lyrics.
    if (!token || token.startsWith("UpgradeOnly") || /^0+$/.test(token)) {
      localStorage.removeItem(MXM_TOKEN_KEY);
      throw new Error("Musixmatch token unavailable");
    }
    writeJSON(MXM_TOKEN_KEY, { token, expires: Date.now() + 10 * 60 * 1000 });
    return token;
  };

  const query = async (token) => {
    const params = new URLSearchParams({
      format: "json",
      namespace: "lyrics_richsynched",
      subtitle_format: "mxm",
      app_id: "web-desktop-app-v1.0",
      q_album: track.album,
      q_artist: track.artist,
      q_artists: track.artist,
      q_track: track.title,
      track_spotify_id: track.uri,
      q_duration: String(track.duration / 1000),
      f_subtitle_length: String(Math.floor(track.duration / 1000)),
      usertoken: token,
      // Also ask for word-level timings ("richsync") when the song has them.
      optional_calls: "track.richsync",
      richsync_compact_type: "words",
    });
    return cosmosGet(`${base}macro.subtitles.get?${params}`, headers);
  };

  let j = await query(await getToken(false));
  if (j?.message?.header?.status_code === 401) j = await query(await getToken(true));

  const calls = j?.message?.body?.macro_calls;
  if (!calls) return null;

  const matched = calls["matcher.track.get"]?.message?.body?.track;
  // Musixmatch sometimes matches a completely unrelated song; make sure it's the one playing.
  const isMatch = pickBest([matched || {}], track, {
    title: (m) => m.track_name,
    artist: (m) => m.artist_name,
    duration: (m) => (m.track_length || 0) * 1000,
  });
  if (!matched || !isMatch) return null;
  const url = matched.track_share_url?.split("?")[0] || null;
  if (matched?.instrumental) return { synced: null, plain: null, instrumental: true, url };

  let synced = matched.has_richsync ? parseRichsync(calls["track.richsync.get"]?.message?.body?.richsync?.richsync_body) : null;
  const subtitle = !synced &&calls["track.subtitles.get"]?.message?.body?.subtitle_list?.[0]?.subtitle?.subtitle_body;
  if (subtitle) {
    try {
      synced = JSON.parse(subtitle).map((l) => ({ time: Math.round(l.time.total * 1000), text: (l.text || "").trim() }));
    } catch {
      synced = parseLRC(subtitle);
    }
  }
  const plain = calls["track.lyrics.get"]?.message?.body?.lyrics?.lyrics_body || null;
  return synced || plain ? { synced: synced?.length ? synced : null, plain, url } : null;
}

// Converts a richsync body into [{ time, end, text, words: [{ text, start, end }] }].
// Each line is { ts, te, x, l: [{ c: text, o: offset from ts }] } with times in seconds.
function parseRichsync(body) {
  if (!body) return null;
  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  const lines = raw
    .filter((l) => typeof l?.ts === "number" && Array.isArray(l.l))
    .map((l) => {
      const time = Math.round(l.ts * 1000);
      const end = typeof l.te === "number" ? Math.round(l.te * 1000) : null;
      const words = l.l
        .filter((w) => w && typeof w.c === "string" && typeof w.o === "number")
        .map((w, i, all) => {
          const start = time + Math.round(w.o * 1000);
          const next = all[i + 1];
          return { text: w.c, start, end: next ? time + Math.round(next.o * 1000) : end };
        });
      return {
        time,
        end,
        text: (typeof l.x === "string" ? l.x : words.map((w) => w.text).join("")).trim(),
        words: words.length ? words : undefined,
      };
    })
    .sort((a, b) => a.time - b.time);

  return lines.some((l) => l.words) ? lines : null;
}
