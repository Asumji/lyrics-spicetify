// Wires up the lyrics page: playbar button, opening/closing, header controls and keyboard/navigation handling.
import { ensureKaraoke, onLyricsChange, onSongChange, refetchLyrics, refetching, state } from "../lyrics.js";
import { getOffset, saveSettings, setOffset, settings } from "../settings.js";
import { $, overlay, settingsEl } from "./dom.js";
import { render, resync, shownUrl, startSync, stopSync } from "./lyricsView.js";
import { renderSettings } from "./settingsPanel.js";
import { injectStyles } from "./styles.js";

const MIC_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 8 1Zm-1 2.5a1 1 0 1 1 2 0v4a1 1 0 1 1-2 0v-4Z"/><path d="M3.5 7a.75.75 0 0 1 .75.75 3.75 3.75 0 0 0 7.5 0 .75.75 0 0 1 1.5 0 5.25 5.25 0 0 1-4.5 5.2V14.5h2a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5h2v-1.55a5.25 5.25 0 0 1-4.5-5.2A.75.75 0 0 1 3.5 7Z"/></svg>`;

// The main view's class names differ between Spotify versions.
const MAIN_VIEW_SELECTORS = [".Root__main-view", ".main-view-container", "#main-view", "main"];

let button = null;

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

function show() {
  if (!mountOverlay()) {
    Spicetify.showNotification?.("Synced Lyrics: couldn't find the main view.", true);
    return;
  }
  overlay.hidden = false;
  button.active = true;
  onSongChange();
  startSync();
}

function hide() {
  overlay.hidden = true;
  button.active = false;
  settingsEl.hidden = true;
  stopSync();
}

function updateRefetchButton() {
  const btn = $('button[data-act="refetch"]');
  btn.disabled = refetching;
  btn.textContent = refetching ? "Refetching…" : "Refetch";
}

function onOverlayClick(e) {
  if (e.target.closest(".sl-source") && shownUrl()) {
    window.open(shownUrl(), "_blank");
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
    case "karaoke":
      settings.karaoke = !settings.karaoke;
      saveSettings();
      render();
      ensureKaraoke();
      break;
    case "offset-minus":
    case "offset-plus":
      if (!uri) break;
      // A positive offset shows lyrics earlier.
      setOffset(uri, getOffset(uri) + (act === "offset-plus" ? 500 : -500));
      $(".sl-offset").textContent = `${(getOffset(uri) / 1000).toFixed(1)}s`;
      resync();
      break;
  }
}

export function initUI() {
  injectStyles();

  button = new Spicetify.Playbar.Button("Synced Lyrics", MIC_ICON, () => (overlay.hidden ? show() : hide()));

  onLyricsChange((kind) => (kind === "refetching" ? updateRefetchButton() : render()));
  overlay.addEventListener("click", onOverlayClick);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) hide();
  });

  // Navigating anywhere else in Spotify closes the lyrics page.
  Spicetify.Platform.History.listen(() => {
    if (!overlay.hidden) hide();
  });
}
