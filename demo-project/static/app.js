"use strict";

const THEMES = {
  light:    { label: "Light",         dark: false, bg: "#ffffff", card: "#f4f4f1", text: "#2c2c2a", sub: "#5f5e5a", line: "#d3d1c7", accent: "#3b6cf6", on: "#ffffff", err: "#c0392b" },
  dark:     { label: "Dark",          dark: true,  bg: "#1f1f1e", card: "#2c2c2a", text: "#f1efe8", sub: "#b4b2a9", line: "#444441", accent: "#85b7eb", on: "#042c53", err: "#f09595" },
  midnight: { label: "Midnight",      dark: true,  bg: "#0f172a", card: "#1e293b", text: "#e2e8f0", sub: "#94a3b8", line: "#334155", accent: "#818cf8", on: "#1e1b4b", err: "#fca5a5" },
  sepia:    { label: "Sepia",         dark: false, bg: "#f6efe0", card: "#ece1c8", text: "#433422", sub: "#7a6548", line: "#d6c7a3", accent: "#9a5b13", on: "#ffffff", err: "#a32d2d" },
  forest:   { label: "Forest",        dark: false, bg: "#f1f6ef", card: "#e0ebdc", text: "#1f3326", sub: "#4f6b57", line: "#bcd2b8", accent: "#2f7d4f", on: "#ffffff", err: "#b3261e" },
  ocean:    { label: "Ocean",         dark: false, bg: "#eef6fb", card: "#dcecf7", text: "#12324a", sub: "#4a6a82", line: "#b5d3e6", accent: "#1769aa", on: "#ffffff", err: "#b3261e" },
  rose:     { label: "Rose",          dark: false, bg: "#fdf1f4", card: "#f8e0e7", text: "#3d1f2a", sub: "#7a4a5a", line: "#efc3cf", accent: "#c2185b", on: "#ffffff", err: "#b3261e" },
  lavender: { label: "Lavender",      dark: false, bg: "#f4f1fb", card: "#e7e0f5", text: "#2a2342", sub: "#5d5480", line: "#cfc5e8", accent: "#6a4fc4", on: "#ffffff", err: "#b3261e" },
  sunset:   { label: "Sunset",        dark: true,  bg: "#2a1a14", card: "#3b2820", text: "#fbeadf", sub: "#d2ab98", line: "#5a3d31", accent: "#ff9a62", on: "#3b1a08", err: "#ffb4a8" },
  contrast: { label: "High contrast", dark: true,  bg: "#000000", card: "#111111", text: "#ffffff", sub: "#d0d0d0", line: "#ffffff", accent: "#ffd400", on: "#000000", err: "#ff8a80" },
};
const THEME_VARS = {
  bg: "--bg", card: "--card", text: "--text", sub: "--sub",
  line: "--line", accent: "--accent", on: "--on", err: "--err",
};
const AUTH_PAGES = ["welcome", "login", "signup"];
const MEDIA_TYPES = "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime";

const app = document.getElementById("app");
const topbar = document.getElementById("topbar");
let renderId = 0;
let currentUser = null;
let flash = "";

/* ---------- talking to the server ---------- */

async function api(url, options) {
  try {
    const r = await fetch(url, options);
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (r.status === 401 && !url.startsWith("/api/auth/")) {
      currentUser = null;
      renderTopbar();
      if (location.hash !== "#/welcome") { location.hash = "#/welcome"; } else { route(); }
      return { ok: false, data: { error: "Please log in" } };
    }
    return { ok: r.ok, data: data };
  } catch (e) {
    return { ok: false, data: { error: "Couldn't reach the server" } };
  }
}

function backLink(href, label) {
  const a = h("a", "back", "\u2190 " + label);
  a.href = href;
  return a;
}

function showMessage(text) {
  app.textContent = "";
  app.append(h("p", "error", text), backLink("#/", "All journals"));
}

/* ---------- themes and wallpaper ---------- */

let theme = "light";
try {
  const saved = localStorage.getItem("journalTheme");
  if (saved && THEMES[saved]) theme = saved;
} catch (e) {}

function applyTheme() {
  const t = THEMES[theme];
  const root = document.documentElement;
  root.dataset.theme = theme;
  for (const key of Object.keys(THEME_VARS)) {
    root.style.setProperty(THEME_VARS[key], t[key]);
  }
  root.style.colorScheme = t.dark ? "dark" : "light";
  document.querySelectorAll(".theme-btn").forEach(function (b) {
    const on = b.dataset.theme === theme;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function buildThemeButtons(grid) {
  for (const key of Object.keys(THEMES)) {
    const t = THEMES[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-btn";
    btn.dataset.theme = key;
    btn.style.background = t.bg;
    btn.style.color = t.text;
    btn.style.borderColor = t.line;

    const name = document.createElement("span");
    name.textContent = t.label;
    const dots = document.createElement("span");
    dots.className = "theme-dots";
    for (const colour of [t.accent, t.text, t.card]) {
      const d = document.createElement("span");
      d.style.background = colour;
      dots.append(d);
    }
    btn.append(name, dots);
    btn.onclick = function () {
      theme = key;
      applyTheme();
      try { localStorage.setItem("journalTheme", theme); } catch (err) {}
    };
    grid.append(btn);
  }
}

function buildWallpaperButtons(container) {
  const grid = h("div", "wp-grid");
  function mark() {
    grid.querySelectorAll("button").forEach(function (b) {
      const on = b.dataset.wp === Wallpaper.get();
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  for (const key of Object.keys(Wallpaper.presets)) {
    const b = h("button", "", Wallpaper.presets[key]);
    b.type = "button";
    b.dataset.wp = key;
    b.onclick = function () { Wallpaper.set(key); mark(); };
    grid.append(b);
  }
  container.append(grid);
  mark();
  if (Wallpaper.reduced()) {
    container.append(h("p", "sub", "Your system has reduced motion turned on, so the wallpaper stays still."));
  }
}

function buildThemePanel() {
  const box = h("details");
  box.append(h("summary", "", "Theme"));

  const seg = h("div", "seg");
  const tintBtn = h("button", "on", "Colour tint");
  tintBtn.type = "button";
  const wpBtn = h("button", "", "Live wallpaper");
  wpBtn.type = "button";
  seg.append(tintBtn, wpBtn);

  const tintPanel = h("div");
  const grid = h("div", "theme-grid");
  buildThemeButtons(grid);
  tintPanel.append(grid);

  const wpPanel = h("div");
  wpPanel.hidden = true;
  buildWallpaperButtons(wpPanel);

  function show(which) {
    const tint = which === "tint";
    tintPanel.hidden = !tint;
    wpPanel.hidden = tint;
    tintBtn.classList.toggle("on", tint);
    wpBtn.classList.toggle("on", !tint);
    tintBtn.setAttribute("aria-pressed", tint ? "true" : "false");
    wpBtn.setAttribute("aria-pressed", tint ? "false" : "true");
  }
  tintBtn.onclick = function () { show("tint"); };
  wpBtn.onclick = function () { show("wp"); };
  show("tint");

  box.append(seg, tintPanel, wpPanel);
  return box;
}

applyTheme();

function renderTopbar() {
  topbar.textContent = "";
  topbar.hidden = !currentUser;
  if (!currentUser) return;
  const who = h("span", "", "Signed in as ");
  who.append(h("strong", "", currentUser.username));
  const out = h("button", "", "Log out");
  out.onclick = async function () {
    await api("/api/auth/logout", { method: "POST" });
    currentUser = null;
    renderTopbar();
    location.hash = "#/welcome";
  };
  topbar.append(who, out);
}

/* ---------- note style controls (whole-note font, size, colour) ---------- */

function applyText(el, s) {
  el.style.fontFamily = FONTS[s.font] || FONTS.sans;
  el.style.fontSize = s.size + "px";
  el.style.color = s.color || "";
}

function applyTitle(el, s) {
  applyText(el, s);
  el.style.fontWeight = s.bold ? "700" : "400";
}

function buildStyleControls(style, preview, commit, opts) {
  const box = document.createElement("div");
  box.className = "style-box";

  const fontLabel = document.createElement("label");
  fontLabel.textContent = "Font";
  const fontSel = document.createElement("select");
  for (const key of Object.keys(FONTS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = FONT_LABELS[key];
    fontSel.append(opt);
  }
  fontSel.value = style.font;
  fontSel.onchange = function () {
    style.font = fontSel.value;
    preview(style);
    commit();
  };
  fontLabel.append(fontSel);

  const sizeLabel = document.createElement("label");
  const sizeOut = document.createElement("span");
  sizeOut.textContent = style.size;
  sizeLabel.append("Size: ", sizeOut, " px");
  const range = document.createElement("input");
  range.type = "range";
  range.min = opts.min; range.max = opts.max; range.step = 1;
  range.value = style.size;
  range.oninput = function () {
    style.size = Number(range.value);
    sizeOut.textContent = style.size;
    preview(style);
  };
  range.onchange = function () { commit(); };
  sizeLabel.append(range);

  const colorLabel = document.createElement("label");
  colorLabel.append("Colour");
  const swatchRow = document.createElement("div");
  swatchRow.className = "swatches";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = style.color || "#000000";
  picker.setAttribute("aria-label", "Custom colour");

  function markSwatches() {
    swatchRow.querySelectorAll(".swatch").forEach(function (b) {
      b.classList.toggle("on", b.dataset.col === style.color);
    });
  }
  for (const col of SWATCHES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.dataset.col = col;
    b.style.background = col || "var(--text)";
    b.setAttribute("aria-label", col ? "Colour " + col : "Default colour");
    b.onclick = function () {
      style.color = col;
      if (col) picker.value = col;
      markSwatches();
      preview(style);
      commit();
    };
    swatchRow.append(b);
  }
  picker.oninput = function () {
    style.color = picker.value;
    markSwatches();
    preview(style);
  };
  picker.onchange = function () { commit(); };
  swatchRow.append(picker);
  colorLabel.append(swatchRow);
  markSwatches();

  box.append(fontLabel, sizeLabel, colorLabel);

  if (opts.bold) {
    const boldLabel = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = style.bold;
    cb.onchange = function () {
      style.bold = cb.checked;
      preview(style);
      commit();
    };
    boldLabel.append(cb, " Bold");
    box.append(boldLabel);
  }
  return box;
}

function buildAllControls(titleStyle, bodyStyle, previewTitle, previewBody, commit) {
  const wrap = document.createElement("div");

  function group(label, style, preview, opts) {
    const d = h("details", "style-group");
    d.append(h("summary", "", label));
    d.append(buildStyleControls(style, preview, commit, opts));
    return d;
  }

  wrap.append(
    group("Title style", titleStyle, previewTitle, { min: 14, max: 48, bold: true }),
    group("Text style", bodyStyle, previewBody, { min: 12, max: 32, bold: false })
  );
  return wrap;
}

function styleBody(titleStyle, bodyStyle) {
  return JSON.stringify({
    font: bodyStyle.font, size: bodyStyle.size, color: bodyStyle.color,
    title_font: titleStyle.font, title_size: titleStyle.size,
    title_color: titleStyle.color, title_bold: titleStyle.bold,
  });
}

function spellAttrs(input) {
  input.spellcheck = true;
  input.setAttribute("autocorrect", "on");
  input.setAttribute("autocapitalize", "sentences");
}

/* ---------- pictures and videos ---------- */

function buildGallery(items, onRemove) {
  const gallery = h("div", "gallery");
  for (const m of items) {
    const fig = document.createElement("figure");
    const src = "/api/media/" + m.id + "/file";
    if (m.kind === "video") {
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "metadata";
      v.playsInline = true;
      v.src = src;
      fig.append(v);
    } else {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Attached picture";
      img.loading = "lazy";
      fig.append(img);
    }
    if (onRemove) {
      const b = h("button", "remove", "Remove");
      b.type = "button";
      b.onclick = function () { onRemove(m); };
      fig.append(b);
    }
    gallery.append(fig);
  }
  return gallery;
}

async function uploadFiles(noteId, files, status) {
  const problems = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (status) status.textContent = "Uploading " + (i + 1) + " of " + files.length + "\u2026";
    const form = new FormData();
    form.append("note_id", String(noteId));
    form.append("file", file);
    const r = await api("/api/media/", { method: "POST", body: form });
    if (!r.ok) problems.push(file.name + ": " + ((r.data && r.data.error) || "Upload failed"));
  }
  if (status) status.textContent = "";
  return problems;
}

function fileInput() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = MEDIA_TYPES;
  input.multiple = true;
  return input;
}

/* ---------- screens ---------- */

function showWelcome() {
  renderId++;
  app.textContent = "";
  const hero = h("div", "hero");
  hero.append(
    h("h1", "", "My journals"),
    h("p", "", "Keep your notes organised in journals. Sign up to get started, or log in to continue.")
  );
  const stack = h("div", "stack");
  const signup = h("a", "btn", "Sign up");
  signup.href = "#/signup";
  const login = h("a", "btn secondary", "Log in");
  login.href = "#/login";
  stack.append(signup, login);
  app.append(hero, stack);
}

function showAuthForm(mode) {
  renderId++;
  app.textContent = "";
  const signup = mode === "signup";

  app.append(backLink("#/welcome", "Back"));
  app.append(h("h1", "", signup ? "Sign up" : "Log in"));

  const form = document.createElement("form");

  const userLabel = h("label", "field", "Username");
  const userInput = document.createElement("input");
  userInput.type = "text";
  userInput.autocomplete = "username";
  userInput.autocapitalize = "none";
  userInput.spellcheck = false;
  userInput.maxLength = 30;
  userLabel.append(userInput);
  if (signup) {
    userLabel.append(h("span", "sub", "3 to 30 characters: letters, numbers, dots, dashes, underscores."));
  }

  const passLabel = h("label", "field", "Password");
  const passInput = document.createElement("input");
  passInput.type = "password";
  passInput.autocomplete = signup ? "new-password" : "current-password";
  passInput.maxLength = 128;
  passLabel.append(passInput);
  if (signup) passLabel.append(h("span", "sub", "At least 8 characters."));

  const showLabel = h("label", "check");
  const showBox = document.createElement("input");
  showBox.type = "checkbox";
  showBox.onchange = function () { passInput.type = showBox.checked ? "text" : "password"; };
  showLabel.append(showBox, " Show password");

  const submit = h("button", "primary", signup ? "Create account" : "Log in");
  submit.type = "submit";
  const err = h("p", "error");

  form.append(userLabel, passLabel, showLabel, submit);
  app.append(form, err);

  const alt = h("p", "sub", signup ? "Already have an account? " : "No account yet? ");
  const altLink = h("a", "", signup ? "Log in" : "Sign up");
  altLink.href = signup ? "#/login" : "#/signup";
  alt.append(altLink);
  app.append(alt);

  userInput.focus();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    err.textContent = "";
    const username = userInput.value.trim();
    const password = passInput.value;

    if (!username) { err.textContent = "Enter your username"; return; }
    if (!password) { err.textContent = "Enter your password"; return; }
    if (signup) {
      if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) {
        err.textContent = "Username must be 3 to 30 characters: letters, numbers, dots, dashes or underscores";
        return;
      }
      if (password.length < 8) {
        err.textContent = "Password must be at least 8 characters";
        return;
      }
    }

    submit.disabled = true;
    const r = await api(signup ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password }),
    });
    submit.disabled = false;

    if (!r.ok) {
      err.textContent = (r.data && r.data.error) || "Something went wrong. Try again.";
      return;
    }
    currentUser = r.data.user;
    renderTopbar();
    location.hash = "#/";
  });
}

async function showHome() {
  const id = ++renderId;
  app.textContent = "";
  const [j, n, s] = await Promise.all([
    api("/api/journals/"), api("/api/notes/"), api("/api/stats/"),
  ]);
  if (id !== renderId) return;
  if (!j.ok || !Array.isArray(j.data)) {
    showMessage("Couldn't load your journals. Refresh the page.");
    return;
  }

  const counts = {};
  for (const note of (Array.isArray(n.data) ? n.data : [])) {
    counts[note.journal_id] = (counts[note.journal_id] || 0) + 1;
  }

  app.append(h("h1", "", "My journals"));
  app.append(buildThemePanel());
  applyTheme();

  const list = h("div", "list");
  if (j.data.length === 0) list.append(h("p", "sub", "No journals yet. Create one below."));
  for (const journal of j.data) {
    const a = h("a", "card");
    a.href = "#/j/" + journal.id;
    const grow = h("div", "grow");
    grow.append(
      h("strong", "", journal.name),
      h("span", "sub", plural(counts[journal.id] || 0, "note"))
    );
    a.append(grow, h("span", "go", "\u203A"));
    list.append(a);
  }
  app.append(list);

  const form = h("form", "row");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "New journal name";
  nameInput.autocomplete = "off";
  const create = h("button", "", "Create journal");
  create.type = "submit";
  form.append(nameInput, create);
  const err = h("p", "error");
  app.append(form, err);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    err.textContent = "";
    const r = await api("/api/journals/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.value }),
    });
    if (!r.ok) {
      err.textContent = (r.data && r.data.error) || "Couldn't create the journal";
      return;
    }
    location.hash = "#/j/" + r.data.id;
  });

  if (s.ok && s.data) {
    app.append(h("p", "sub",
      "All journals: " + plural(s.data.total_notes, "note") + ", " + plural(s.data.total_words, "word")));
  }
}

async function showJournal(jid) {
  const id = ++renderId;
  app.textContent = "";
  const [j, n] = await Promise.all([
    api("/api/journals/"), api("/api/notes/?journal_id=" + jid),
  ]);
  if (id !== renderId) return;
  const journal = (Array.isArray(j.data) ? j.data : []).find(function (x) { return x.id === jid; });
  if (!journal) { showMessage("That journal doesn't exist."); return; }

  app.append(backLink("#/", "All journals"));
  app.append(h("h1", "", journal.name));

  const notes = (n.ok && Array.isArray(n.data)) ? n.data : [];

  const add = h("a", "btn", "New note");
  add.href = "#/j/" + jid + "/new";
  const renameBtn = h("button", "", "Rename");
  const deleteBtn = h("button", "", "Delete journal");
  const actions = h("div", "actions");
  actions.append(add, renameBtn, deleteBtn);
  app.append(actions);

  const renameForm = h("form", "row");
  renameForm.hidden = true;
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = journal.name;
  nameInput.maxLength = 60;
  nameInput.autocomplete = "off";
  const saveName = h("button", "primary", "Save");
  saveName.type = "submit";
  const cancelName = h("button", "", "Cancel");
  cancelName.type = "button";
  renameForm.append(nameInput, saveName, cancelName);
  const err = h("p", "error");
  app.append(renameForm, err);

  renameBtn.onclick = function () {
    renameForm.hidden = false;
    nameInput.focus();
    nameInput.select();
  };
  cancelName.onclick = function () {
    renameForm.hidden = true;
    nameInput.value = journal.name;
    err.textContent = "";
  };
  renameForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    err.textContent = "";
    const r = await api("/api/journals/" + jid, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.value }),
    });
    if (!r.ok) {
      err.textContent = (r.data && r.data.error) || "Couldn't rename the journal";
      return;
    }
    showJournal(jid);
  });

  deleteBtn.onclick = async function () {
    const msg = notes.length
      ? 'Delete "' + journal.name + '" and its ' + plural(notes.length, "note") + "? This can't be undone."
      : 'Delete "' + journal.name + '"?';
    if (!window.confirm(msg)) return;
    const r = await api("/api/journals/" + jid, { method: "DELETE" });
    if (!r.ok) {
      err.textContent = (r.data && r.data.error) || "Couldn't delete the journal";
      return;
    }
    location.hash = "#/";
  };

  if (!n.ok) {
    app.append(h("p", "error", "Couldn't load notes: " + ((n.data && n.data.error) || "server error")));
  }

  const list = h("div", "list");
  app.append(list);
  if (notes.length === 0) list.append(h("p", "sub", "No notes yet. Start with New note."));

  for (const note of notes) {
    const a = h("a", "card");
    a.href = "#/j/" + jid + "/n/" + note.id;

    const firstImage = (note.media || []).find(function (m) { return m.kind === "image"; });
    if (firstImage) {
      const t = document.createElement("img");
      t.className = "thumb";
      t.src = "/api/media/" + firstImage.id + "/file";
      t.alt = "";
      t.loading = "lazy";
      a.append(t);
    }

    const text = note.text || "";
    const snippet = text.length > 120 ? text.slice(0, 120) + "\u2026" : text;
    const grow = h("div", "grow");
    grow.append(
      h("strong", "", note.title),
      h("span", "sub", new Date(note.created_at).toLocaleString()),
      h("div", "snippet", snippet)
    );
    a.append(grow, h("span", "go", "\u203A"));
    list.append(a);
  }
}

async function showNewNote(jid) {
  const id = ++renderId;
  app.textContent = "";
  const j = await api("/api/journals/");
  if (id !== renderId) return;
  const journal = (Array.isArray(j.data) ? j.data : []).find(function (x) { return x.id === jid; });
  if (!journal) { showMessage("That journal doesn't exist."); return; }

  app.append(backLink("#/j/" + jid, journal.name));
  app.append(h("h1", "", "New note"));

  const titleStyle = { font: "sans", size: 20, color: "", bold: true };
  const bodyStyle = { font: "sans", size: 16, color: "" };

  const form = document.createElement("form");
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "Title";
  titleInput.autocomplete = "off";
  spellAttrs(titleInput);

  const editor = RichText.createEditor({
    base: bodyStyle, placeholder: "Write something...", label: "Note text",
  });

  const fileLabel = h("label", "file-row", "Pictures and videos (optional)");
  const files = fileInput();
  fileLabel.append(files);

  const styleBox = h("details");
  styleBox.append(h("summary", "", "Style this note"));
  styleBox.append(buildAllControls(
    titleStyle, bodyStyle,
    function (s) { applyTitle(titleInput, s); },
    function (s) { editor.setBase(s); },
    function () {}
  ));
  applyTitle(titleInput, titleStyle);

  const save = h("button", "primary", "Save note");
  save.type = "submit";
  const status = h("p", "sub");
  const err = h("p", "error");
  form.append(titleInput, editor.el, fileLabel, styleBox, save);
  app.append(form, status, err);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    err.textContent = "";
    if (editor.getPlain().length > RichText.MAX_TEXT) {
      err.textContent = "This note is too long (20,000 characters maximum)";
      return;
    }
    save.disabled = true;

    const r = await api("/api/notes/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleInput.value,
        rich: editor.getRuns(),
        journal_id: jid,
        font: bodyStyle.font, size: bodyStyle.size, color: bodyStyle.color,
        title_font: titleStyle.font, title_size: titleStyle.size,
        title_color: titleStyle.color, title_bold: titleStyle.bold,
      }),
    });

    if (!r.ok) {
      err.textContent = (r.data && r.data.error) || "Couldn't save the note";
      save.disabled = false;
      return;
    }

    if (files.files.length) {
      const problems = await uploadFiles(r.data.id, Array.from(files.files), status);
      if (problems.length) flash = "Note saved, but some files didn't upload. " + problems.join(" ");
    }
    location.hash = "#/j/" + jid + "/n/" + r.data.id;
  });
}

async function showNote(jid, nid) {
  const id = ++renderId;
  app.textContent = "";
  const [j, n] = await Promise.all([
    api("/api/journals/"), api("/api/notes/?journal_id=" + jid),
  ]);
  if (id !== renderId) return;
  const journal = (Array.isArray(j.data) ? j.data : []).find(function (x) { return x.id === jid; });
  if (!journal) { showMessage("That journal doesn't exist."); return; }
  const note = (Array.isArray(n.data) ? n.data : []).find(function (x) { return x.id === nid; });
  if (!note) {
    app.append(h("p", "error", "That note doesn't exist."), backLink("#/j/" + jid, journal.name));
    return;
  }

  app.append(backLink("#/j/" + jid, journal.name));

  const titleStyle = {
    font: note.title_font, size: note.title_size,
    color: note.title_color, bold: Boolean(note.title_bold),
  };
  const bodyStyle = { font: note.font, size: note.size, color: note.color };
  let media = note.media || [];

  const title = h("div", "note-title", note.title);
  applyTitle(title, titleStyle);
  const meta = h("div", "meta", new Date(note.created_at).toLocaleString());
  const body = h("div", "note-text");
  RichText.render(body, note.rich, note.text);
  applyText(body, bodyStyle);
  const viewGallery = h("div");

  const view = h("div");
  view.append(title, meta, body, viewGallery);
  app.append(view);

  const err = h("p", "error", flash);
  flash = "";
  const status = h("p", "sub");

  /* edit form */
  const editForm = h("form");
  editForm.hidden = true;
  const editTitle = document.createElement("input");
  editTitle.type = "text";
  editTitle.value = note.title;
  editTitle.autocomplete = "off";
  spellAttrs(editTitle);
  const editor = RichText.createEditor({
    runs: note.rich, text: note.text, base: bodyStyle, label: "Note text",
  });
  const mediaBox = h("div");
  const addMedia = fileInput();
  const addLabel = h("label", "file-row", "Add pictures or videos");
  addLabel.append(addMedia);
  const saveEdit = h("button", "primary", "Save changes");
  saveEdit.type = "submit";
  const cancelEdit = h("button", "", "Cancel");
  cancelEdit.type = "button";
  const editActions = h("div", "actions");
  editActions.append(saveEdit, cancelEdit);
  editForm.append(editTitle, editor.el, mediaBox, addLabel, editActions);
  app.append(editForm);

  function drawMedia() {
    viewGallery.textContent = "";
    if (media.length) viewGallery.append(buildGallery(media, null));
    mediaBox.textContent = "";
    if (!editForm.hidden && media.length) mediaBox.append(buildGallery(media, removeMedia));
  }
  async function removeMedia(item) {
    err.textContent = "";
    const r = await api("/api/media/" + item.id, { method: "DELETE" });
    if (!r.ok) { err.textContent = (r.data && r.data.error) || "Couldn't remove that file"; return; }
    media = media.filter(function (m) { return m.id !== item.id; });
    drawMedia();
  }
  async function reloadMedia() {
    const r = await api("/api/notes/?journal_id=" + jid);
    const fresh = (r.ok && Array.isArray(r.data)) ? r.data.find(function (x) { return x.id === nid; }) : null;
    if (fresh) media = fresh.media || [];
    drawMedia();
  }
  addMedia.onchange = async function () {
    err.textContent = "";
    const problems = await uploadFiles(nid, Array.from(addMedia.files), status);
    addMedia.value = "";
    if (problems.length) err.textContent = problems.join(" ");
    reloadMedia();
  };
  drawMedia();

  /* whole-note style panel */
  const controls = buildAllControls(
    titleStyle, bodyStyle,
    function (s) { applyTitle(title, s); },
    function (s) { applyText(body, s); editor.setBase(s); },
    async function () {
      err.textContent = "";
      const r = await api("/api/notes/" + note.id + "/style", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: styleBody(titleStyle, bodyStyle),
      });
      if (!r.ok) err.textContent = (r.data && r.data.error) || "Couldn't save the style";
    }
  );
  controls.hidden = true;

  const editBtn = h("button", "", "Edit");
  const styleBtn = h("button", "", "Style");
  styleBtn.setAttribute("aria-expanded", "false");
  const del = h("button", "", "Delete note");
  const actions = h("div", "actions");
  actions.append(editBtn, styleBtn, del);
  app.append(actions, controls, status, err);

  function setStyleOpen(open) {
    controls.hidden = !open;
    styleBtn.textContent = open ? "Close style" : "Style";
    styleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function stopEditing() {
    editForm.hidden = true;
    view.hidden = false;
    actions.hidden = false;
    setStyleOpen(false);
  }
  editBtn.onclick = function () {
    err.textContent = "";
    view.hidden = true;
    actions.hidden = true;
    setStyleOpen(false);
    editForm.hidden = false;
    drawMedia();
    editor.focus();
  };
  cancelEdit.onclick = function () {
    showNote(jid, nid);
  };
  editForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    err.textContent = "";
    if (editor.getPlain().length > RichText.MAX_TEXT) {
      err.textContent = "This note is too long (20,000 characters maximum)";
      return;
    }
    const r = await api("/api/notes/" + note.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle.value, rich: editor.getRuns() }),
    });
    if (!r.ok) {
      err.textContent = (r.data && r.data.error) || "Couldn't save your changes";
      return;
    }
    showNote(jid, nid);
  });

  styleBtn.onclick = function () { setStyleOpen(controls.hidden); };
  del.onclick = async function () {
    if (!window.confirm("Delete this note and its pictures and videos?")) return;
    await api("/api/notes/" + note.id, { method: "DELETE" });
    location.hash = "#/j/" + jid;
  };
}

/* ---------- which screen to show ---------- */

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const first = parts[0] || "";

  if (!currentUser) {
    if (!AUTH_PAGES.includes(first)) { location.hash = "#/welcome"; return; }
    if (first === "login") return showAuthForm("login");
    if (first === "signup") return showAuthForm("signup");
    return showWelcome();
  }

  if (AUTH_PAGES.includes(first)) { location.hash = "#/"; return; }

  if (first === "j" && Number.isInteger(Number(parts[1]))) {
    const jid = Number(parts[1]);
    if (parts[2] === "new") return showNewNote(jid);
    if (parts[2] === "n" && Number.isInteger(Number(parts[3]))) {
      return showNote(jid, Number(parts[3]));
    }
    return showJournal(jid);
  }
  return showHome();
}

async function start() {
  const r = await api("/api/auth/me");
  currentUser = (r.ok && r.data && r.data.user) ? r.data.user : null;
  renderTopbar();
  route();
}

window.addEventListener("hashchange", route);
start();