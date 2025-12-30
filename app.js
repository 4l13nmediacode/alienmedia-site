// ---------- CONFIG ----------
const SANITY_PROJECT_ID = "efhfyorc";
const SANITY_DATASET = "production";
const SANITY_API_VERSION = "2023-10-01";

// How many signals to load per session (curated)
const LIMIT = 20;

// Navigation throttle (prevents trackpad chaos)
const NAV_COOLDOWN_MS = 700;

// Respect reduced motion
const prefersReducedMotion =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- SANITY QUERY ----------
const query = `
  *[_type == "signal"]
  | order(
      select(
        section == "arrival" => 1,
        section == "tension" => 2,
        section == "rupture" => 3,
        section == "after" => 4,
        section == "hidden" => 5,
        999
      ) asc,
      order asc
    )[0..${LIMIT - 1}] {
    _id,
    signalText,
    mood,
    weight,
    section,
    order,
    "imageUrl": image.asset->url
  }
`;

const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}`;

// ---------- STATE ----------
let signals = [];
let index = 0;
let canNavigate = true;

// ---------- HELPERS ----------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function cooldown() {
  canNavigate = false;
  window.setTimeout(() => (canNavigate = true), NAV_COOLDOWN_MS);
}

function setActiveFrame(nextIndex) {
  const prev = document.querySelector(".frame.is-active");
  if (prev) prev.classList.remove("is-active");

  const next = document.querySelector(`.frame[data-index="${nextIndex}"]`);
  if (next) next.classList.add("is-active");
}

function go(toIndex) {
  const nextIndex = clamp(toIndex, 0, signals.length - 1);
  if (nextIndex === index) return;

  index = nextIndex;

  if (prefersReducedMotion) {
    // no fancy transitions
    document.querySelectorAll(".frame").forEach((f) => f.classList.remove("is-active"));
    const active = document.querySelector(`.frame[data-index="${index}"]`);
    if (active) active.classList.add("is-active");
    return;
  }

  setActiveFrame(index);
}

function next() {
  if (!canNavigate) return;
  cooldown();
  go(index + 1);
}

function prev() {
  if (!canNavigate) return;
  cooldown();
  go(index - 1);
}

// ---------- INPUT HANDLERS ----------
let wheelAccum = 0;
let wheelTimer = null;

// We interpret wheel intent rather than raw pixels
function onWheel(e) {
  e.preventDefault();
  if (!canNavigate) return;

  wheelAccum += e.deltaY;

  // Debounce: decide direction after short burst
  if (wheelTimer) clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => {
    const threshold = 60; // tuned for most mice/trackpads
    if (wheelAccum > threshold) next();
    else if (wheelAccum < -threshold) prev();
    wheelAccum = 0;
  }, 60);
}

function onKey(e) {
  if (!canNavigate) return;
  if (["ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
    e.preventDefault();
    next();
  }
  if (["ArrowUp", "PageUp"].includes(e.key)) {
    e.preventDefault();
    prev();
  }
}

// Touch: swipe up/down to navigate
let touchStartY = null;
function onTouchStart(e) {
  touchStartY = e.touches[0].clientY;
}
function onTouchEnd(e) {
  if (touchStartY == null) return;
  const endY = e.changedTouches[0].clientY;
  const dy = touchStartY - endY;
  touchStartY = null;

  const threshold = 45;
  if (Math.abs(dy) < threshold) return;

  if (dy > 0) next();
  else prev();
}

// ---------- RENDER ----------
function renderFrames(container, data) {
  container.innerHTML = "";

  data.forEach((s, i) => {
    const img = el("img", {
      class: "signal-img",
      src: s.imageUrl,
      alt: "",
      loading: "lazy",
      decoding: "async",
    });

img.addEventListener("load", () => {
  // Default is cover (no bars).
  // Only switch to contain if it's an extreme portrait.
  const ratio = img.naturalWidth / img.naturalHeight; // < 1 = portrait
  const isExtremePortrait = ratio < 0.65; // tune: lower = more tolerant of cropping

  img.classList.toggle("fit-contain", isExtremePortrait);
});


    const inner = el("div", { class: "frame-inner" }, [img]);

    if (s.signalText && s.signalText.trim().length) {
      inner.appendChild(el("p", { class: "signal-text", html: escapeHtml(s.signalText) }));
    }

    const frame = el("section", {
      class: "frame" + (i === 0 ? " is-active" : ""),
      "data-index": String(i),
      "data-id": s._id,
    }, [inner]);

    container.appendChild(frame);
  });
}

// Basic escape so text can’t break HTML
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  // Build fixed UI shell (header + hint)
  document.body.innerHTML = `
    <div id="app">
      <div class="header">
        <div class="brand">
          <h1>4L13N MEDIA</h1>
          <p>Photography · Stories · Signals</p>
        </div>
      </div>

      <div id="signals" class="signals">
        <p class="loading">Loading signals…</p>
      </div>

      <div class="hint">SCROLL</div>
    </div>
  `;

  const container = document.getElementById("signals");

  try {
    const res = await fetch(url);
    const json = await res.json();
    signals = json.result || [];

    if (!signals.length) {
      container.innerHTML = `<p class="loading">No signals yet.</p>`;
      return;
    }

    renderFrames(container, signals);

    // Attach inputs
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="loading">Failed to load signals.</p>`;
  }
}

init();




