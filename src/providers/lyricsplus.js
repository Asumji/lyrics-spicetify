// Lyrics+ (https://github.com/ibratabian17/lyricsplus): open-source lyrics API used by YouLy+.
// It searches Apple Music, QQ Music, Musixmatch, Deezer and its own community lyrics, and often
// has word-level ("syllable") timings, mostly from Apple Music.

const LYRICSPLUS_API = "https://lyricsplus.prjktla.my.id/v2/lyrics/get";

export async function lyricsplus(track) {
  const params = new URLSearchParams({
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: String(track.duration / 1000),
  });
  const res = await fetch(`${LYRICSPLUS_API}?${params}`);
  if (!res.ok) return null; // 404 when no source has the song
  const j = await res.json();
  if (!Array.isArray(j?.lyrics) || !j.lyrics.length) return null;

  // "Line" and "Word"/"Syllable" responses are synced; anything else is plain text.
  if (j.type !== "Line" && j.type !== "Word" && j.type !== "Syllable") {
    const plain = j.lyrics.map((l) => l.text || "").join("\n").trim();
    return plain ? { synced: null, plain } : null;
  }

  const synced = j.lyrics
    .filter((l) => typeof l?.time === "number")
    .map((l) => {
      const words = (Array.isArray(l.syllabus) ? l.syllabus : [])
        .filter((s) => typeof s?.time === "number" && typeof s.text === "string")
        .map((s, i, all) => ({
          // Background vocals like "(Yes)" come without a trailing space before the main vocals.
          text: s.isBackground && all[i + 1] && !/\s$/.test(s.text) ? `${s.text} ` : s.text,
          start: s.time,
          end: typeof s.duration === "number" ? s.time + s.duration : null,
        }));
      return {
        time: l.time,
        end: typeof l.duration === "number" ? l.time + l.duration : null,
        text: (words.length ? words.map((w) => w.text).join("") : l.text || "").trim(),
        words: j.type !== "Line" && words.length ? words : undefined,
      };
    })
    .sort((a, b) => a.time - b.time);

  return synced.length ? { synced, plain: null } : null;
}
