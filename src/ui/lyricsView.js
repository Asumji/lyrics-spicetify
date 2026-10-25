// Renders the lyrics and keeps the highlighted line/words in sync with playback.
import { karaoke, mainHasWordSync, state } from "../lyrics.js";
import { getOffset, PROVIDER_LABELS, settings } from "../settings.js";
import { $, linesEl, overlay, scroller } from "./dom.js";

// What's on screen: { kind, source, url, lines }. kind is "main", "karaoke",
// "karaoke-loading" or "karaoke-notfound". Synced lines being shown are in shown.lines.
let shown = { kind: "main", source: null, url: null, lines: null };
let lineEls = [];
let lineWords = []; // karaoke view: per line, [{ el, start, end }]
let activeIndex = -2;
let userScrollUntil = 0;
let rafId = 0;
let backgroundUri = null;

// Let the user scroll freely; resume auto-scroll a few seconds later.
for (const evt of ["wheel", "touchmove", "mousedown"]) {
  scroller.addEventListener(evt, () => (userScrollUntil = Date.now() + 3000), { passive: true });
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

// Decides what the page shows for the current state and view mode.
function pickShown() {
  const { track, status } = state;
  const main = { kind: "main", source: state.source, url: state.url, lines: state.lines };
  if (!settings.karaoke || !track || ["idle", "loading", "unsupported"].includes(status)) return main;
  if (mainHasWordSync()) return { ...main, kind: "karaoke" };
  if (karaoke.uri !== track.uri || karaoke.status === "loading" || karaoke.status === "idle") {
    return { kind: "karaoke-loading", source: null, url: null, lines: null };
  }
  if (karaoke.status === "found") return { kind: "karaoke", source: karaoke.source, url: karaoke.url, lines: karaoke.lines };
  return { kind: "karaoke-notfound", source: null, url: null, lines: null };
}

// The source link currently shown in the header, if any.
export const shownUrl = () => shown.url;

function renderSyncedLines(lines, track, wordByWord) {
  linesEl.textContent = "";
  lineEls = lines.map((line, idx) => {
    const el = document.createElement("div");
    el.className = "sl-line";
    if (wordByWord) {
      // Lines without word timings are filled as a single "word" spanning the line.
      const lineEnd = line.end ?? lines[idx + 1]?.time ?? line.time + 5000;
      const words = line.words || [{ text: line.text || "♪", start: line.time, end: lineEnd }];
      lineWords[idx] = words.map((w, k) => {
        const span = document.createElement("span");
        span.className = "sl-word";
        span.textContent = w.text;
        el.appendChild(span);
        const end = w.end ?? words[k + 1]?.start ?? lineEnd;
        return { el: span, start: w.start, end: Math.max(end, w.start + 1) };
      });
    } else {
      el.textContent = line.text || "♪";
    }
    el.addEventListener("click", () => {
      const target = Math.round(line.time - getOffset(track.uri));
      Spicetify.Player.seek(target > 1 ? target : 0);
      userScrollUntil = 0;
    });
    linesEl.appendChild(el);
    return el;
  });
}

export function render() {
  const { track, status, lines, plain } = state;
  shown = pickShown();
  if (track && status !== "loading" && track.uri !== backgroundUri) updateBackground(track);
  $(".sl-track").textContent = track?.title || "Nothing playing";
  $(".sl-artist").textContent = track?.artist || "";
  $(".sl-cover").src = track?.image || "";
  const sourceEl = $(".sl-source");
  sourceEl.textContent = shown.source ? `via ${PROVIDER_LABELS[shown.source]}` : "";
  sourceEl.classList.toggle("sl-link", !!shown.url);
  sourceEl.title = shown.url ? `Open on ${PROVIDER_LABELS[shown.source]}` : "";
  $(".sl-offset").textContent = `${(getOffset(track?.uri) / 1000).toFixed(1)}s`;
  $('button[data-act="karaoke"]').classList.toggle("sl-on", !!settings.karaoke);

  lineWords = [];
  activeIndex = -2;
  scroller.scrollTop = 0;

  if (shown.kind === "karaoke") {
    renderSyncedLines(shown.lines, track, true);
  } else if (shown.kind === "karaoke-loading") {
    messageLine("Searching for word-synced lyrics…");
  } else if (shown.kind === "karaoke-notfound") {
    messageLine("No lyrics found for this song.", "None of the enabled services has word-synced lyrics for it.");
  } else {
    renderMain(track, status, lines, plain);
  }

  if (!overlay.hidden) tick();
}

function renderMain(track, status, lines, plain) {
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
      note.className = "sl-note sl-disclaimer";
      note.textContent =
        state.source === "genius"
          ? "Not synced: no synced lyrics were found for this song, so these lyrics from Genius won't highlight or scroll along with the music."
          : "Not synced: only unsynced lyrics were found for this song, so they won't highlight or scroll along with the music.";
      linesEl.appendChild(note);
      for (const text of plain.split(/\r?\n/)) {
        const el = document.createElement("div");
        el.className = "sl-line plain";
        el.textContent = text || " ";
        linesEl.appendChild(el);
      }
      break;
    }
    case "synced":
      renderSyncedLines(lines, track, false);
      break;
    default:
      messageLine("Play a song to see its lyrics.");
  }
}

async function updateBackground(track) {
  backgroundUri = track.uri;
  if (!Spicetify.colorExtractor || !track.uri.startsWith("spotify:track:")) return;
  try {
    const colors = await Spicetify.colorExtractor(track.uri);
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
  if (!shown.lines || !lineEls.length) return;
  const position = Spicetify.Player.getProgress() + getOffset(state.track.uri);
  const idx = findActiveIndex(shown.lines, position);

  if (idx !== activeIndex) {
    // Clear the fill on the previously active line so it doesn't stay half-filled after a seek.
    for (const w of lineWords[activeIndex] || []) w.el.style.removeProperty("--p");

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

  // Karaoke view: fill each word of the active line as it is sung.
  for (const w of lineWords[idx] || []) {
    const p = Math.min(1, Math.max(0, (position - w.start) / (w.end - w.start)));
    w.el.style.setProperty("--p", `${(p * 100).toFixed(1)}%`);
  }
}

function loop() {
  tick();
  rafId = requestAnimationFrame(loop);
}

// Starts following playback (when the page opens).
export function startSync() {
  activeIndex = -2;
  userScrollUntil = 0;
  cancelAnimationFrame(rafId);
  loop();
}

// Stops following playback (when the page closes).
export function stopSync() {
  cancelAnimationFrame(rafId);
}

// Forces the active line to be recomputed and scrolled to, e.g. after the timing offset changes.
export function resync() {
  activeIndex = -2;
}
