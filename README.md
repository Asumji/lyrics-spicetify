# Synced Lyrics for Spicetify

A [Spicetify](https://spicetify.app) extension that shows live, time-synced lyrics for songs Spotify has no lyrics for. It adds a microphone button to the playbar. Click it to open a lyrics page that highlights the current line and scrolls along with the song.

Lyrics come from public lyrics databases (LRCLIB, Musixmatch and NetEase), so many songs missing from Spotify's own lyrics are covered.

## Features

- **Microphone button** in the playbar opens and closes the lyrics page.
- **Live sync**: the current line is highlighted and scrolled to the centre; past lines stay readable and upcoming lines are dimmed.
- **Click any line** to jump to that point in the song.
- **Free scrolling**: scroll manually to look around; auto-scroll resumes after 3 seconds.
- **Timing offset** (−0.5s / +0.5s) for songs whose lyrics are slightly early or late, saved per song.
- **Multiple sources**, tried in an order you choose. Each source can be turned on or off.
- **Source link**: click "via LRCLIB / Musixmatch / NetEase" to open the song's page on that site.
- **Permanent cache** of synced lyrics, so a song is only looked up once.
- **Karaoke view**: word-by-word highlighting for songs that have word timings on LRCLIB or Musixmatch.
- **Album-colour background**, plus a fallback to unsynced lyrics when no synced version exists.

## Requirements

- Spotify desktop app (Windows, macOS or Linux)
- [Spicetify](https://spicetify.app/docs/getting-started) installed and applied (developed with Spicetify 2.46.3)

## Installation

1. Download the ready-built [`dist/syncedLyrics.js`](dist/syncedLyrics.js) from this repository (or [build it yourself](#development)).
2. Copy it into your Spicetify `Extensions` folder:

   | OS | Folder |
   | --- | --- |
   | Windows | `%APPDATA%\spicetify\Extensions` |
   | macOS / Linux | `~/.config/spicetify/Extensions` |

   If you're not sure where it is, run `spicetify config-dir` to open the Spicetify folder.

3. Enable the extension and apply. This restarts Spotify.

```sh
spicetify config extensions syncedLyrics.js
spicetify apply
```

### Updating

Replace `syncedLyrics.js` in the `Extensions` folder with the new version and run `spicetify apply` again. From a clone of this repo, `npm run deploy` does the build and copy for you.

### Uninstalling

```sh
spicetify config extensions syncedLyrics.js-
spicetify apply
```

Then delete `syncedLyrics.js` from the `Extensions` folder.

## Usage

1. Play a song and click the **microphone** icon in the playbar.
2. The lyrics page opens over the main view. Close it with the microphone again, **Esc**, the **✕** button, or by navigating anywhere else in Spotify.

Header controls:

| Control | What it does |
| --- | --- |
| **via _Source_** | Opens the song's page on the site the lyrics came from. |
| **Karaoke** | Switches to word-by-word highlighting. Only shown when the song has word timings (see [Karaoke view](#karaoke-view)). Your choice is remembered. |
| **−0.5s / +0.5s** | Shifts the lyrics later or earlier for this song. The offset is remembered. |
| **Refetch** | Searches all sources online again (see [Caching](#caching)). |
| **Settings** | Turn sources on or off and change the order they're tried in (↑ / ↓). |

## Lyrics sources

Sources are tried top to bottom; the first one with **synced** lyrics wins. If none has synced lyrics, unsynced lyrics are shown with a note.

| Source | Notes | "via" link opens |
| --- | --- | --- |
| [LRCLIB](https://lrclib.net) | Free, open, community-run lyrics database. Best first choice. | `lrclib.net/tracks/<id>` |
| [Musixmatch](https://www.musixmatch.com) | Large catalogue, accessed through the desktop app's unofficial API. May be rate-limited (see Troubleshooting). | The song's Musixmatch lyrics page |
| [NetEase Cloud Music](https://music.163.com) | Good coverage of Asian music. Unofficial API. | `music.163.com/#/song?id=<id>` |

Every match is checked against the playing song's title, artist and length, so lyrics for an unrelated song are thrown out.

## Karaoke view

When the lyrics for a song include word-level timings, a **Karaoke** button appears in the header. Turn it on to see each word fill in as it's sung, instead of whole lines lighting up.

| Source | Word timings |
| --- | --- |
| LRCLIB | Yes, from its [Lyricsfile](https://github.com/tranxuanthang/lyricsfile) format (marked "Word Synced" on lrclib.net). Few songs have them so far. |
| Musixmatch | Yes, from its "richsync" lyrics, on songs Musixmatch has word-synced. Only works while Musixmatch isn't rate-limiting (see [Troubleshooting](#troubleshooting)). |
| NetEase | No. Its word-level lyrics require a logged-in NetEase account. |

- The button won't appear for most songs.
- Lines without word timings are filled across the whole line.
- Lyrics cached before karaoke support was added don't include word timings. Press **Refetch** to get them.

## Caching

- **Synced lyrics are cached permanently** (in Spotify's built-in IndexedDB storage), so they survive restarts and are never looked up online again.
- **Unsynced lyrics, instrumentals and "not found" results are never cached**, so those songs are searched again each time they play.
- **Refetch** always searches online:
  - If it finds synced lyrics, they **replace** the cached ones.
  - If it finds only unsynced lyrics or nothing, an error is shown and the **cached lyrics are kept**.

## Troubleshooting

**The microphone button doesn't appear.**
Check that `syncedLyrics.js` is listed under `extensions` in `config-xpui.ini` (`spicetify config extensions`), then run `spicetify apply`. If Spotify recently updated, run `spicetify backup apply` to re-patch it.

**"Couldn't find the main view."**
Spotify renamed its layout classes. The extension tries `.Root__main-view`, `.main-view-container`, `#main-view` and `main`. If none of these exists in your Spotify version, please open an issue with your Spotify and Spicetify versions.

**"No lyrics found for this song."**
None of the enabled sources has the song. Make sure all sources are enabled in Settings, then try **Refetch**. You can also add the lyrics to [LRCLIB](https://lrclib.net) yourself; it's an open database anyone can contribute to.

**Musixmatch never returns anything.**
Musixmatch rate-limits this kind of access. When it does, it returns a placeholder token and decoy lyrics, which the extension detects and ignores. Wait a while, or turn Musixmatch off in Settings.

**Lyrics are slightly out of sync.**
Use the **−0.5s / +0.5s** buttons. The offset is saved for that song.

## Stored data

Everything stays inside the Spotify app on your computer:

| Where | Key | Contents |
| --- | --- | --- |
| `localStorage` | `synced-lyrics:settings` | Source order, on/off state and karaoke preference |
| `localStorage` | `synced-lyrics:offsets` | Per-song timing offsets |
| `localStorage` | `synced-lyrics:mxm-token` | Temporary Musixmatch access token |
| IndexedDB | `synced-lyrics` → `lyrics` | Cached synced lyrics (including word timings), keyed by Spotify URI |

The extension sends song title, artist, album and length only to the enabled lyrics sources.

## Development

The source lives in `src/` as small ES modules. Spicetify loads every extension as a single script and can't load files from a subfolder of `Extensions`, so `build.mjs` bundles `src/` into one file, `dist/syncedLyrics.js`. It has no dependencies; you only need [Node.js](https://nodejs.org) 18 or newer.

```sh
npm run build    # build dist/syncedLyrics.js
npm run deploy   # build, then copy it into Spicetify's Extensions folder
spicetify apply  # reload Spotify with the new build
```

`npm run deploy` finds the Extensions folder automatically (`%APPDATA%\spicetify\Extensions` on Windows, `~/.config/spicetify/Extensions` elsewhere). Set `SPICETIFY_CONFIG` to use a different Spicetify folder.

### Project layout

```
src/
  index.js              bootstrap: waits for Spicetify, starts the UI, follows song changes
  lyrics.js             lyrics state for the current track: cache, provider search, refetch
  cache.js              permanent IndexedDB cache for synced lyrics
  settings.js           settings, per-song timing offsets, localStorage helpers
  util.js               text/network helpers and track matching
  lrc.js                LRC parser
  lyricsfile.js         Lyricsfile (YAML) parser for word timings
  providers/
    registry.js         provider registry
    lrclib.js           LRCLIB
    musixmatch.js       Musixmatch
    netease.js          NetEase Cloud Music
  ui/
    overlay.js          playbar button, open/close, header controls
    lyricsView.js       renders lyrics, line and karaoke sync, auto-scroll
    settingsPanel.js    Settings panel
    dom.js              the lyrics page's DOM
    styles.js           CSS
build.mjs               bundler
dist/syncedLyrics.js    built extension (committed so users can download it)
```

### Bundler rules

The bundler concatenates the modules into one shared scope, so it supports a deliberately small subset of module syntax:

- Imports must be named and relative: `import { a, b } from "./file.js";` (no `as` renames).
- Exports must be declarations: `export function`, `export async function`, `export const`, `export let` or `export class`.
- Every top-level name must be unique across all of `src/`, and imports can't be circular.

The build fails with a clear message if any rule is broken. Run `npm run build` and commit `dist/syncedLyrics.js` along with your changes to `src/`.

## Disclaimer

This project is not affiliated with Spotify, Spicetify, Musixmatch, NetEase or LRCLIB. Musixmatch and NetEase are accessed through unofficial APIs that can change or stop working at any time. Lyrics belong to their respective rights holders.

## Credits

- Source handling is inspired by [syncedlyrics](https://github.com/moehmeni/syncedlyrics) by moehmeni.
- Lyrics data from [LRCLIB](https://lrclib.net), [Musixmatch](https://www.musixmatch.com) and [NetEase Cloud Music](https://music.163.com).
