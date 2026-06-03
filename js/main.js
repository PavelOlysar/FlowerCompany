/* ==========================================================================
   Flower Company — main.js
   ========================================================================== */

/* ---------- V1 scroll-jacked project transitions — exoape.com/work MOTION ----------
   One gesture = one project (wrap-around). ONE shared drastic ease-in-out (EASE) drives
   everything, and text runs the bg's full duration so they read as one coordinated motion.
   • TEXT (title + active counter number): clip-masked VERTICAL line wipe — each line
     sits in an overflow:hidden mask and its inner slides on Y only (yPercent ±100,
     no diagonal/horizontal). Outgoing slides up & out, incoming rises in from below;
     title + counter move together, and the new text enters mid-reveal (~55% of the bg).
     Mirrored on scroll-up. The "/ NN" total stays static.
   • BACKGROUND + CARD: slanted clip-path reveal seam (higher on the left); bg sweeps
     bottom→up, card top→down (opposite); mirrored on reverse. Slow, drastic ease-in-out.
   prefers-reduced-motion → instant swap. */
(function () {
  "use strict";
  if (!document.body.classList.contains("v1") || !window.gsap) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll(".hero--v1"));
  if (!sections.length) return;

  /* ---- Tunable motion constants — OVERLAPPED choreography (one place to tune) ----
     OLD text exits over the bg's full duration; the bg reveal runs slow on a drastic
     ease-in-out; NEW text enters mid-reveal (~55%, both lines together) on the SAME
     duration + easing, so bg and text read as one coordinated motion. */
  var SEAM_SKEW = 10;             // reveal-seam tilt, % of height (higher on the LEFT)
  var BG_DUR = 0.85;              // bg + card reveal wipe — slow, drastic ease-in-out
  var EXIT_DUR = BG_DUR;          // OLD text exits over the same duration as the bg
  var ENTER_AT_BG = 0.55;         // NEW text starts when the bg reveal is ~55% through
  var ENTER_DELAY = BG_DUR * ENTER_AT_BG; // → new text enters mid-reveal
  var ENTER_DUR = BG_DUR;         // NEW text enters over the same duration as the bg
  if (window.CustomEase) gsap.registerPlugin(CustomEase);
  // ONE shared drastic ease-in-out for everything (bg/card wipe + text exit + text enter).
  var EASE = window.CustomEase
    ? CustomEase.create("exo", "M0,0 C0.87,0 0.05,1 1,1")    // cubic-bezier(.87,0,.05,1) — drastic ease-in, even slower ease-out
    : "power4.inOut";                                          // fallback if plugin missing

  // Slanted clip-path reveal states (constant left-higher tilt; only sweep dir flips).
  var S = SEAM_SKEW;
  var BU_HIDDEN = "polygon(0% 100%, 100% " + (100 + S) + "%, 100% 100%, 0% 100%)";   // bottom→up, hidden
  var BU_FULL   = "polygon(0% " + (-1.5 * S) + "%, 100% " + (-0.5 * S) + "%, 100% 100%, 0% 100%)";
  var TD_HIDDEN = "polygon(0% 0%, 100% 0%, 100% 0%, 0% " + (-S) + "%)";              // top→down, hidden
  var TD_FULL   = "polygon(0% 0%, 100% 0%, 100% " + (100 + 1.5 * S) + "%, 0% " + (100 + 0.5 * S) + "%)";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var index = 0;
  var animating = false;

  function parts(s) {
    return {
      bg: s.querySelector(".hero__bg"),
      card: s.querySelector(".hero__window"),
      tline: s.querySelector(".ln-in"),    // title (single line)
      cnum: s.querySelector(".num-in")      // counter active number
    };
  }
  function reset(s) {
    gsap.set([s.querySelector(".hero__bg"), s.querySelector(".hero__window")], { clearProps: "clipPath" });
    gsap.set(s.querySelectorAll(".ln-in, .num-in"), { clearProps: "opacity,transform" });
  }

  // Wrap the title + the active counter number into overflow-hidden line masks, and
  // decode images so the wipes are smooth (all already in the DOM).
  sections.forEach(function (s) {
    var t = s.querySelector(".hero__title");
    t.innerHTML = '<span class="ln"><span class="ln-in">' + t.textContent.trim() + "</span></span>";
    var c = s.querySelector(".hero__counter");
    var m = c.textContent.trim().match(/^(\S+)([\s\S]*)$/);   // "01"  +  " / 04"
    c.innerHTML = '<span class="num"><span class="num-in">' + m[1] + "</span></span>" +
                  '<span class="cnt-rest">' + m[2] + "</span>";
    s.querySelectorAll("img").forEach(function (img) { if (img.decode) img.decode().catch(function () {}); });
  });

  sections[0].classList.add("is-shown", "is-current");

  function go(target, dir) {
    if (animating || target === index) return;
    var from = sections[index], to = sections[target];
    var pf = parts(from), pt = parts(to);

    if (reduce) {
      from.classList.remove("is-shown", "is-current");
      to.classList.add("is-shown", "is-current");
      index = target;
      return;
    }

    animating = true;
    to.classList.add("is-shown");
    to.style.zIndex = "2";   // incoming above outgoing
    from.style.zIndex = "1";

    var next = dir > 0;
    var sy = next ? 1 : -1;        // vertical sign flips with scroll direction (X lean stays constant)

    // Incoming bg/card start hidden; reveal from OPPOSITE edges (mirrored on reverse).
    gsap.set(pt.bg,   { clipPath: next ? BU_HIDDEN : TD_HIDDEN });
    gsap.set(pt.card, { clipPath: next ? TD_HIDDEN : BU_HIDDEN });
    // Incoming text pre-hidden under its masks; stays invisible through the gap until ENTER_DELAY.
    gsap.set([pt.tline, pt.cnum], { yPercent: sy * 100, opacity: 0 });

    gsap.timeline({
      defaults: { ease: EASE },   // one shared easing; durations/positions are explicit (sequence)
      onComplete: function () {
        from.classList.remove("is-shown", "is-current");
        from.style.zIndex = "";
        to.classList.add("is-current");
        to.style.zIndex = "";
        reset(from);
        reset(to);
        index = target;
        animating = false;
      }
    })
      // 1) Background + card reveal seam (slanted mechanic UNCHANGED) — slow, shared drastic ease.
      .to(pt.bg,   { clipPath: next ? BU_FULL : TD_FULL, duration: BG_DUR }, 0)
      .to(pt.card, { clipPath: next ? TD_FULL : BU_FULL, duration: BG_DUR }, 0)
      // 2) OLD text rises OUT of its masks — title + counter together, over the bg's full duration.
      .to(pf.tline, { yPercent: sy * -100, opacity: 0, duration: EXIT_DUR }, 0)
      .to(pf.cnum,  { yPercent: sy * -100, opacity: 0, duration: EXIT_DUR }, 0)
      // 3) NEW text rises IN mid-reveal (~55% of the bg) — title + counter together, same dur+ease.
      .to(pt.tline, { yPercent: 0, opacity: 1, duration: ENTER_DUR }, ENTER_DELAY)
      .to(pt.cnum,  { yPercent: 0, opacity: 1, duration: ENTER_DUR }, ENTER_DELAY);
  }

  function step(dir) {
    var n = sections.length;
    go((index + dir + n) % n, dir); // wrap: 04 → 01 (down) and 01 → 04 (up)
  }

  // --- Wheel (mouse + trackpad): idle-debounce so one gesture = one step ---
  var ready = true, idle = null;
  window.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (idle) clearTimeout(idle);
    idle = setTimeout(function () { ready = true; }, 120); // resets only after the gesture stops
    if (!ready || animating || Math.abs(e.deltaY) < 8) return;
    ready = false;
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // --- Touch swipe ---
  var startY = null;
  window.addEventListener("touchstart", function (e) { startY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
  window.addEventListener("touchend", function (e) {
    if (startY === null || animating) return;
    var dy = startY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) step(dy > 0 ? 1 : -1);
    startY = null;
  }, { passive: true });

  // --- Keyboard ---
  window.addEventListener("keydown", function (e) {
    if (animating) return;
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault(); step(1);
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault(); step(-1);
    }
  });
})();

/* ---------- Custom cursor ("kurzor") ----------
   A circle that follows the mouse. Size states:
     • default      16px
     • link hover   20px   (the link also dims to 50% via CSS)
     • project hover 104px with the "Zobrazit projekt" label
   Project hover triggers on the centred window image in V1, and on the rounded
   "radius" zone in V2. Colour is set per version in CSS (V1 green / V2 white +
   exclusion blend). Disabled on coarse/touch pointers (native cursor kept). */
(function () {
  "use strict";

  if (!window.matchMedia || !window.matchMedia("(pointer: fine)").matches) return;

  var dot = document.querySelector(".cursor-dot");
  var text = document.querySelector(".cursor-text");
  if (!dot || !text) return;

  var body = document.body;
  var isV1 = body.classList.contains("v1");
  var projectSelector = isV1 ? ".hero__window" : ".radius-zone";

  var linkHover = false;
  var projectHover = false;

  function applyState() {
    body.classList.toggle("cursor-link", linkHover);
    body.classList.toggle("cursor-project", !linkHover && projectHover);
  }

  // Follow the mouse with light smoothing; both elements share the same transform.
  var mx = window.innerWidth / 2, my = window.innerHeight / 2;
  var cx = mx, cy = my, seen = false;

  window.addEventListener("mousemove", function (e) {
    mx = e.clientX;
    my = e.clientY;
    if (!seen) { cx = mx; cy = my; seen = true; }
  });

  (function raf() {
    cx += (mx - cx) * 0.2;
    cy += (my - cy) * 0.2;
    var t = "translate(" + cx + "px," + cy + "px) translate(-50%, -50%)";
    dot.style.transform = t;
    text.style.transform = t;
    requestAnimationFrame(raf);
  })();

  // Links → shrink the dot (CSS handles the link dim on :hover).
  document.querySelectorAll(".nav a, .nav__lang span, .bottombar__all").forEach(function (el) {
    el.addEventListener("mouseenter", function () { linkHover = true; applyState(); });
    el.addEventListener("mouseleave", function () { linkHover = false; applyState(); });
  });

  // Project zone → grow into the "Zobrazit projekt" circle.
  document.querySelectorAll(projectSelector).forEach(function (el) {
    el.addEventListener("mouseenter", function () { projectHover = true; applyState(); });
    el.addEventListener("mouseleave", function () { projectHover = false; applyState(); });
  });

  // Hide the cursor when the pointer leaves the window.
  document.addEventListener("mouseleave", function () { dot.style.opacity = "0"; text.style.opacity = ""; });
  document.addEventListener("mouseenter", function () { dot.style.opacity = "1"; });
})();
