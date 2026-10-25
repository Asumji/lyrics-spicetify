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
| **Karaoke** | Switches between the normal view and word-by-word highlighting (see [Karaoke view](#karaoke-view)). Your choice is remembered. |
| **−0.5s / +0.5s** | Shifts the lyrics later or earlier for this song. The offset is remembered. |
| **Refetch** | Searches all sources online again (see [Caching](#caching)). |
| **Settings** | Turn sources on or off and change the order they're tried in (↑ / ↓). |

## Lyrics sources

Sources are tried top to bottom; the first one with **synced** lyrics wins. If none has synced lyrics, unsynced lyrics are shown with a note.

| Source | Notes | "via" link opens |
| --- | --- | --- |
| [LRCLIB](https://lrclib.net) | Free, open, community-run lyrics database. Best first choice. | `lrclib.net/tracks/<id>` |
| [Musixmatch](https://www.musixmatch.com) | Large catalogue, accessed through the iOS app's unofficial API (like Spicetify's Lyrics Plus). May be rate-limited (see Troubleshooting). | The song's Musixmatch lyrics page |
| [NetEase Cloud Music](https://music.163.com) | Good coverage of Asian music. Unofficial API. | `music.163.com/#/song?id=<id>` |

Every match is checked against the playing song's title, artist and length, so lyrics for an unrelated song are thrown out.

## Karaoke view

Click **Karaoke** in the header to see each word fill in as it's sung, instead of whole lines lighting up.

- If the song's lyrics already have word timings, they're shown straight away.
- If not, the other enabled services are asked for word-synced lyrics for the song, and the first one found is shown (its "via" link points to that service).
- If no service has word-synced lyrics, the karaoke view shows "No lyrics found for this song". Switch Karaoke off to go back to the normal synced lyrics.

| Source | Word timings |
| --- | --- |
| LRCLIB | Yes, from its [Lyricsfile](https://github.com/tranxuanthang/lyricsfile) format (marked "Word Synced" on lrclib.net). Few songs have them so far. |
| Musixmatch | Yes, from its "richsync" lyrics, which many popular songs have. |
| NetEase | No. Its word-level lyrics require a logged-in NetEase account. |

- Word-synced lyrics are still rare, so expect "No lyrics found" in the karaoke view for most songs.
- Lines without word timings are filled across the whole line.
- Word-synced lyrics found for the karaoke view are cached permanently, like other synced lyrics. Not finding any is never cached, so the services are asked again next time.
- **Refetch** in the karaoke view also searches for word-synced lyrics again. If none are found, an error is shown and any cached word-synced lyrics are kept.

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
Musixmatch needs an access token, and it rate-limits requests for new ones. When a token request is refused (or answered with a placeholder token that returns decoy lyrics), the extension skips Musixmatch and tries again 10 minutes later. Once it has a token it keeps using it until Musixmatch rejects it. If it keeps failing, turn Musixmatch off in Settings.

**Lyrics are slightly out of sync.**
Use the **−0.5s / +0.5s** buttons. The offset is saved for that song.

## Stored data

Everything stays inside the Spotify app on your computer:

| Where | Key | Contents |
| --- | --- | --- |
| `localStorage` | `synced-lyrics:settings` | Source order, on/off state and karaoke preference |
| `localStorage` | `synced-lyrics:offsets` | Per-song timing offsets |
| `localStorage` | `synced-lyrics:mxm-token` | Musixmatch access token (or when to retry getting one) |
| IndexedDB | `synced-lyrics` → `lyrics` | Cached synced lyrics (including word timings), keyed by Spotify URI; karaoke-view lyrics from another service under `<uri>#karaoke` |

The extension sends song title, artist, album and length only to the enabled lyrics sources.

## Development

The source lives in `src/` as small ES modules. Spicetify loads every extension as a single script and can't load files from a subfolder of `Extensions`, so `build.mjs` bundles `src/` into one minified file, `dist/syncedLyrics.js`, using [terser](https://terser.org) to strip whitespace and comments and shorten local names. You need [Node.js](https://nodejs.org) 18 or newer.

```sh
npm install      # once: installs terser
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
dist/syncedLyrics.js    built, minified extension (committed so users can download it)
```

### Bundler rules

The bundler concatenates the modules into one shared scope, so it supports a deliberately small subset of module syntax:

- Imports must be named and relative: `import { a, b } from "./file.js";` (no `as` renames).
- Exports must be declarations: `export function`, `export async function`, `export const`, `export let` or `export class`.
- Every top-level name must be unique across all of `src/`, and imports can't be circular.
- CSS and HTML go in `` css`...` `` / `` html`...` `` templates (from `src/util.js`) without `${}` placeholders, so the build can minify them.

The build fails with a clear message if any rule is broken. Run `npm run build` and commit `dist/syncedLyrics.js` along with your changes to `src/`.

## Disclaimer

This project is not affiliated with Spotify, Spicetify, Musixmatch, NetEase or LRCLIB. Musixmatch and NetEase are accessed through unofficial APIs that can change or stop working at any time. Lyrics belong to their respective rights holders.

## Credits

- Source handling is inspired by [syncedlyrics](https://github.com/moehmeni/syncedlyrics) by moehmeni.
- Lyrics data from [LRCLIB](https://lrclib.net), [Musixmatch](https://www.musixmatch.com) and [NetEase Cloud Music](https://music.163.com).
