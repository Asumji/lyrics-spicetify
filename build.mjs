// Bundles src/ into a single Spicetify extension file: dist/syncedLyrics.js
//
// Spicetify loads each extension as one classic <script>, so the ES modules in src/ are
// concatenated in dependency order inside one function scope. Supported module syntax:
//   import { a, b } from "./relative/path.js";
//   export function / export async function / export const / export let / export class
// Every top-level name must be unique across all modules (the build fails otherwise).
//
// The bundle is then minified with terser: comments and whitespace are removed, local names are
// shortened, and css`...` / html`...` templates (see src/util.js) are collapsed into minified strings.
//
// Usage:
//   node build.mjs            build dist/syncedLyrics.js
//   node build.mjs --install  build, then copy it into Spicetify's Extensions folder

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(ROOT, "src", "index.js");
const OUT = join(ROOT, "dist", "syncedLyrics.js");

const TAGGED_TEMPLATE_RE = /\b(css|html)`([^`$\\]*)`/g;

function minifyCss(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":")
    .replace(/;}/g, "}")
    .replace(/([^\d.])0\.(\d)/g, "$1.$2")
    .replace(/#([\da-f])\1([\da-f])\2([\da-f])\3\b/gi, "#$1$2$3")
    .trim();
}

function minifyHtml(text) {
  return text.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

// Replaces css`...` / html`...` with plain minified string literals.
function inlineTemplates(body) {
  return body.replace(TAGGED_TEMPLATE_RE, (_, tag, text) => JSON.stringify(tag === "css" ? minifyCss(text) : minifyHtml(text)));
}

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*["'](\.{1,2}\/[^"']+)["'];?[ \t]*\r?\n?/gm;
const EXPORT_RE = /^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm;
const TOP_LEVEL_DECL_RE = /^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;

const rel = (file) => relative(ROOT, file).replace(/\\/g, "/");

function bundle() {
  const modules = [];
  const done = new Set();
  const visiting = [];

  function visit(file) {
    if (done.has(file)) return;
    if (visiting.includes(file)) {
      throw new Error(`Circular import: ${[...visiting.slice(visiting.indexOf(file)), file].map(rel).join(" -> ")}`);
    }
    visiting.push(file);

    const src = readFileSync(file, "utf8");
    for (const [, names, spec] of src.matchAll(IMPORT_RE)) {
      if (/\bas\b/.test(names)) throw new Error(`${rel(file)}: "import { x as y }" is not supported`);
      visit(resolve(dirname(file), spec));
    }

    const body = src.replace(IMPORT_RE, "");
    if (/^\s*import\b/m.test(body)) throw new Error(`${rel(file)}: only "import { a, b } from './file.js'" is supported`);
    if (/^export\s+(default|\{|\*)/m.test(body)) throw new Error(`${rel(file)}: only named "export function/const/let/class" is supported`);

    visiting.pop();
    done.add(file);
    modules.push({ file, body: inlineTemplates(body.replace(EXPORT_RE, "")).trim() });
  }

  visit(ENTRY);

  // All modules share one scope, so top-level names must not collide.
  const owners = new Map();
  for (const { file, body } of modules) {
    for (const [, name] of body.matchAll(TOP_LEVEL_DECL_RE)) {
      if (owners.has(name)) throw new Error(`"${name}" is declared in both ${rel(owners.get(name))} and ${rel(file)}`);
      owners.set(name, file);
    }
  }

  return `(function () {\n"use strict";\n${modules.map((m) => m.body).join("\n")}\n})();\n`;
}

async function minifyBundle(code) {
  const result = await minify(code, {
    ecma: 2020,
    compress: { ecma: 2020, passes: 3, unsafe_arrows: true, unsafe_methods: true },
    mangle: true,
    format: { comments: false, ecma: 2020 },
  });
  return result.code;
}

function extensionsDir() {
  if (process.env.SPICETIFY_CONFIG) return join(process.env.SPICETIFY_CONFIG, "Extensions");
  if (process.platform === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "spicetify", "Extensions");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "spicetify", "Extensions");
}

const bundled = bundle();
const output = await minifyBundle(bundled);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, output);
console.log(`Built ${rel(OUT)} (${(output.length / 1024).toFixed(1)} KB, ${(bundled.length / 1024).toFixed(1)} KB before minifying)`);

if (process.argv.includes("--install")) {
  const dest = join(extensionsDir(), "syncedLyrics.js");
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(OUT, dest);
  console.log(`Copied to ${dest}`);
}
