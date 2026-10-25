// Shared helpers: text normalisation, network helpers and track matching.

// Template tags marking CSS/HTML text. They return the text unchanged; build.mjs replaces
// tagged templates with minified string literals.
export const css = (strings) => strings.raw.join("");
export const html = (strings) => strings.raw.join("");

export const normalize = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");

export function cleanTitle(title) {
  return (title || "")
    .replace(/\s*[\(\[](feat\.?|ft\.?|with|from)\s[^\)\]]*[\)\]]/gi, "")
    .replace(/\s+-\s+.*\b(remaster(ed)?|version|edit|live|mix|mono|stereo|remix|radio|acoustic)\b.*$/i, "")
    .trim();
}

export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// LRCLIB occasionally answers 503/429 when overloaded; retry once before giving up.
export async function fetchWithRetry(url) {
  const res = await fetch(url);
  if (res.status !== 503 && res.status !== 429) return res;
  await new Promise((r) => setTimeout(r, 1500));
  return fetch(url);
}

export async function cosmosGet(url, headers) {
  const res = await Spicetify.CosmosAsync.get(url, null, headers);
  return typeof res === "string" ? JSON.parse(res) : res;
}

// Fetches a non-JSON page (e.g. HTML) through Spotify, which isn't subject to CORS.
export function cosmosGetText(url) {
  if (typeof window.sendCosmosRequest !== "function") return fetch(url).then((r) => r.text());
  return new Promise((resolve, reject) => {
    window.sendCosmosRequest({
      request: JSON.stringify({ method: "GET", uri: url }),
      persistent: false,
      onSuccess: (response) => {
        try {
          resolve(JSON.parse(response)?.body ?? "");
        } catch (err) {
          reject(err);
        }
      },
      onFailure: reject,
    });
  });
}

// Picks the candidate that best matches the current track.
export function pickBest(candidates, track, { title, artist, duration }) {
  const wantTitle = normalize(cleanTitle(track.title));
  const wantArtist = normalize(track.artist);
  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    let score = 0;
    const t = normalize(cleanTitle(title(c)));
    const a = normalize(artist(c));
    if (t === wantTitle) score += 4;
    else if (t.includes(wantTitle) || wantTitle.includes(t)) score += 2;
    else score -= 3;
    if (a && wantArtist && (a.includes(wantArtist) || wantArtist.includes(a))) score += 3;
    const d = duration(c);
    if (d && track.duration) {
      const diff = Math.abs(d - track.duration) / 1000;
      if (diff <= 2) score += 3;
      else if (diff <= 5) score += 1;
      else if (diff > 15) score -= 4;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 2 ? best : null;
}
