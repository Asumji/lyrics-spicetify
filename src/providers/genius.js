// Genius (https://genius.com): unsynced lyrics only. Used as the final fallback when no other
// provider has any lyrics for the song.
import { cleanTitle, cosmosGet, cosmosGetText, normalize, pickBest } from "../util.js";

// Extracts the lyrics text from a Genius song page.
function parseGeniusPage(page) {
  const doc = new DOMParser().parseFromString(page, "text/html");
  const parts = [];
  for (const container of doc.querySelectorAll('[data-lyrics-container="true"]')) {
    // Headers like "12 Contributors" / "Song Lyrics" sit inside the container but aren't lyrics.
    for (const el of container.querySelectorAll('[data-exclude-from-selection="true"]')) el.remove();
    for (const br of container.querySelectorAll("br")) br.replaceWith("\n");
    parts.push(container.textContent);
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function genius(track) {
  const params = new URLSearchParams({ per_page: "10", q: `${track.artist} ${cleanTitle(track.title)}` });
  const search = await cosmosGet(`https://genius.com/api/search/song?${params}`);
  const songs = (search?.response?.sections?.[0]?.hits || []).map((h) => h.result).filter(Boolean);

  // Genius returns loosely related songs when it has no match, so the artist must match too.
  const artist = normalize(track.artist);
  const sameArtist = songs.filter((s) => {
    const a = normalize(s.artist_names || s.primary_artist?.name);
    return a && artist && (a.includes(artist) || artist.includes(a));
  });
  const best = pickBest(sameArtist, track, { title: (s) => s.title, artist: (s) => s.artist_names, duration: () => 0 });
  if (!best?.url) return null;

  const plain = parseGeniusPage(await cosmosGetText(best.url));
  return plain ? { synced: null, plain, url: best.url } : null;
}
