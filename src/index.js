// Bootstrap: waits for Spicetify to be ready, then starts the UI and follows song changes.
import { onSongChange } from "./lyrics.js";
import { initUI } from "./ui/overlay.js";

function isSpicetifyReady() {
  const S = window.Spicetify;
  return !!(S?.Player?.addEventListener && S.Player.data && S.Playbar?.Button && S.CosmosAsync && S.Platform?.History);
}

function start() {
  if (!isSpicetifyReady()) {
    setTimeout(start, 300);
    return;
  }
  initUI();
  Spicetify.Player.addEventListener("songchange", onSongChange);
  onSongChange();
}

start();
