// Measures WCAG contrast for the text and background pairs the app uses, read
// from the tokens in src/app/globals.css. Exits 1 if a pair is below its
// threshold: 4.5 for text, 3 for large text and UI components.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const token = (name) => {
  const line = css.split("\n").find((l) => l.trim().startsWith(`--color-${name}:`));
  const hex = line?.match(/#[0-9a-fA-F]{6}/)?.[0];
  if (!hex) throw new Error(`token ${name} not found`);
  return hex;
};
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Mix a state colour over the surface at the chip's tint opacity.
const tint = (fg, bg, alpha) => {
  const mix = (i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha));
  return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
};

const pairs = [
  ["fg", "canvas", 4.5], ["fg", "surface", 4.5], ["muted", "canvas", 4.5], ["muted", "surface", 4.5],
  ["muted", "canvas-sunken", 4.5], ["accent", "surface", 4.5], ["accent", "canvas", 4.5],
  ["canvas", "accent", 4.5], ["canvas", "accent-strong", 4.5], ["danger", "surface", 4.5],
  ["live", "surface", 4.5], ["alert", "surface", 4.5], ["faint", "surface", 3],
];
let failed = 0;
const report = (label, value, min) => {
  const ok = value >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${value.toFixed(2).padStart(5)}  (min ${min})  ${label}`);
};
for (const [fg, bg, min] of pairs) report(`${fg} on ${bg}`, ratio(token(fg), token(bg)), min);
const surface = token("surface");
for (const state of ["draft", "waiting", "action", "done", "void"]) {
  const c = token(`state-${state}`);
  report(`chip text state-${state} on its 10% tint`, ratio(c, tint(c, surface, 0.1)), 4.5);
}
process.exit(failed ? 1 : 0);
