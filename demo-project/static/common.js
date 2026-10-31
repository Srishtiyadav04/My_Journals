"use strict";

const FONTS = {
  sans: "system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  book: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif",
  mono: "ui-monospace, Menlo, monospace",
  cursive: "'Snell Roundhand', 'Segoe Script', 'Comic Sans MS', cursive",
  rounded: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
};
const FONT_LABELS = {
  sans: "Sans", serif: "Serif", book: "Book", mono: "Mono",
  cursive: "Handwritten", rounded: "Rounded",
};
const SWATCHES = ["", "#D85A30", "#E24B4A", "#BA7517", "#639922",
                  "#1D9E75", "#378ADD", "#7F77DD", "#D4537E", "#888780"];

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}