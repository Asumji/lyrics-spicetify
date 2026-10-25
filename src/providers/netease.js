// NetEase Cloud Music, via its unofficial web API. Good coverage of Asian music.
import { cleanTitle, cosmosGet, pickBest } from "../util.js";
import { parseLRC, stripCredits } from "../lrc.js";

export async function netease(track) {
  const params = new URLSearchParams({ s: `${cleanTitle(track.title)} ${track.artist}`, type: "1", limit: "15", offset: "0" });
  const search = await cosmosGet(`https://music.163.com/api/search/pc?${params}`);
  const songs = search?.result?.songs;
  if (!songs?.length) return null;

  const best = pickBest(songs, track, {
    title: (s) => s.name,
    artist: (s) => (s.artists || s.ar || []).map((a) => a.name).join(" "),
    duration: (s) => s.duration || s.dt,
  });
  if (!best) return null;

  const url = `https://music.163.com/#/song?id=${best.id}`;
  const lyric = await cosmosGet(`https://music.163.com/api/song/lyric?id=${best.id}&lv=1&kv=1&tv=-1`);
  if (lyric?.nolyric || lyric?.pureMusic) return { synced: null, plain: null, instrumental: true, url };
  const synced = stripCredits(parseLRC(lyric?.lrc?.lyric));
  return synced?.length ? { synced, plain: null, url } : null;
}
