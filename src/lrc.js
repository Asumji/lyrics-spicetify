// LRC (line-synced lyrics) parsing.

// Parses LRC text into [{ time (ms), text }] sorted by time.
export function parseLRC(lrc) {
  if (!lrc) return null;
  const lines = [];
  let globalOffset = 0;
  const stampRe = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

  for (const rawLine of lrc.split(/\r?\n/)) {
    const offsetMatch = rawLine.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
    if (offsetMatch) {
      globalOffset = parseInt(offsetMatch[1], 10);
      continue;
    }
    const stamps = [...rawLine.matchAll(stampRe)];
    if (!stamps.length) continue;
    // Strip timestamps and enhanced word-level tags like <00:12.34>.
    const text = rawLine
      .replace(stampRe, "")
      .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "")
      .trim();
    for (const m of stamps) {
      const seconds = parseFloat(m[2].replace(":", "."));
      lines.push({ time: Math.max(0, parseInt(m[1], 10) * 60000 + seconds * 1000 - globalOffset), text });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines.length ? lines : null;
}

// Credits lines that some providers (mainly NetEase) put at the top of the lyrics.
const CREDIT_RE = /^\s*(作词|作曲|编曲|制作人|混音|母带|和声|吉他|贝斯|鼓|监制|录音|lyricist|lyrics by|composer|composed by|producer|produced by|arranger|written by)\s*[:：]/i;
export const stripCredits = (lines) => lines && lines.filter((l) => !CREDIT_RE.test(l.text));
