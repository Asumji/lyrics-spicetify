// Lyrics providers (JS ports of the main syncedlyrics providers, plus Lyrics+).
// Each takes a track and returns { synced: [{ time, text, words? }] | null, plain: string | null, instrumental?, url? } or null.
import { genius } from "./genius.js";
import { lrclib } from "./lrclib.js";
import { lyricsplus } from "./lyricsplus.js";
import { musixmatch } from "./musixmatch.js";
import { netease } from "./netease.js";

// Searched in the user's order (settings.order).
export const providers = { lrclib, lyricsplus, musixmatch, netease };

// Asked only when none of the providers above has any lyrics. Gives unsynced lyrics.
export const fallbackProvider = { name: "genius", fetch: genius };
