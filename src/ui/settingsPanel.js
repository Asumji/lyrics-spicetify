// The Settings panel: turn providers on/off and change the order they're searched in.
import { PROVIDER_LABELS, saveSettings, settings } from "../settings.js";
import { settingsEl } from "./dom.js";

// A settings row with an on/off checkbox for the provider.
function providerRow(name, labelText) {
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
  label.textContent = labelText;
  row.append(cb, label);
  return row;
}

export function renderSettings() {
  settingsEl.textContent = "";
  const h = document.createElement("h4");
  h.textContent = "Providers (searched top to bottom)";
  settingsEl.appendChild(h);

  settings.order.forEach((name, i) => {
    const row = providerRow(name, PROVIDER_LABELS[name]);
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
    row.append(up, down);
    settingsEl.appendChild(row);
  });

  const fallback = document.createElement("h4");
  fallback.textContent = "Fallback (only when no provider above has lyrics)";
  settingsEl.append(fallback, providerRow("genius", `${PROVIDER_LABELS.genius} (unsynced lyrics)`));
}
