// Stylesheet for the lyrics page.

const CSS = `
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
#sl-overlay button[hidden] { display: none; }
#sl-overlay button.sl-on { background: var(--sl-fg); color: #000; }
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
#sl-overlay .sl-word {
  white-space: pre-wrap;
  color: transparent;
  background-image: linear-gradient(90deg, var(--sl-fg) var(--p, 0%), var(--sl-dim) var(--p, 0%));
  -webkit-background-clip: text;
  background-clip: text;
}
#sl-overlay .sl-line.past .sl-word { background-image: none; color: var(--sl-past); }
#sl-overlay .sl-message { font-size: 24px; font-weight: 700; color: var(--sl-past); }
#sl-overlay .sl-note { font-size: 13px; color: var(--sl-past); margin-bottom: 24px; }
`;

export function injectStyles() {
  if (document.getElementById("synced-lyrics-style")) return;
  const style = document.createElement("style");
  style.id = "synced-lyrics-style";
  style.textContent = CSS;
  document.head.appendChild(style);
}
