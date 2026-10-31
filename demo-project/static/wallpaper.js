"use strict";

const Wallpaper = (function () {
  const KEY = "journalWallpaper";
  const PRESETS = {
    none: "None", aurora: "Aurora", stars: "Starry night",
    rain: "Rain", fireflies: "Fireflies", waves: "Waves",
  };
  let current = "none";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && PRESETS[saved]) current = saved;
  } catch (e) {}

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.createElement("canvas");
  canvas.id = "wallpaper";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  function rgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return "rgba(128,128,128," + a + ")";
    const n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const get = function (name) { return cs.getPropertyValue(name).trim(); };
    return { bg: get("--bg"), accent: get("--accent"), text: get("--text") };
  }

  const WAVES = [
    { a: 0.30, amp: 0.05, k: 1.6, sp: 0.5, y: 0.62 },
    { a: 0.22, amp: 0.06, k: 1.1, sp: -0.35, y: 0.72 },
    { a: 0.16, amp: 0.07, k: 0.8, sp: 0.25, y: 0.82 },
  ];

  const makers = {
    aurora: function (w, h) {
      const blobs = [0, 1, 2, 3].map(function (i) {
        return { ph: Math.random() * 6.28, sp: 0.08 + Math.random() * 0.1, r: 0.35 + Math.random() * 0.2, ci: i % 3 };
      });
      return function (c, t, col) {
        c.fillStyle = col.bg;
        c.fillRect(0, 0, w, h);
        const cols = [col.accent, "#7F77DD", "#1D9E75"];
        for (const b of blobs) {
          const x = w * (0.5 + 0.4 * Math.sin(t * b.sp + b.ph));
          const y = h * (0.5 + 0.35 * Math.cos(t * b.sp * 1.3 + b.ph * 2));
          const r = Math.max(w, h) * b.r;
          const g = c.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgba(cols[b.ci], 0.55));
          g.addColorStop(1, rgba(cols[b.ci], 0));
          c.fillStyle = g;
          c.fillRect(0, 0, w, h);
        }
      };
    },

    stars: function (w, h) {
      const n = Math.round((w * h) / 9000);
      const stars = Array.from({ length: n }, function () {
        return { x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.4, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6, dr: 2 + Math.random() * 6 };
      });
      return function (c, t, col) {
        c.fillStyle = col.bg;
        c.fillRect(0, 0, w, h);
        for (const s of stars) {
          const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
          c.fillStyle = rgba(col.text, a);
          c.beginPath();
          c.arc((s.x + t * s.dr) % w, s.y, s.r, 0, 6.2832);
          c.fill();
        }
      };
    },

    rain: function (w, h) {
      const n = Math.round(w / 12);
      const drops = Array.from({ length: n }, function () {
        return { x: Math.random() * w, y: Math.random() * h, l: 10 + Math.random() * 16, v: 380 + Math.random() * 320 };
      });
      let last = 0;
      return function (c, t, col) {
        const dt = last ? Math.min(t - last, 0.1) : 0;
        last = t;
        c.fillStyle = col.bg;
        c.fillRect(0, 0, w, h);
        c.strokeStyle = rgba(col.accent, 0.45);
        c.lineWidth = 1.2;
        c.lineCap = "round";
        c.beginPath();
        for (const d of drops) {
          d.y += d.v * dt;
          d.x -= d.v * dt * 0.12;
          if (d.y > h + d.l) { d.y = -d.l; d.x = Math.random() * w; }
          if (d.x < -10) d.x = w + 10;
          c.moveTo(d.x, d.y);
          c.lineTo(d.x + d.l * 0.12, d.y - d.l);
        }
        c.stroke();
      };
    },

    fireflies: function (w, h) {
      const n = Math.max(18, Math.round((w * h) / 22000));
      const flies = Array.from({ length: n }, function () {
        return { x: Math.random() * w, y: Math.random() * h, a: Math.random() * 6.28, v: 10 + Math.random() * 22, ph: Math.random() * 6.28, r: 14 + Math.random() * 18 };
      });
      let last = 0;
      return function (c, t, col) {
        const dt = last ? Math.min(t - last, 0.1) : 0;
        last = t;
        c.fillStyle = col.bg;
        c.fillRect(0, 0, w, h);
        for (const f of flies) {
          f.a += (Math.random() - 0.5) * 2 * dt;
          f.x = (f.x + Math.cos(f.a) * f.v * dt + w) % w;
          f.y = (f.y + Math.sin(f.a) * f.v * dt + h) % h;
          const glow = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 1.2 + f.ph));
          const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
          g.addColorStop(0, rgba(col.accent, 0.7 * glow));
          g.addColorStop(1, rgba(col.accent, 0));
          c.fillStyle = g;
          c.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
        }
      };
    },

    waves: function (w, h) {
      return function (c, t, col) {
        c.fillStyle = col.bg;
        c.fillRect(0, 0, w, h);
        for (const L of WAVES) {
          c.beginPath();
          c.moveTo(0, h);
          for (let x = 0; x <= w; x += 8) {
            const y = h * L.y + Math.sin((x / w) * 6.2832 * L.k + t * L.sp * 2) * h * L.amp;
            c.lineTo(x, y);
          }
          c.lineTo(w, h);
          c.closePath();
          c.fillStyle = rgba(col.accent, L.a);
          c.fill();
        }
      };
    },
  };

  let draw = null;
  let raf = 0;
  let lastFrame = 0;
  let lastW = 0;
  let lastH = 0;
  const t0 = performance.now();

  function size() {
    lastW = window.innerWidth;
    lastH = window.innerHeight;
    canvas.width = Math.max(1, lastW);
    canvas.height = Math.max(1, lastH);
  }

  function build() {
    draw = current === "none" ? null : makers[current](canvas.width, canvas.height);
  }

  function frame(now) {
    raf = 0;
    if (!draw) return;
    if (now - lastFrame >= 33) {
      lastFrame = now;
      draw(ctx, (now - t0) / 1000, colors());
    }
    if (!document.hidden && !reduceMotion.matches) raf = requestAnimationFrame(frame);
  }

  function run() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!draw) return;
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function apply() {
    document.documentElement.classList.toggle("wp", current !== "none");
    size();
    build();
    run();
  }

  function set(key) {
    if (!PRESETS[key]) return;
    current = key;
    try { localStorage.setItem(KEY, key); } catch (e) {}
    apply();
  }

  let resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      const w = window.innerWidth;
      const hgt = window.innerHeight;
      if (Math.abs(w - lastW) < 2 && Math.abs(hgt - lastH) < 120) return;
      apply();
    }, 150);
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) run();
  });
  reduceMotion.addEventListener("change", run);
  new MutationObserver(run).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"],
  });

  apply();

  return {
    presets: PRESETS,
    get: function () { return current; },
    set: set,
    reduced: function () { return reduceMotion.matches; },
  };
})();