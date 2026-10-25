// Lyricsfile parsing: LRCLIB's YAML lyrics format with optional word-level timings.

// Minimal parser for the block-style YAML subset used by Lyricsfile (https://github.com/tranxuanthang/lyricsfile):
// mappings, sequences (indented or not), plain/quoted scalars and literal/folded block scalars.
export function parseYAML(src) {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;

  const indentOf = (l) => l.length - l.trimStart().length;
  const isBlank = (l) => /^\s*(#.*)?$/.test(l);
  const isSeqItem = (t) => t === "-" || t.startsWith("- ");
  const KEY_RE = /^('(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^\s'"#][^:#]*?)\s*:(?=\s|$)/;
  const skipBlank = () => {
    while (i < lines.length && isBlank(lines[i])) i++;
  };

  // Returns the index just past the closing quote of a quoted scalar, or -1 if it isn't closed.
  function quoteEnd(s) {
    const q = s[0];
    for (let j = 1; j < s.length; j++) {
      if (q === "'" && s[j] === "'") {
        if (s[j + 1] === "'") j++;
        else return j + 1;
      } else if (q === '"') {
        if (s[j] === "\\") j++;
        else if (s[j] === '"') return j + 1;
      }
    }
    return -1;
  }

  function unquote(s) {
    if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");
    try {
      return JSON.parse(s.replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1").replace(/\\'/g, "'"));
    } catch {
      return s.slice(1, -1);
    }
  }

  function plainValue(s) {
    s = s.replace(/\s+#.*$/, "").trim();
    if (s === "" || s === "~" || s === "null") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
    if (/^[-+]?\d*\.\d+$/.test(s)) return parseFloat(s);
    if (s === "[]") return [];
    if (s === "{}") return {};
    return s;
  }

  // Inline scalar starting on an already-consumed line; may continue on more-indented lines.
  function inlineScalar(rest, parentIndent) {
    if (rest[0] === "'" || rest[0] === '"') {
      let s = rest;
      while (quoteEnd(s) === -1 && i < lines.length) {
        const next = lines[i++].trim();
        s += next ? (s.endsWith("\n") ? "" : " ") + next : "\n";
      }
      const end = quoteEnd(s);
      return unquote(end === -1 ? s + s[0] : s.slice(0, end));
    }
    let s = rest;
    while (i < lines.length && !isBlank(lines[i]) && indentOf(lines[i]) > parentIndent) {
      const t = lines[i].trim();
      if (isSeqItem(t) || KEY_RE.test(t)) break;
      s += " " + t;
      i++;
    }
    return plainValue(s);
  }

  function blockScalar(header, parentIndent) {
    const folded = header[0] === ">";
    const chomp = header.includes("-") ? "strip" : header.includes("+") ? "keep" : "clip";
    const body = [];
    let blockIndent = -1;
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") {
        body.push("");
        i++;
        continue;
      }
      const ind = indentOf(l);
      if (ind <= parentIndent) break;
      if (blockIndent === -1) blockIndent = ind;
      body.push(l.slice(Math.min(ind, blockIndent)));
      i++;
    }
    let text = folded ? body.join("\n").replace(/([^\n])\n(?=[^\n])/g, "$1 ") : body.join("\n");
    if (chomp !== "keep") text = text.replace(/\n+$/, "");
    if (chomp === "clip" && text) text += "\n";
    return text;
  }

  function value(rest, parentIndent) {
    rest = rest.trim();
    if (rest === "" || rest[0] === "#") {
      skipBlank();
      if (i >= lines.length) return null;
      const ind = indentOf(lines[i]);
      const t = lines[i].trim();
      if (isSeqItem(t) && ind >= parentIndent) return sequence(ind);
      if (ind > parentIndent) return mapping(ind);
      return null;
    }
    if (rest[0] === "|" || rest[0] === ">") return blockScalar(rest, parentIndent);
    return inlineScalar(rest, parentIndent);
  }

  function mapping(indent) {
    const obj = {};
    for (;;) {
      skipBlank();
      if (i >= lines.length) break;
      const ind = indentOf(lines[i]);
      const t = lines[i].trim();
      if (ind !== indent || isSeqItem(t)) break;
      const m = t.match(KEY_RE);
      if (!m) throw new Error(`Unexpected YAML on line ${i + 1}`);
      const key = m[1][0] === "'" || m[1][0] === '"' ? unquote(m[1]) : m[1].trim();
      i++;
      obj[key] = value(t.slice(m[0].length), ind);
    }
    return obj;
  }

  function sequence(indent) {
    const arr = [];
    for (;;) {
      skipBlank();
      if (i >= lines.length) break;
      const ind = indentOf(lines[i]);
      const t = lines[i].trim();
      if (ind !== indent || !isSeqItem(t)) break;
      const rest = t.slice(1).trimStart();
      if (KEY_RE.test(rest)) {
        // "- key: value" starts a mapping whose keys are aligned with "key".
        const offset = ind + (t.length - rest.length);
        lines[i] = " ".repeat(offset) + rest;
        arr.push(mapping(offset));
      } else {
        i++;
        arr.push(value(rest, ind));
      }
    }
    return arr;
  }

  skipBlank();
  return i < lines.length ? mapping(indentOf(lines[i])) : null;
}

// Converts a Lyricsfile into [{ time, end, text, words?: [{ text, start, end }] }].
// Returns null unless at least one line has word timings.
export function parseLyricsfile(src) {
  if (!src) return null;
  let doc;
  try {
    doc = parseYAML(src);
  } catch (err) {
    console.warn("[synced-lyrics] couldn't parse Lyricsfile:", err);
    return null;
  }
  if (!doc || !String(doc.version).startsWith("1") || !Array.isArray(doc.lines)) return null;

  const num = (v) => (typeof v === "number" && v >= 0 ? v : null);
  const lines = doc.lines
    .filter((l) => l && typeof l === "object" && num(l.start_ms) !== null)
    .map((l) => {
      const words = (Array.isArray(l.words) ? l.words : [])
        .filter((w) => w && typeof w === "object" && num(w.start_ms) !== null && w.text != null)
        .map((w) => ({ text: String(w.text), start: w.start_ms, end: num(w.end_ms) }));
      return {
        time: l.start_ms,
        end: num(l.end_ms),
        text: String(l.text ?? words.map((w) => w.text).join("")).trim(),
        words: words.length ? words : undefined,
      };
    })
    .sort((a, b) => a.time - b.time);

  return lines.some((l) => l.words) ? lines : null;
}

export const hasWordSync = (lines) => !!lines?.some((l) => l.words?.length);
