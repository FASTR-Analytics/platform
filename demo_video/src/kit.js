// Shared by every page under demo_video/src: a deterministic timeline the
// renderer drives frame by frame (window.setTime), a live preview loop for a
// browser (window.play), and the icon set.

const EASE = (p) => 1 - Math.pow(1 - p, 3);
const clamp = (v) => Math.max(0, Math.min(1, v));

const items = [];

// kind: "fade" (fade and rise), "draw" (stroke reveal of an SVG path),
// "pop" (scale in), "count" (callback with eased progress).
export function anim(el, start, dur, kind = "fade", fn) {
  items.push({ el, start, dur, kind, fn });
  if (kind === "draw") {
    const len = el.getTotalLength();
    el.style.strokeDasharray = el.classList.contains("next-arrow")
      ? `12 12`
      : `${len}`;
    el.dataset.len = String(len);
  }
}

export function setTime(t) {
  for (const it of items) {
    const p = EASE(clamp((t - it.start) / it.dur));
    switch (it.kind) {
      case "fade":
        it.el.style.opacity = String(p);
        it.el.style.transform = `translateY(${(1 - p) * 24}px)`;
        break;
      case "pop":
        it.el.style.opacity = String(p);
        it.el.style.transform = `scale(${0.8 + 0.2 * p})`;
        break;
      case "draw": {
        const len = Number(it.el.dataset.len);
        if (it.el.classList.contains("next-arrow")) {
          it.el.style.opacity = String(p);
        } else {
          it.el.style.strokeDashoffset = String(len * (1 - p));
        }
        break;
      }
      case "count":
        if (it.fn) it.fn(p);
        break;
    }
  }
}

export function play(duration) {
  const t0 = performance.now();
  const step = () => {
    const t = (performance.now() - t0) / 1000;
    setTime(Math.min(t, duration));
    if (t < duration) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function still(duration) {
  setTime(duration);
}

const S = (inner, extra = "") =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

export const icons = {
  database: S(
    `<ellipse cx="24" cy="12" rx="15" ry="6"/><path d="M9 12v24c0 3.3 6.7 6 15 6s15-2.7 15-6V12"/><path d="M9 24c0 3.3 6.7 6 15 6s15-2.7 15-6"/>`,
  ),
  clipboard: S(
    `<rect x="10" y="8" width="28" height="34" rx="4"/><rect x="18" y="4" width="12" height="8" rx="2" fill="#fff"/><path d="M17 22h14M17 30h10"/>`,
  ),
  people: S(
    `<circle cx="18" cy="16" r="6"/><circle cx="33" cy="19" r="5"/><path d="M6 40c0-7 5-12 12-12s12 5 12 12"/><path d="M30 40c0-5 3-9 8-9s6 4 6 9"/>`,
  ),
  pin: S(
    `<path d="M24 44s-14-13-14-24a14 14 0 0 1 28 0c0 11-14 24-14 24z"/><circle cx="24" cy="20" r="5"/>`,
  ),
  slides: S(
    `<rect x="6" y="10" width="36" height="26" rx="3"/><path d="M14 20h8v8h-8zM26 18h10M26 24h10M26 30h6"/><path d="M18 42h12"/>`,
  ),
  report: S(
    `<path d="M12 6h18l8 8v28H12z"/><path d="M30 6v8h8"/><path d="M18 24h12M18 30h12M18 36h8"/>`,
  ),
  pdf: S(`<path d="M12 6h18l8 8v28H12z"/><path d="M30 6v8h8"/>`),
  pptx: S(
    `<rect x="6" y="10" width="36" height="26" rx="3"/><path d="M18 42h12"/>`,
  ),
  word: S(
    `<path d="M12 6h18l8 8v28H12z"/><path d="M30 6v8h8"/><path d="M17 22l3 12 4-9 4 9 3-12"/>`,
  ),
  email: S(
    `<rect x="6" y="12" width="36" height="24" rx="4"/><path d="M6 14l18 13 18-13"/>`,
  ),
  present: S(
    `<rect x="6" y="8" width="36" height="24" rx="3"/><path d="M20 15l10 5-10 5z" fill="currentColor"/><path d="M24 32v8M16 40h16"/>`,
  ),
  clock: S(`<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 5"/>`),
  bell: S(
    `<path d="M12 32V22a12 12 0 0 1 24 0v10l4 4H8z"/><path d="M20 40a4 4 0 0 0 8 0"/>`,
  ),
  link: S(
    `<path d="M20 28l8-8"/><path d="M26 14l4-4a7 7 0 0 1 10 10l-4 4"/><path d="M22 34l-4 4a7 7 0 0 1-10-10l4-4"/>`,
  ),
  sparkle: S(
    `<path d="M24 6l3.5 10.5L38 20l-10.5 3.5L24 34l-3.5-10.5L10 20l10.5-3.5z" fill="currentColor" stroke="none"/><path d="M38 32l1.5 4.5L44 38l-4.5 1.5L38 44l-1.5-4.5L32 38l4.5-1.5z" fill="currentColor" stroke="none"/>`,
  ),
  shield: S(
    `<path d="M24 5l15 6v12c0 9-6 17-15 20C15 40 9 32 9 23V11z"/><path d="M17 24l5 5 9-10"/>`,
  ),
  check: S(`<path d="M12 25l8 8 16-18"/>`),
  person: S(
    `<circle cx="24" cy="16" r="8"/><path d="M8 42c0-9 7-15 16-15s16 6 16 15"/>`,
  ),
  chart: S(`<path d="M8 40h32"/><path d="M12 34l9-10 8 6 10-14"/>`),
  map: S(
    `<path d="M6 12l12-4 12 4 12-4v28l-12 4-12-4-12 4z"/><path d="M18 8v28M30 12v28"/>`,
  ),
  table: S(
    `<rect x="6" y="10" width="36" height="28" rx="3"/><path d="M6 20h36M6 29h36M18 10v28M30 10v28"/>`,
  ),
  doc: S(
    `<path d="M12 6h18l8 8v28H12z"/><path d="M30 6v8h8"/><path d="M18 24h12M18 30h12"/>`,
  ),
  x: S(`<circle cx="24" cy="24" r="16"/><path d="M17 17l14 14M31 17L17 31"/>`),
  history: S(
    `<path d="M8 24a16 16 0 1 0 5-11.6"/><path d="M8 8v8h8"/><path d="M24 16v9l6 4"/>`,
  ),
};

// A straight or gently curved arrow between two points, as SVG markup: the
// path (drawn) and the head (faded in by the caller).
export function arrow(x1, y1, x2, y2, { bend = 0, cls = "" } = {}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  const ex = x2 - (dx / len) * 14;
  const ey = y2 - (dy / len) * 14;
  const ang = Math.atan2(y2 - cy, x2 - cx);
  const hx = x2;
  const hy = y2;
  const h = 14;
  const p1 = `${hx - h * Math.cos(ang - 0.5)},${hy - h * Math.sin(ang - 0.5)}`;
  const p2 = `${hx - h * Math.cos(ang + 0.5)},${hy - h * Math.sin(ang + 0.5)}`;
  return {
    path: `<path class="${cls}" d="M${x1} ${y1} Q${cx} ${cy} ${ex} ${ey}"/>`,
    head: `<polygon class="${
      cls ? "next-head" : ""
    }" points="${hx},${hy} ${p1} ${p2}"/>`,
  };
}
