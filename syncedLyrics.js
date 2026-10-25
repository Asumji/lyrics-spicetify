// NAME: Synced Lyrics
// AUTHOR: Asumji
// DESCRIPTION: Live synced lyrics from LRCLIB, Musixmatch, NetEase.

(function syncedLyrics() {
  const S = window.Spicetify;
  if (!S?.Player?.addEventListener || !S.Player.data || !S.Playbar?.Button || !S.CosmosAsync || !S.Platform?.History) {
    setTimeout(syncedLyrics, 300);
    return;
  }

  const { Player, Playbar, CosmosAsync, Platform } = S;

  // ---------------------------------------------------------------------------
  // Settings / persistence
  // ---------------------------------------------------------------------------

  const SETTINGS_KEY = "synced-lyrics:settings";
  const OFFSETS_KEY = "synced-lyrics:offsets";
  const MXM_TOKEN_KEY = "synced-lyrics:mxm-token";

  const PROVIDER_LABELS = {
    lrclib: "LRCLIB",
    musixmatch: "Musixmatch",
    netease: "NetEase",
  };

  const DEFAULT_SETTINGS = {
    order: ["lrclib", "musixmatch", "netease"],
    enabled: { lrclib: true, musixmatch: true, netease: true },
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  const settings = (() => {
    const saved = readJSON(SETTINGS_KEY, {});
    const merged = {
      ...DEFAULT_SETTINGS,
      ...saved,
      enabled: { ...DEFAULT_SETTINGS.enabled, ...(saved.enabled || {}) },
    };
    // Keep the order list in sync with known providers.
    const order = (saved.order || []).filter((p) => p in PROVIDER_LABELS);
    for (const p of DEFAULT_SETTINGS.order) if (!order.includes(p)) order.push(p);
    merged.order = order;
    return merged;
  })();

  const saveSettings = () => writeJSON(SETTINGS_KEY, settings);

  const offsets = readJSON(OFFSETS_KEY, {});
  const getOffset = (uri) => offsets[uri] || 0;
  function setOffset(uri, ms) {
    if (ms) offsets[uri] = ms;
    else delete offsets[uri];
    writeJSON(OFFSETS_KEY, offsets);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const normalize = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");

  function cleanTitle(title) {
    return (title || "")
      .replace(/\s*[\(\[](feat\.?|ft\.?|with|from)\s[^\)\]]*[\)\]]/gi, "")
      .replace(/\s+-\s+.*\b(remaster(ed)?|version|edit|live|mix|mono|stereo|remix|radio|acoustic)\b.*$/i, "")
      .trim();
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
  }

  // LRCLIB occasionally answers 503/429 when overloaded; retry once before giving up.
  async function fetchWithRetry(url) {
    const res = await fetch(url);
    if (res.status !== 503 && res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, 1500));
    return fetch(url);
  }

  async function cosmosGet(url, headers) {
    const res = await CosmosAsync.get(url, null, headers);
    return typeof res === "string" ? JSON.parse(res) : res;
  }

  // Parses LRC text into [{ time (ms), text }] sorted by time.
  function parseLRC(lrc) {
    if (!lrc) return null;
    const lines = [];
    let globalOffset = 0;
    const stampRe = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

    for (const rawLine of lrc.split(/\r?\n/)) {
      const offsetMatch = rawLine.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
      if (offsetMatch) {
        globalOffset = parseInt(offsetMatch[1], 10);
        continue;
      }
      const stamps = [...rawLine.matchAll(stampRe)];
      if (!stamps.length) continue;
      // Strip timestamps and enhanced word-level tags like <00:12.34>.
      const text = rawLine
        .replace(stampRe, "")
        .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "")
        .trim();
      for (const m of stamps) {
        const seconds = parseFloat(m[2].replace(":", "."));
        lines.push({ time: Math.max(0, parseInt(m[1], 10) * 60000 + seconds * 1000 - globalOffset), text });
      }
    }

    lines.sort((a, b) => a.time - b.time);
    return lines.length ? lines : null;
  }

  // Credits lines that some providers (mainly NetEase) put at the top of the lyrics.
  const CREDIT_RE = /^\s*(作词|作曲|编曲|制作人|混音|母带|和声|吉他|贝斯|鼓|监制|录音|lyricist|lyrics by|composer|composed by|producer|produced by|arranger|written by)\s*[:：]/i;
  const stripCredits = (lines) => lines && lines.filter((l) => !CREDIT_RE.test(l.text));

  // Picks the candidate that best matches the current track.
  function pickBest(candidates, track, { title, artist, duration }) {
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

  // ---------------------------------------------------------------------------
  // Providers (JS ports of the main syncedlyrics providers)
  // Each returns { synced: [{time, text}] | null, plain: string | null, url?: string } or null.
  // ---------------------------------------------------------------------------

  const providers = {
    async lrclib(track) {
      const toResult = (j) => ({
        synced: parseLRC(j.syncedLyrics),
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
    },

    async musixmatch(track) {
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
    },

    async netease(track) {
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
    },
  };

  // ---------------------------------------------------------------------------
  // Track state & fetching
  // ---------------------------------------------------------------------------

  // Synced lyrics are cached permanently in IndexedDB; unsynced results are never cached.
  const lyricsCache = (() => {
    const memory = new Map(); // uri -> entry, mirrors what has been read/written this session
    const dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open("synced-lyrics", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("lyrics");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    const run = async (mode, fn) => {
      const db = await dbPromise;
      if (!db) return undefined;
      return new Promise((resolve) => {
        try {
          const req = fn(db.transaction("lyrics", mode).objectStore("lyrics"));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      });
    };

    return {
      async get(uri) {
        if (memory.has(uri)) return memory.get(uri);
        const entry = await run("readonly", (store) => store.get(uri));
        if (entry) memory.set(uri, entry);
        return entry || null;
      },
      set(uri, result) {
        const entry = { status: "synced", source: result.source, url: result.url, lines: result.lines, plain: null };
        memory.set(uri, entry);
        return run("readwrite", (store) => store.put(entry, uri));
      },
    };
  })();

  let requestId = 0;
  let refetching = false;

  function setRefetching(value) {
    refetching = value;
    const btn = overlay.querySelector('button[data-act="refetch"]');
    btn.disabled = value;
    btn.textContent = value ? "Refetching…" : "Refetch";
  }

  // status: "idle" | "loading" | "synced" | "plain" | "instrumental" | "notfound" | "unsupported"
  let state = { track: null, status: "idle", source: null, url: null, lines: null, plain: null };

  function getCurrentTrack() {
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

  function showResult(track, result) {
    state = { track, ...result };
    render();
    updateBackground(track);
  }

  async function loadLyrics(track) {
    const id = ++requestId;
    setRefetching(false);
    state = { track, status: "loading", source: null, url: null, lines: null, plain: null };
    render();

    if (!isSupported(track)) {
      state.status = "unsupported";
      render();
      return;
    }

    let result = await lyricsCache.get(track.uri);
    if (id !== requestId) return;
    if (!result) {
      result = await searchProviders(track, id);
      if (!result) return;
      if (result.status === "synced") lyricsCache.set(track.uri, result);
    }
    showResult(track, result);
  }

  // Fetches from the internet again; only a synced result replaces what's cached.
  async function refetchLyrics() {
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
      showResult(track, result);
      return;
    }

    S.showNotification?.(
      cached
        ? "Synced Lyrics: couldn't find new synced lyrics. Keeping the saved ones."
        : "Synced Lyrics: couldn't find synced lyrics for this song.",
      true
    );
    if (cached) {
      // Restore the cached lyrics in case the view was showing something else.
      if (state.status !== "synced") showResult(track, cached);
    } else {
      showResult(track, result);
    }
  }

  function onSongChange() {
    const track = getCurrentTrack();
    if (!track) return;
    if (state.track?.uri === track.uri && state.status !== "idle") return;
    loadLyrics(track);
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  const style = document.createElement("style");
  style.id = "synced-lyrics-style";
  style.textContent = `
#sl-overlay {
  --sl-bg: #1d1d1d;
  --sl-fg: #ffffff;
  --sl-dim: rgba(255, 255, 255, 0.38);
  --sl-past: rgba(255, 255, 255, 0.7);
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--sl-bg) 0%, color-mix(in srgb, var(--sl-bg) 55%, #000) 100%);
  color: var(--sl-fg);
  border-radius: inherit;
  overflow: hidden;
  transition: background 0.6s ease;
}
#sl-overlay[hidden] { display: none; }
#sl-overlay .sl-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  flex-shrink: 0;
}
#sl-overlay .sl-cover { width: 48px; height: 48px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
#sl-overlay .sl-cover[src=""] { display: none; }
#sl-overlay .sl-meta { min-width: 0; flex: 1; }
#sl-overlay .sl-track { font-weight: 700; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#sl-overlay .sl-artist { font-size: 13px; color: var(--sl-past); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#sl-overlay .sl-controls { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
#sl-overlay .sl-source { font-size: 12px; color: var(--sl-past); margin-right: 8px; }
#sl-overlay .sl-source.sl-link { cursor: pointer; }
#sl-overlay .sl-source.sl-link:hover { color: var(--sl-fg); text-decoration: underline; }
#sl-overlay button {
  background: rgba(255, 255, 255, 0.1);
  color: var(--sl-fg);
  border: 0;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
#sl-overlay button:hover { background: rgba(255, 255, 255, 0.2); }
#sl-overlay button:disabled { opacity: 0.5; cursor: default; }
#sl-overlay .sl-offset { font-size: 12px; min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; }
#sl-overlay .sl-settings {
  margin: 0 24px 12px;
  padding: 16px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 13px;
  display: grid;
  gap: 8px;
}
#sl-overlay .sl-settings[hidden] { display: none; }
#sl-overlay .sl-settings h4 { margin: 0 0 4px; font-size: 13px; }
#sl-overlay .sl-provider { display: flex; align-items: center; gap: 8px; }
#sl-overlay .sl-provider label { flex: 1; cursor: pointer; }
#sl-overlay .sl-provider button { padding: 2px 8px; }
#sl-overlay .sl-scroller {
  flex: 1;
  overflow-y: auto;
  padding: 0 48px;
  scrollbar-width: none;
  mask-image: linear-gradient(180deg, transparent 0, #000 12%, #000 80%, transparent 100%);
}
#sl-overlay .sl-scroller::-webkit-scrollbar { display: none; }
#sl-overlay .sl-lines { padding: 40vh 0; max-width: 900px; }
#sl-overlay .sl-line {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.35;
  margin: 0 0 18px;
  color: var(--sl-dim);
  transition: color 0.25s ease, transform 0.25s ease;
  transform-origin: left center;
  cursor: pointer;
}
#sl-overlay .sl-line:hover { color: var(--sl-past); }
#sl-overlay .sl-line.past { color: var(--sl-past); }
#sl-overlay .sl-line.active { color: var(--sl-fg); transform: scale(1.03); }
#sl-overlay .sl-line.plain { cursor: default; color: var(--sl-fg); }
#sl-overlay .sl-message { font-size: 24px; font-weight: 700; color: var(--sl-past); }
#sl-overlay .sl-note { font-size: 13px; color: var(--sl-past); margin-bottom: 24px; }
`;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "sl-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="sl-header">
      <img class="sl-cover" src="" alt="">
      <div class="sl-meta">
        <div class="sl-track"></div>
        <div class="sl-artist"></div>
      </div>
      <div class="sl-controls">
        <span class="sl-source"></span>
        <button data-act="offset-minus" title="Show lyrics later">−0.5s</button>
        <span class="sl-offset" title="Timing offset for this song"></span>
        <button data-act="offset-plus" title="Show lyrics earlier">+0.5s</button>
        <button data-act="refetch" title="Search again">Refetch</button>
        <button data-act="settings" title="Settings">Settings</button>
        <button data-act="close" title="Close (Esc)">✕</button>
      </div>
    </div>
    <div class="sl-settings" hidden></div>
    <div class="sl-scroller"><div class="sl-lines"></div></div>
  `;

  const $ = (sel) => overlay.querySelector(sel);
  const scroller = $(".sl-scroller");
  const linesEl = $(".sl-lines");
  const settingsEl = $(".sl-settings");
  let lineEls = [];
  let activeIndex = -2;
  let userScrollUntil = 0;
  let rafId = 0;

  // The main view's class names differ between Spotify versions.
  const MAIN_VIEW_SELECTORS = [".Root__main-view", ".main-view-container", "#main-view", "main"];

  function mountOverlay() {
    let host = null;
    for (const sel of MAIN_VIEW_SELECTORS) {
      host = document.querySelector(sel);
      if (host) break;
    }
    if (!host) return false;
    if (overlay.parentElement !== host) host.appendChild(overlay);
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    return true;
  }

  function renderSettings() {
    settingsEl.textContent = "";
    const h = document.createElement("h4");
    h.textContent = "Providers (searched top to bottom)";
    settingsEl.appendChild(h);

    settings.order.forEach((name, i) => {
      const row = document.createElement("div");
      row.className = "sl-provider";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = `sl-p-${name}`;
      cb.checked = !!settings.enabled[name];
      cb.addEventListener("change", () => {
        settings.enabled[name] = cb.checked;
        saveSettings();
      });
      const label = document.createElement("label");
      label.htmlFor = cb.id;
      label.textContent = PROVIDER_LABELS[name];
      const move = (delta) => {
        const j = i + delta;
        if (j < 0 || j >= settings.order.length) return;
        [settings.order[i], settings.order[j]] = [settings.order[j], settings.order[i]];
        saveSettings();
        renderSettings();
      };
      const up = document.createElement("button");
      up.textContent = "↑";
      up.addEventListener("click", () => move(-1));
      const down = document.createElement("button");
      down.textContent = "↓";
      down.addEventListener("click", () => move(1));
      row.append(cb, label, up, down);
      settingsEl.appendChild(row);
    });
  }

  function messageLine(text, note) {
    linesEl.textContent = "";
    lineEls = [];
    if (note) {
      const n = document.createElement("div");
      n.className = "sl-note";
      n.textContent = note;
      linesEl.appendChild(n);
    }
    const m = document.createElement("div");
    m.className = "sl-message";
    m.textContent = text;
    linesEl.appendChild(m);
  }

  function render() {
    const { track, status, source, url, lines, plain } = state;
    $(".sl-track").textContent = track?.title || "Nothing playing";
    $(".sl-artist").textContent = track?.artist || "";
    $(".sl-cover").src = track?.image || "";
    const sourceEl = $(".sl-source");
    sourceEl.textContent = source ? `via ${PROVIDER_LABELS[source]}` : "";
    sourceEl.classList.toggle("sl-link", !!url);
    sourceEl.title = url ? `Open on ${PROVIDER_LABELS[source]}` : "";
    $(".sl-offset").textContent = `${(getOffset(track?.uri) / 1000).toFixed(1)}s`;

    activeIndex = -2;
    scroller.scrollTop = 0;

    switch (status) {
      case "loading":
        messageLine("Searching for lyrics…");
        break;
      case "unsupported":
        messageLine("Lyrics aren't available for this item.");
        break;
      case "instrumental":
        messageLine("♪ Instrumental ♪");
        break;
      case "notfound":
        messageLine("No lyrics found for this song.", "Try enabling more providers in Settings.");
        break;
      case "plain": {
        linesEl.textContent = "";
        lineEls = [];
        const note = document.createElement("div");
        note.className = "sl-note";
        note.textContent = "Only unsynced lyrics were found for this song.";
        linesEl.appendChild(note);
        for (const text of plain.split(/\r?\n/)) {
          const el = document.createElement("div");
          el.className = "sl-line plain";
          el.textContent = text || " ";
          linesEl.appendChild(el);
        }
        break;
      }
      case "synced": {
        linesEl.textContent = "";
        lineEls = lines.map((line) => {
          const el = document.createElement("div");
          el.className = "sl-line";
          el.textContent = line.text || "♪";
          el.addEventListener("click", () => {
            const target = Math.round(line.time - getOffset(track.uri));
            Player.seek(target > 1 ? target : 0);
            userScrollUntil = 0;
          });
          linesEl.appendChild(el);
          return el;
        });
        break;
      }
      default:
        messageLine("Play a song to see its lyrics.");
    }

    if (!overlay.hidden) tick();
  }

  async function updateBackground(track) {
    if (!S.colorExtractor || !track.uri.startsWith("spotify:track:")) return;
    try {
      const colors = await S.colorExtractor(track.uri);
      if (state.track?.uri !== track.uri) return;
      const color = colors?.VIBRANT_NON_ALARMING || colors?.DESATURATED || colors?.DARK_VIBRANT;
      if (color) overlay.style.setProperty("--sl-bg", `color-mix(in srgb, ${color} 70%, #000)`);
    } catch {}
  }

  // Index of the last line whose time <= position, or -1 if before the first line.
  function findActiveIndex(lines, position) {
    let lo = 0;
    let hi = lines.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].time <= position) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  function scrollToLine(el, smooth) {
    const top = el.offsetTop - scroller.clientHeight / 2 + el.clientHeight / 2;
    scroller.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  function tick() {
    if (state.status !== "synced" || !lineEls.length) return;
    const position = Player.getProgress() + getOffset(state.track.uri);
    const idx = findActiveIndex(state.lines, position);
    if (idx === activeIndex) return;

    const jumped = Math.abs(idx - activeIndex) > 1;
    activeIndex = idx;
    lineEls.forEach((el, i) => {
      el.classList.toggle("active", i === idx);
      el.classList.toggle("past", i < idx);
    });

    if (Date.now() >= userScrollUntil) {
      const el = lineEls[Math.max(idx, 0)];
      if (el) scrollToLine(el, !jumped);
    }
  }

  function loop() {
    tick();
    rafId = requestAnimationFrame(loop);
  }

  const button = new Playbar.Button(
    "Synced Lyrics",
    `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 8 1Zm-1 2.5a1 1 0 1 1 2 0v4a1 1 0 1 1-2 0v-4Z"/><path d="M3.5 7a.75.75 0 0 1 .75.75 3.75 3.75 0 0 0 7.5 0 .75.75 0 0 1 1.5 0 5.25 5.25 0 0 1-4.5 5.2V14.5h2a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5h2v-1.55a5.25 5.25 0 0 1-4.5-5.2A.75.75 0 0 1 3.5 7Z"/></svg>`,
    () => (overlay.hidden ? show() : hide())
  );

  function show() {
    if (!mountOverlay()) {
      S.showNotification?.("Synced Lyrics: couldn't find the main view.", true);
      return;
    }
    overlay.hidden = false;
    button.active = true;
    onSongChange();
    activeIndex = -2;
    userScrollUntil = 0;
    cancelAnimationFrame(rafId);
    loop();
  }

  function hide() {
    overlay.hidden = true;
    button.active = false;
    settingsEl.hidden = true;
    cancelAnimationFrame(rafId);
  }

  overlay.addEventListener("click", (e) => {
    if (e.target.closest(".sl-source") && state.url) {
      window.open(state.url, "_blank");
      return;
    }
    const act = e.target.closest("button[data-act]")?.dataset.act;
    if (!act) return;
    const uri = state.track?.uri;
    switch (act) {
      case "close":
        hide();
        break;
      case "settings":
        settingsEl.hidden = !settingsEl.hidden;
        if (!settingsEl.hidden) renderSettings();
        break;
      case "refetch":
        refetchLyrics();
        break;
      case "offset-minus":
      case "offset-plus":
        if (!uri) break;
        // A positive offset shows lyrics earlier.
        setOffset(uri, getOffset(uri) + (act === "offset-plus" ? 500 : -500));
        $(".sl-offset").textContent = `${(getOffset(uri) / 1000).toFixed(1)}s`;
        activeIndex = -2;
        break;
    }
  });

  // Let the user scroll freely; resume auto-scroll a few seconds later.
  for (const evt of ["wheel", "touchmove", "mousedown"]) {
    scroller.addEventListener(evt, () => (userScrollUntil = Date.now() + 3000), { passive: true });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) hide();
  });

  // Navigating anywhere else in Spotify closes the lyrics page.
  Platform.History.listen(() => {
    if (!overlay.hidden) hide();
  });

  Player.addEventListener("songchange", onSongChange);
  onSongChange();
})();
