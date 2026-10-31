"use strict";

/*
  RichText: the note editor.

  A note's formatted text is stored as "runs": a list like
    [{ t: "Hello ", b: 1 }, { t: "world", c: "#d85a30", z: 24 }]
  t = the text, b/i/u/s = bold/italic/underline/strikethrough, h = highlight colour,
  c = text colour, f = font, z = size in px. Missing keys mean "same as the note's base style".
  Runs are drawn with textContent only, so a note can never carry HTML or script.
*/
const RichText = (function () {
  const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
  const HIGHLIGHTS = ["#FFEB3B", "#8BC34A", "#F48FB1", "#4FC3F7", "#FF9800"];
  const HI_ALPHA = 0.5;
  const KEYS = ["b", "i", "u", "s", "h", "c", "f", "z"];
  const MARK_FONT = "wpfontmarker";
  const MAX_TEXT = 20000;
  const GRAMMAR_URL = "https://api.languagetool.org/v2/check";

  /* ---------- small helpers (also used by the tests) ---------- */

  function plainOf(runs) {
    return runs.map(function (r) { return r.t; }).join("");
  }

  function sameStyle(a, b) {
    return KEYS.every(function (k) { return (a[k] || 0) === (b[k] || 0); });
  }

  function mergeRuns(runs) {
    const out = [];
    for (const r of runs) {
      if (!r.t) continue;
      const last = out[out.length - 1];
      if (last && sameStyle(last, r)) last.t += r.t;
      else out.push(Object.assign({}, r));
    }
    return out;
  }

  function hasStyle(r) {
    return KEYS.some(function (k) { return Boolean(r[k]); });
  }

  function parseCss(value) {
    const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+)(%?))?\s*\)/.exec(String(value));
    if (!m) return null;
    let a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (m[5] === "%") a /= 100;
    return { r: +m[1], g: +m[2], b: +m[3], a: a };
  }

  function toHex(c) {
    return "#" + [c.r, c.g, c.b].map(function (n) {
      return n.toString(16).padStart(2, "0");
    }).join("");
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function normFamily(s) {
    return String(s).toLowerCase().replace(/["']/g, "").replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").trim();
  }

  function familyKey(fam) {
    for (const k of Object.keys(FONTS)) {
      if (normFamily(FONTS[k]) === fam) return k;
    }
    return null;
  }

  /* ---------- drawing saved runs (read-only view) ---------- */

  function styleSpan(span, r) {
    if (r.b) span.style.fontWeight = "700";
    if (r.i) span.style.fontStyle = "italic";
    const deco = [r.u ? "underline" : "", r.s ? "line-through" : ""].filter(Boolean).join(" ");
    if (deco) span.style.textDecoration = deco;
    if (r.h) {
      const c = hexToRgb(r.h);
      span.style.backgroundColor = "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + HI_ALPHA + ")";
      span.style.borderRadius = "2px";
    }
    if (r.c) span.style.color = r.c;
    if (r.f && FONTS[r.f]) span.style.fontFamily = FONTS[r.f];
    if (r.z) span.style.fontSize = r.z + "px";
  }

  function renderView(container, runs, fallbackText) {
    container.textContent = "";
    if (!Array.isArray(runs)) {
      container.textContent = fallbackText || "";
      return;
    }
    for (const r of runs) {
      if (hasStyle(r)) {
        const span = document.createElement("span");
        span.textContent = r.t;
        styleSpan(span, r);
        container.append(span);
      } else {
        container.append(document.createTextNode(r.t));
      }
    }
  }

  /* ---------- reading the editor's page content back into runs ---------- */

  // Walks the editor and lists its text pieces and line breaks, in order.
  function collect(root) {
    const pieces = [];
    let needBreak = false;

    function lastIsBreak() {
      const p = pieces[pieces.length - 1];
      return Boolean(p && p.kind === "nl");
    }
    function breakIfNeeded(node) {
      if (needBreak && pieces.length && !lastIsBreak()) pieces.push({ kind: "nl", node: node });
      needBreak = false;
    }
    function walk(node) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          const text = child.nodeValue.replace(/\u00a0/g, " ");
          if (text) {
            breakIfNeeded(child);
            pieces.push({ kind: "text", node: child, text: text });
          }
        } else if (child.nodeType === 1) {
          const tag = child.tagName;
          if (tag === "BR") {
            breakIfNeeded(child);
            pieces.push({ kind: "nl", node: child, br: true });
          } else if (tag === "DIV" || tag === "P" || tag === "LI") {
            if (pieces.length && !lastIsBreak()) pieces.push({ kind: "nl", node: child });
            needBreak = false;
            walk(child);
            needBreak = true;
          } else if (tag !== "SCRIPT" && tag !== "STYLE") {
            walk(child);
          }
        }
      }
    }
    walk(root);

    // A browser keeps one extra <br> at the very end so the last empty line shows. Ignore it.
    const last = pieces[pieces.length - 1];
    if (last && last.kind === "nl" && last.br && isLastLeaf(root, last.node)) pieces.pop();
    return pieces;
  }

  function isLastLeaf(root, node) {
    let n = node;
    while (n && n !== root) {
      if (n.nextSibling) return false;
      n = n.parentNode;
    }
    return true;
  }

  function baseOf(root) {
    const cs = getComputedStyle(root);
    const col = parseCss(cs.color);
    return {
      color: col ? toHex(col) : "",
      family: normFamily(cs.fontFamily),
      size: Math.round(parseFloat(cs.fontSize)),
    };
  }

  function styleOf(el, root, base) {
    let underline = false;
    let strike = false;
    let bg = null;
    let decided = false;
    for (let n = el; n && n !== root; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const deco = cs.textDecorationLine || "";
      if (deco.indexOf("underline") !== -1) underline = true;
      if (deco.indexOf("line-through") !== -1) strike = true;
      if (!decided && n.style && n.style.backgroundColor) {
        decided = true;
        const p = parseCss(cs.backgroundColor);
        if (p && p.a > 0) bg = p;
      }
    }
    const cs = getComputedStyle(el);
    const r = {};
    const weight = cs.fontWeight;
    if (weight === "bold" || parseInt(weight, 10) >= 600) r.b = 1;
    if (cs.fontStyle === "italic" || cs.fontStyle === "oblique") r.i = 1;
    if (underline) r.u = 1;
    if (strike) r.s = 1;
    if (bg) r.h = toHex(bg);
    const col = parseCss(cs.color);
    if (col && toHex(col) !== base.color) r.c = toHex(col);
    const fam = normFamily(cs.fontFamily);
    if (fam !== base.family) {
      const key = familyKey(fam);
      if (key) r.f = key;
    }
    const px = Math.round(parseFloat(cs.fontSize));
    if (px && px !== base.size) r.z = Math.min(64, Math.max(10, px));
    return r;
  }

  function extract(root) {
    const base = baseOf(root);
    const runs = [];
    for (const p of collect(root)) {
      if (p.kind === "text") {
        runs.push(Object.assign({ t: p.text }, styleOf(p.node.parentElement || root, root, base)));
      } else {
        runs.push({ t: "\n" });
      }
    }
    return mergeRuns(runs);
  }

  // Turns "characters offset..offset+length of the plain text" into a page Range.
  function rangeFor(root, offset, length) {
    const range = document.createRange();
    const end = offset + length;
    let pos = 0;
    let started = false;
    for (const p of collect(root)) {
      const len = p.kind === "text" ? p.text.length : 1;
      if (!started && offset < pos + len) {
        if (p.kind === "text") range.setStart(p.node, offset - pos);
        else range.setStartBefore(p.node);
        started = true;
      }
      if (started && end <= pos + len) {
        if (p.kind === "text") range.setEnd(p.node, end - pos);
        else range.setEndAfter(p.node);
        return range;
      }
      pos += len;
    }
    return null;
  }

  /* ---------- the editor itself ---------- */

  function createEditor(opts) {
    const base = Object.assign({ font: "sans", size: 16, color: "" }, opts.base || {});
    const wrap = h("div", "editor");

    const editable = document.createElement("div");
    editable.className = "editable";
    editable.contentEditable = "true";
    editable.setAttribute("role", "textbox");
    editable.setAttribute("aria-multiline", "true");
    editable.setAttribute("aria-label", opts.label || "Note text");
    editable.spellcheck = true;
    editable.setAttribute("autocorrect", "on");
    editable.setAttribute("autocapitalize", "sentences");
    editable.dataset.placeholder = opts.placeholder || "";

    function setBase(b) {
      Object.assign(base, b);
      editable.style.fontFamily = FONTS[base.font] || FONTS.sans;
      editable.style.fontSize = base.size + "px";
      editable.style.color = base.color || "";
    }

    function fill(runs, text) {
      editable.textContent = "";
      const list = Array.isArray(runs) ? runs : (text ? [{ t: text }] : []);
      for (const r of list) {
        const holder = hasStyle(r) ? document.createElement("span") : null;
        if (holder) styleSpan(holder, r);
        const target = holder || editable;
        r.t.split("\n").forEach(function (part, i) {
          if (i > 0) target.append(document.createElement("br"));
          if (part) target.append(document.createTextNode(part));
        });
        if (holder) editable.append(holder);
      }
      if (list.length && list[list.length - 1].t.endsWith("\n")) {
        editable.append(document.createElement("br"));
      }
    }

    function getRuns() { return extract(editable); }
    function getPlain() {
      return collect(editable).map(function (p) { return p.kind === "text" ? p.text : "\n"; }).join("");
    }
    function updateEmpty() {
      editable.dataset.empty = editable.textContent.length === 0 ? "true" : "false";
    }

    /* selection handling: remember the selection so toolbar controls can use it */
    let savedRange = null;
    function inEditor(node) { return Boolean(node) && editable.contains(node); }
    function saveSelection() {
      const sel = window.getSelection();
      if (sel.rangeCount && inEditor(sel.anchorNode) && inEditor(sel.focusNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    function restoreSelection() {
      editable.focus();
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    }

    /* toolbar */
    const toolbar = h("div", "toolbar");
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Text formatting");
    const toggles = {};
    const pending = { size: 0, font: "" };

    function keepFocus(el) {
      el.addEventListener("mousedown", function (e) { e.preventDefault(); });
    }

    function fixMarkers() {
      if (pending.size) {
        editable.querySelectorAll('[style*="xxx-large"], font[size="7"]').forEach(function (el) {
          el.style.fontSize = pending.size + "px";
          el.removeAttribute("size");
        });
      }
      if (pending.font) {
        editable.querySelectorAll('[style*="' + MARK_FONT + '"], font[face="' + MARK_FONT + '"]').forEach(function (el) {
          el.style.fontFamily = FONTS[pending.font];
          el.removeAttribute("face");
        });
      }
    }

    function normaliseHighlights() {
      editable.querySelectorAll("[style*='background']").forEach(function (el) {
        const c = parseCss(el.style.backgroundColor);
        if (c && c.a === 1) {
          el.style.backgroundColor = "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + HI_ALPHA + ")";
        }
      });
    }

    function refreshToggles() {
      for (const cmd of Object.keys(toggles)) {
        let on = false;
        try { on = document.queryCommandState(cmd); } catch (e) {}
        toggles[cmd].classList.toggle("on", on);
        toggles[cmd].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }

    function afterEdit() {
      fixMarkers();
      normaliseHighlights();
      saveSelection();
      refreshToggles();
      updateEmpty();
      if (opts.onChange) opts.onChange();
    }

    function run(cmd, value) {
      restoreSelection();
      document.execCommand("styleWithCSS", false, true);
      document.execCommand(cmd, false, value);
      afterEdit();
    }

    function addToggle(cmd, label, cls, title) {
      const b = h("button", cls, label);
      b.type = "button";
      b.title = title;
      b.setAttribute("aria-label", title);
      b.setAttribute("aria-pressed", "false");
      keepFocus(b);
      b.addEventListener("click", function () { run(cmd); });
      toolbar.append(b);
      toggles[cmd] = b;
    }
    addToggle("bold", "B", "tb-b", "Bold");
    addToggle("italic", "I", "tb-i", "Italic");
    addToggle("underline", "U", "tb-u", "Underline");
    addToggle("strikeThrough", "S", "tb-s", "Strikethrough");

    const fontSel = document.createElement("select");
    fontSel.setAttribute("aria-label", "Font for the selected text");
    fontSel.append(new Option("Font", ""));
    for (const key of Object.keys(FONTS)) fontSel.append(new Option(FONT_LABELS[key], key));
    fontSel.addEventListener("change", function () {
      if (fontSel.value) {
        pending.font = fontSel.value;
        run("fontName", MARK_FONT);
      }
      fontSel.value = "";
    });

    const sizeSel = document.createElement("select");
    sizeSel.setAttribute("aria-label", "Size for the selected text");
    sizeSel.append(new Option("Size", ""));
    for (const px of SIZES) sizeSel.append(new Option(px + " px", String(px)));
    sizeSel.addEventListener("change", function () {
      if (sizeSel.value) {
        pending.size = Number(sizeSel.value);
        run("fontSize", "7");
      }
      sizeSel.value = "";
    });

    const clearBtn = h("button", "", "Clear");
    clearBtn.type = "button";
    clearBtn.title = "Remove formatting from the selected text";
    keepFocus(clearBtn);
    clearBtn.addEventListener("click", function () { run("removeFormat"); });

    toolbar.append(fontSel, sizeSel, clearBtn);

    const more = h("details", "tb-more");
    more.append(h("summary", "", "Colour and highlight"));

    function strip(label, items, onPick, noneLabel) {
      more.append(h("span", "strip-label", label));
      const row = h("div", "strip");
      for (const item of items) {
        const b = h("button", "swatch");
        b.type = "button";
        b.style.background = item.css;
        b.title = item.name;
        b.setAttribute("aria-label", item.name);
        keepFocus(b);
        b.addEventListener("click", function () { onPick(item.value); });
        row.append(b);
      }
      if (noneLabel) {
        const none = h("button", "", noneLabel);
        none.type = "button";
        keepFocus(none);
        none.addEventListener("click", function () { onPick(""); });
        row.append(none);
      }
      more.append(row);
    }

    strip("Text colour",
      SWATCHES.map(function (c) {
        return { css: c || "var(--text)", name: c ? "Colour " + c : "Default colour", value: c };
      }),
      function (value) {
        if (value) { run("foreColor", value); return; }
        const col = parseCss(getComputedStyle(editable).color);
        run("foreColor", col ? toHex(col) : "#000000");
      });

    strip("Highlight",
      HIGHLIGHTS.map(function (c) { return { css: c, name: "Highlight " + c, value: c }; }),
      function (value) { run("hiliteColor", value || "transparent"); },
      "None");

    /* editing behaviour */
    editable.addEventListener("beforeinput", function (e) {
      if (e.inputType === "insertParagraph") {
        e.preventDefault();
        document.execCommand("insertLineBreak");
      }
    });
    editable.addEventListener("input", function () { afterEdit(); });
    editable.addEventListener("paste", function (e) {
      e.preventDefault();
      const clip = e.clipboardData || window.clipboardData;
      const text = (clip ? clip.getData("text/plain") : "").replace(/\r\n?/g, "\n");
      text.split("\n").forEach(function (line, i) {
        if (i > 0) document.execCommand("insertLineBreak");
        if (line) document.execCommand("insertText", false, line);
      });
    });
    editable.addEventListener("drop", function (e) { e.preventDefault(); });

    function onSelectionChange() {
      if (!document.body.contains(editable)) {
        document.removeEventListener("selectionchange", onSelectionChange);
        return;
      }
      const sel = window.getSelection();
      if (sel.rangeCount && inEditor(sel.anchorNode)) {
        saveSelection();
        refreshToggles();
      }
    }
    document.addEventListener("selectionchange", onSelectionChange);

    /* grammar help (optional, only when the button is pressed) */
    const grammar = h("div", "grammar");
    const gRow = h("div", "toolbar");
    const gBtn = h("button", "", "Check grammar");
    gBtn.type = "button";
    const langSel = document.createElement("select");
    langSel.setAttribute("aria-label", "Language to check");
    [["auto", "Auto-detect language"], ["en-US", "English (US)"], ["en-GB", "English (UK)"]].forEach(function (pair) {
      langSel.append(new Option(pair[1], pair[0]));
    });
    gRow.append(gBtn, langSel);
    const gOut = h("div", "grammar-out");
    gOut.setAttribute("aria-live", "polite");
    const credit = h("p", "sub");
    const creditLink = h("a", "", "LanguageTool");
    creditLink.href = "https://languagetool.org";
    creditLink.target = "_blank";
    creditLink.rel = "noopener noreferrer";
    credit.append("Grammar checking by ", creditLink, ". Pressing the button sends this note's text to LanguageTool. Spelling is also underlined as you type.");
    grammar.append(gRow, gOut, credit);

    function consented() {
      try { if (localStorage.getItem("journalGrammarOk") === "1") return true; } catch (e) {}
      const ok = window.confirm("To check grammar, this note's text is sent to LanguageTool (languagetool.org), an outside service. Continue?");
      if (ok) { try { localStorage.setItem("journalGrammarOk", "1"); } catch (e) {} }
      return ok;
    }

    function showMatches(checked, matches) {
      gOut.textContent = "";
      const items = matches.slice(0, 50).map(function (m) {
        return { m: m, offset: m.offset, length: m.length, done: false, row: null };
      });
      if (!items.length) {
        gOut.append(h("p", "sub", "No problems found."));
        return;
      }
      let expected = checked;

      function finish(it) {
        it.done = true;
        if (it.row) it.row.remove();
        if (!gOut.querySelector(".issue")) gOut.append(h("p", "sub", "All suggestions handled."));
      }

      function apply(it, value) {
        if (getPlain() !== expected) {
          gOut.prepend(h("p", "error", "The note changed since the check. Press Check grammar again."));
          return;
        }
        const range = rangeFor(editable, it.offset, it.length);
        if (!range) return;
        editable.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (value) document.execCommand("insertText", false, value);
        else document.execCommand("delete");

        const end = it.offset + it.length;
        const delta = value.length - it.length;
        expected = expected.slice(0, it.offset) + value + expected.slice(end);
        for (const other of items) {
          if (other === it || other.done) continue;
          if (other.offset >= end) other.offset += delta;
          else if (other.offset + other.length > it.offset) finish(other);
        }
        finish(it);
        afterEdit();
      }

      gOut.append(h("p", "sub", plural(items.length, "suggestion") + ". Tap a fix to apply it."));
      for (const it of items) {
        const row = h("div", "issue");
        it.row = row;
        const original = checked.slice(it.offset, it.offset + it.length);
        row.append(h("strong", "", it.m.message || "Possible problem"));
        row.append(h("div", "sub", "\u201C" + original + "\u201D"));
        const fixes = h("div", "fixes");
        for (const rep of (it.m.replacements || []).slice(0, 3)) {
          const value = String(rep.value === undefined ? "" : rep.value);
          const b = h("button", "", value === "" ? "(remove)" : value);
          b.type = "button";
          b.addEventListener("click", function () { apply(it, value); });
          fixes.append(b);
        }
        const show = h("button", "", "Show");
        show.type = "button";
        show.addEventListener("click", function () {
          const range = rangeFor(editable, it.offset, it.length);
          if (!range) return;
          editable.focus();
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
        const ignore = h("button", "", "Ignore");
        ignore.type = "button";
        ignore.addEventListener("click", function () { finish(it); });
        fixes.append(show, ignore);
        row.append(fixes);
        gOut.append(row);
      }
    }

    gBtn.addEventListener("click", async function () {
      gOut.textContent = "";
      const text = getPlain();
      if (!text.trim()) { gOut.append(h("p", "sub", "Write something first.")); return; }
      if (text.length > MAX_TEXT) { gOut.append(h("p", "error", "Too long to check (20,000 characters maximum).")); return; }
      if (!consented()) return;

      gBtn.disabled = true;
      gOut.append(h("p", "sub", "Checking\u2026"));
      let data = null;
      try {
        const res = await fetch(GRAMMAR_URL, {
          method: "POST",
          body: new URLSearchParams({ text: text, language: langSel.value }),
        });
        if (!res.ok) throw new Error(String(res.status));
        data = await res.json();
      } catch (e) {
        gOut.textContent = "";
        gOut.append(h("p", "error", "Couldn't reach the grammar service. Try again in a minute."));
        gBtn.disabled = false;
        return;
      }
      gBtn.disabled = false;
      showMatches(text, Array.isArray(data.matches) ? data.matches : []);
    });

    wrap.append(toolbar, more, editable, grammar);
    setBase(base);
    fill(opts.runs, opts.text);
    updateEmpty();

    return {
      el: wrap,
      editable: editable,
      getRuns: getRuns,
      getPlain: getPlain,
      setBase: setBase,
      focus: function () { editable.focus(); },
    };
  }

  return {
    MAX_TEXT: MAX_TEXT,
    render: renderView,
    createEditor: createEditor,
    plainOf: plainOf,
    mergeRuns: mergeRuns,
    parseCss: parseCss,
    toHex: toHex,
    normFamily: normFamily,
  };
})();