// Lyrics providers (JS ports of the main syncedlyrics providers).
// Each takes a track and returns { synced: [{ time, text, words? }] | null, plain: string | null, instrumental?, url? } or null.
import { lrclib } from "./lrclib.js";
import { musixmatch } from "./musixmatch.js";
import { netease } from "./netease.js";

export const providers = { lrclib, musixmatch, netease };
