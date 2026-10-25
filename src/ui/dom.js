// The lyrics page's DOM, shared by the UI modules. Mounted into Spotify's main view by overlay.js.

export const overlay = document.createElement("div");
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
      <button data-act="karaoke" title="Word-by-word highlighting" hidden>Karaoke</button>
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

export const $ = (sel) => overlay.querySelector(sel);
export const scroller = $(".sl-scroller");
export const linesEl = $(".sl-lines");
export const settingsEl = $(".sl-settings");
