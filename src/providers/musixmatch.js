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

  let synced = null;
  const subtitle = calls["track.subtitles.get"]?.message?.body?.subtitle_list?.[0]?.subtitle?.subtitle_body;
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
