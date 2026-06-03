/* ==========================================================================
   Flower Company — main.js
   ========================================================================== */

/* ---------- V1 scroll-jacked project transitions — exoape.com/work MOTION ----------
   One gesture = one project (wrap-around). The bg/card sweep on EASE (snappy in, extreme slow
   near-stop end); the text runs SHORTER on its own ease-out (TEXT_EASE) so it settles faster.
   • TEXT (title + active counter number): clip-masked line wipe — each line sits in an
     overflow:hidden mask and its inner slides on Y (yPercent ±100) while TILTED (left-higher)
     and STRAIGHTENS to level as it settles, echoing the bg seam. Incoming rises in from below
     (tilt→straight); outgoing slides up & out (straight→tilt); title + counter move together,
     new text enters mid-reveal (~55% of the bg). Mirrored on scroll-up. The "/ NN" total stays static.
   • BACKGROUND + CARD: slanted clip-path reveal seam (higher on the left) that STRAIGHTENS to
     level as it sweeps; bg goes bottom→up, card top→down (opposite); mirrored on reverse.
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
  var SEAM_SKEW = 22;             // reveal-seam tilt at the START, % of height (higher on the LEFT)
  var SEAM_STRAIGHTEN_AT = 0.75;  // seam goes fully level by this fraction of the (eased) reveal, then stays straight
  var BG_DUR = 1.05;              // bg + card reveal wipe — a bit slower overall; the END is the slow part
  var TEXT_DUR = 0.60;            // text wipe — SHORTER than the bg so the text settles faster (own ease below)
  var EXIT_DUR = TEXT_DUR;        // OLD text exits on the text timing
  var ENTER_AT_BG = 0.45;         // NEW text starts at this fraction of the bg's time (a touch earlier = more visible)
  var ENTER_DELAY = BG_DUR * ENTER_AT_BG; // → when the new text starts rising in
  var ENTER_DUR = TEXT_DUR;       // NEW text enters on the text timing
  var TEXT_TILT = 9;              // text line tilt at the START of its wipe, degrees (left higher) — straightens to 0
  if (window.CustomEase) gsap.registerPlugin(CustomEase);
  // BG/CARD ease: snappy ease-in to a fast peak at ~75% of the reveal (by ~26% of the time), then a LONG,
  // RAPIDLY-decelerating glide that nearly stops at the very end — C1-continuous, so no jump into the tail.
  // The base curve is UNCHANGED; we only TIME-STRETCH the LAST 30% OF THE REVEAL so the ending plays slower.
  var TAIL_REVEAL = 0.70;        // progress past which counts as "the last 30%" of the reveal...
  var TAIL_SLOW = 1.7;           // ...and that part plays this much slower (1.7×); the first 70% keeps its speed
  var EASE, BG_DUR_FULL = BG_DUR;
  if (window.CustomEase) {
    var BASE_EASE = CustomEase.create("exo", "M0,0 C0.04,0 0.19,0.54 0.26,0.75 C0.3,0.87 0.62,0.995 1,1");
    // original (normalized) TIME at which the reveal reaches TAIL_REVEAL — binary-searched so this stays
    // correct if the base curve above is retuned later.
    var tAt = 0.5, st = 0.25;
    for (var bi = 0; bi < 30; bi++) { tAt += BASE_EASE(tAt) < TAIL_REVEAL ? st : -st; st /= 2; }
    var K = tAt + TAIL_SLOW * (1 - tAt);     // stretched / original duration ratio
    var splitNew = tAt / K;                   // where the slow tail begins on the NEW (stretched) timeline
    BG_DUR_FULL = BG_DUR * K;                  // actual bg-tween duration after the stretch
    EASE = function (t) {                      // re-time the SAME curve: the tail beyond splitNew runs 1.5× longer
      var tb = t <= splitNew ? t * K : tAt + (t - splitNew) * K / TAIL_SLOW;
      return BASE_EASE(tb);
    };
  } else {
    EASE = "power4.out";          // fallback if plugin missing
  }
  // TEXT ease: a clean ease-OUT so the title/counter pop in and SETTLE quickly (no long creep like the bg).
  var TEXT_EASE = "power3.out";

  // Slanted reveal seam that STRAIGHTENS as it sweeps: starts tilted (SEAM_SKEW, higher-left) and goes
  // level by SEAM_STRAIGHTEN_AT of the (eased) reveal progress p, then stays straight through the tail.
  // mode "BU" = bottom→up reveal (seam = polygon TOP edge, bottom pinned 100%);
  // mode "TD" = top→down reveal (seam = polygon BOTTOM edge, top pinned 0%).
  var S = SEAM_SKEW;
  function seamClip(p, mode) {
    var bu = mode === "BU";
    var c = bu ? 100 + S / 2 : -S / 2;                   // seam-center %, hidden (p=0)
    c += ((bu ? -S : 100 + S) - c) * p;                  // lerp toward the fully-revealed center as p→1
    var tilt = S * Math.max(0, (SEAM_STRAIGHTEN_AT - p) / SEAM_STRAIGHTEN_AT);
    var yL = c - tilt / 2, yR = c + tilt / 2;            // left higher = smaller %
    return bu
      ? "polygon(0% " + yL + "%, 100% " + yR + "%, 100% 100%, 0% 100%)"
      : "polygon(0% 0%, 100% 0%, 100% " + yR + "%, 0% " + yL + "%)";
  }

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
    var bgMode = next ? "BU" : "TD", cardMode = next ? "TD" : "BU";
    var seam = { p: 0 };   // shared reveal-progress proxy (eased) driving both clip-paths
    gsap.set(pt.bg,   { clipPath: seamClip(0, bgMode) });
    gsap.set(pt.card, { clipPath: seamClip(0, cardMode) });
    // Incoming text pre-hidden under its masks; stays invisible through the gap until ENTER_DELAY.
    gsap.set([pt.tline, pt.cnum], { yPercent: sy * 100, opacity: 0, rotation: TEXT_TILT });

    gsap.timeline({
      defaults: { ease: EASE },   // bg/card use EASE; the text tweens override with TEXT_EASE
      onComplete: function () {
        from.classList.remove("is-shown", "is-current");
        from.style.zIndex = "";
        to.classList.add("is-current");
        to.style.zIndex = "";
        reset(from);
        reset(to);
        index = target;
        animating = false;
        if (queued) { var d = queued; queued = 0; step(d); }   // run a gesture queued mid-wipe
      }
    })
      // 1) Background + card reveal seam — sweeps on the shared ease while STRAIGHTENING (see seamClip).
      //    Driven through a progress proxy so the tilt fades out independently of how far the seam travels.
      .to(seam, {
        p: 1, duration: BG_DUR_FULL,
        onUpdate: function () {
          pt.bg.style.clipPath   = seamClip(seam.p, bgMode);
          pt.card.style.clipPath = seamClip(seam.p, cardMode);
        }
      }, 0)
      // 2) OLD text rises OUT of its masks — title + counter together — tilting (left-higher) as it leaves.
      .to(pf.tline, { yPercent: sy * -100, opacity: 0, rotation: TEXT_TILT, duration: EXIT_DUR, ease: TEXT_EASE }, 0)
      .to(pf.cnum,  { yPercent: sy * -100, opacity: 0, rotation: TEXT_TILT, duration: EXIT_DUR, ease: TEXT_EASE }, 0)
      // 3) NEW text rises IN as the bg sweeps — title + counter together, tilted→straight (matches the seam),
      //    on its own faster ease-out so it settles well before the bg finishes its slow tail.
      .to(pt.tline, { yPercent: 0, opacity: 1, rotation: 0, duration: ENTER_DUR, ease: TEXT_EASE }, ENTER_DELAY)
      .to(pt.cnum,  { yPercent: 0, opacity: 1, rotation: 0, duration: ENTER_DUR, ease: TEXT_EASE }, ENTER_DELAY);
  }

  function step(dir) {
    var n = sections.length;
    go((index + dir + n) % n, dir); // wrap: 04 → 01 (down) and 01 → 04 (up)
  }

  // One-slot queue: a gesture made DURING a transition is remembered (latest wins) and fired the
  // instant the wipe finishes (see go's onComplete), so a quick double-flick advances two.
  var queued = 0;
  function request(dir) {
    if (animating) { queued = dir; return; }
    step(dir);
  }

  // --- Wheel (mouse + trackpad): one gesture = one step, queued during a transition ---
  // Re-arm as soon as the gesture EASES, not after it fully stops: the velocity-ease path
  // (|deltaY| ≤ RELEASE) re-arms a trackpad the moment its inertia weakens (the old code waited for
  // a full stop, which the long inertia tail never reached → scrolls felt eaten), while the 80ms
  // idle re-arms a mouse wheel between its discrete (tail-less) notches. Hysteresis between RELEASE
  // and TRIGGER stops flapping; a decaying inertia tail can't climb back over TRIGGER once it dips
  // below RELEASE, so one flick = one step and only a fresh flick passes the gate (and gets queued).
  var armed = true, idle = null;
  var TRIGGER = 8;   // min |deltaY| to count as an intentional gesture
  var RELEASE = 4;   // |deltaY| at/below this = the gesture's inertia has eased → re-arm
  window.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (idle) clearTimeout(idle);
    idle = setTimeout(function () { armed = true; }, 80);    // re-arm after a brief silence (mouse wheel)
    var v = Math.abs(e.deltaY);
    if (v <= RELEASE) { armed = true; return; }              // inertia eased (trackpad) → re-arm now
    if (!armed || v < TRIGGER) return;                        // mid-gesture / too weak → ignore
    armed = false;                                            // consume; this gesture's tail won't re-fire
    request(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // --- Touch swipe ---
  var startY = null;
  window.addEventListener("touchstart", function (e) { startY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
  window.addEventListener("touchend", function (e) {
    if (startY === null) return;
    var dy = startY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) request(dy > 0 ? 1 : -1);   // queues if a wipe is in flight
    startY = null;
  }, { passive: true });

  // --- Keyboard ---
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault(); request(1);    // queues if a wipe is in flight
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault(); request(-1);
    }
  });
})();

/* ---------- V2 scroll-scrubbed per-character title/counter "roll" ----------
   Free continuous scroll (Lenis smoothing; no snap, no jacking). The title (left) and
   counter number (right) live in a FIXED overlay where all four projects overlap. On
   each project change a scroll-SCRUBBED ScrollTrigger timeline rolls the OLD project's
   chars DOWN out of a clip mask (yPercent 0 → +DIST, clipped at the bottom edge) and the
   NEW project's chars UP into it (yPercent +DIST → 0), the incoming starting a GAP beat
   after the outgoing, staggered into a wave. The playhead follows scroll: stop mid-scroll
   → frozen half-rolled; scroll up → it runs in reverse (no direction special-casing).
   CLIP is the whole effect — opacity is never touched.
   prefers-reduced-motion → no scrub; hard-swap the text at each section's midpoint. */
(function () {
  "use strict";
  if (!document.body.classList.contains("v2") || !window.gsap) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll(".hero--v2"));
  if (sections.length < 2) return;

  /* ---- Tunable constants (durations are PROPORTIONS only — the timeline is scrubbed) ---- */
  var CHAR_DUR = 0.55;            // relative duration per char within the timeline
  var STAGGER  = 0.05;            // relative delay per char — controls the wave spread
  var GAP      = 0.35;            // incoming starts GAP*CHAR_DUR after outgoing (the empty beat)
  var DIST     = 100;            // yPercent travel (one char height): park/sink target
  var STAGGER_FROM = "start";    // base stagger order (auto-reverses on scroll-up)
  var ROLL_AT = 0.4;             // how far the incoming photo is into view (0..1) before the text starts
                                 // rolling — it then finishes as that photo fills. 0 = changes immediately
                                 // (too soon); higher = the text waits longer into each photo swap.
  var SCRUB = true;              // scrubbed playhead (set a number to add smoothing lag)

  gsap.registerPlugin(ScrollTrigger);
  if (window.CustomEase) gsap.registerPlugin(CustomEase);
  // ONE shared easing for every char (both directions).
  var EASE = window.CustomEase
    ? CustomEase.create("v2roll", "M0,0 C0.625,0.05 0,1 1,1")   // cubic-bezier(.625,.05,0,1)
    : "power2.inOut";

  // Idempotent per-character splitter: wrap each code point of `str` in <span class="v2-ch">
  // and append to `host`. Spaces become their own slot (nbsp keeps the word spacing).
  function splitChars(host, str) {
    var spans = [];
    Array.from(str).forEach(function (ch) {
      var span = document.createElement("span");
      span.className = ch === " " ? "v2-ch v2-sp" : "v2-ch";
      span.textContent = ch === " " ? " " : ch;
      host.appendChild(span);
      spans.push(span);
    });
    return spans;
  }

  // Per project: split the whole title into chars, and split ONLY the counter number
  // (e.g. "01"); the " / 04" total stays static (.cnt-rest), like V1. Idempotent: the
  // original text is stashed on first run and the spans are always rebuilt from it.
  var projects = sections.map(function (s) {
    var t = s.querySelector(".hero__title");
    var c = s.querySelector(".hero__counter");
    if (t.dataset.text == null) t.dataset.text = t.textContent.trim();
    if (c.dataset.text == null) c.dataset.text = c.textContent.trim();

    t.innerHTML = "";
    var titleChars = splitChars(t, t.dataset.text);

    var m = c.dataset.text.match(/^(\S+)([\s\S]*)$/);   // "01"  +  " / 04"
    c.innerHTML = "";
    var numMask = document.createElement("span");
    numMask.className = "v2-num";
    c.appendChild(numMask);
    var numChars = splitChars(numMask, m[1]);
    if (m[2]) {
      var rest = document.createElement("span");
      rest.className = "cnt-rest";
      rest.textContent = m[2];
      c.appendChild(rest);
    }
    return { titleChars: titleChars, numChars: numChars };
  });

  function chars(i) { return projects[i].titleChars.concat(projects[i].numChars); }

  // Initial state: project 0 in place (0); the rest parked below their masks (+DIST).
  gsap.set(chars(0), { yPercent: 0 });
  for (var k = 1; k < projects.length; k++) gsap.set(chars(k), { yPercent: DIST });

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce) {
    // No scrub, no roll: hard-swap to the active project as each section crosses centre.
    sections.forEach(function (s, i) {
      ScrollTrigger.create({
        trigger: s, start: "top center", end: "bottom center",
        onToggle: function (self) {
          if (!self.isActive) return;
          projects.forEach(function (p, j) { gsap.set(chars(j), { yPercent: j === i ? 0 : DIST }); });
        }
      });
    });
    return;
  }

  // ---- Seamless WRAP-AROUND loop (01 ⇄ 04 both ways) ----
  // The page is a finite scroll, so to loop we add a PHOTO buffer at each end (photos only — the
  // title overlay stays the original four). The strip becomes [P2' P3' P0 P1 P2 P3 P0' P1'] and the
  // title rolls 2→3→0→1→2→3→0→1 across it. We start on the real P0 and, near each clone end,
  // teleport the scroll by the real 4-photo height — landing on the identical real photo two photos
  // in (an interior rest, not a scroll edge), so it loops forever with no visible seam (see the
  // TWO-photo-buffer rationale below).
  var N = projects.length;
  var main = sections[0].parentNode;
  // TWO-photo buffer each end so BOTH wrap teleports land on an INTERIOR real-P0 rest with a full
  // viewport of runway to either scroll edge. (Lenis clamps [0,max] and kills momentum at the very
  // edge; a single-photo buffer forced the down-wrap's only seamless landing onto that edge, so the
  // code had to teleport mid-roll instead — the cause of the half-rolled text + low-speed "bump".)
  // Strip = [P2' P3' P0 P1 P2 P3 P0' P1']: head buffer [P2,P3] (the two photos preceding P0 in the
  // loop), tail buffer [P0,P1] (the two following P3). Inserted in document order so SEQ stays chronological.
  var headClones = [sections[N - 2].cloneNode(true),   // P2' — outer top buffer
                    sections[N - 1].cloneNode(true)];  // P3' — inner top buffer (just above P0)
  var tailClones = [sections[0].cloneNode(true),       // P0' — inner bottom buffer (just below P3)
                    sections[1].cloneNode(true)];      // P1' — outer bottom buffer
  headClones.concat(tailClones).forEach(function (c) {
    var tr = c.querySelector(".hero__titlerow"); if (tr) tr.remove();   // buffers are photo-only
  });
  headClones.forEach(function (c) { main.insertBefore(c, sections[0]); });   // [P2', P3'] before P0
  tailClones.forEach(function (c) { main.appendChild(c); });                 // [P0', P1'] after P3

  // ---- Per-photo darken as the NEXT card covers it (sticky stacking, see version2.css) ----
  // One scrubbed trigger per section (clones included, so it is seamless across the wrap). Each
  // section is one viewport tall and stacked from the document top, so section #idx is covered by
  // the next one over the scroll window [idx*vh, (idx+1)*vh] — drive the darken off those NUMERIC
  // scroll positions rather than "top top"/"bottom top": a sticky trigger reports top:0 once stuck,
  // which would mis-measure already-pinned sections. Over that window the COVERED photo fades
  // 0.25 → 0.55 while the incoming stays bright (its own window hasn't started). Local + periodic,
  // so it survives the wrap teleport unchanged. (Functions re-evaluate on ScrollTrigger.refresh.)
  Array.prototype.slice.call(main.querySelectorAll(".hero--v2")).forEach(function (sec, idx) {
    var scrim = sec.querySelector(".hero__scrim");
    if (!scrim) return;
    gsap.to(scrim, {
      opacity: 0.55, ease: "none",
      scrollTrigger: {
        start: function () { return idx * vh(); },
        end:   function () { return (idx + 1) * vh(); },
        scrub: true
      }
    });
  });

  function vh() { return window.innerHeight; }       // one section / viewport height

  // Project shown at each of the 8 photos (two-photo buffers): [P2 P3 | P0 P1 P2 P3 | P0 P1] →
  // the roll sequence 2→3→0→1→2→3→0→1. Chronological so the single scrubbed timeline captures
  // every transition's start value in order.
  var SEQ = [N - 2, N - 1]; for (var s = 0; s < N; s++) SEQ.push(s); SEQ.push(0); SEQ.push(1);
  // Baseline = the FIRST photo's project (P2) shown, the rest parked, so the scrubbed timeline
  // captures every transition's start value correctly (it's chronological in one timeline).
  projects.forEach(function (p, j) { gsap.set(chars(j), { yPercent: j === SEQ[0] ? 0 : DIST }); });

  function roll(to) {
    return { yPercent: to, duration: CHAR_DUR, stagger: { each: STAGGER, from: STAGGER_FROM } };
  }
  // Size each slice so the roll STARTS when the incoming photo is ROLL_AT into view and ENDS as it
  // fills — the text rolls during the BACK of each photo swap, not the instant it peeks in.
  var maxLen = projects.reduce(function (m, p) { return Math.max(m, p.titleChars.length); }, 1);
  var rollDur = GAP * CHAR_DUR + CHAR_DUR + (maxLen - 1) * STAGGER;
  var SLICE = rollDur / (1 - ROLL_AT);
  var tl = gsap.timeline({
    // force3D:false — a SCRUBBED timeline keeps its targets perpetually "animating", so GSAP's
    // default force3D:"auto" leaves a translate3d (GPU layer) on the chars even at rest, which
    // anti-aliases the rolling number lighter than the static " / 04". 2D transforms render crisp
    // and match. (CSS will-change was also dropped from .v2-ch; the layer came from GSAP itself.)
    defaults: { ease: EASE, force3D: false },
    scrollTrigger: { start: 0, end: "max", scrub: SCRUB }
  });
  for (var i = 0; i < SEQ.length - 1; i++) {
    var oldP = projects[SEQ[i]], newP = projects[SEQ[i + 1]];
    var at = (i + ROLL_AT) * SLICE;                                 // hold, THEN roll, within each slice
    tl.to(oldP.titleChars, roll(DIST), at)                         // old title sinks DOWN, clipped away
      .to(oldP.numChars,   roll(DIST), at)                         // old number with it
      .to(newP.titleChars, roll(0), at + GAP * CHAR_DUR)           // new title rises UP after the beat
      .to(newP.numChars,   roll(0), at + GAP * CHAR_DUR);
  }
  tl.set({}, {}, (SEQ.length - 1) * SLICE);                        // pad the final hold to equal scroll

  // Start on the real P0 (TWO photos past the top buffer = y 2*vh); don't let the browser restore a
  // stale position — a restored y would desync the loop.
  if (window.history && history.scrollRestoration) history.scrollRestoration = "manual";
  window.scrollTo(0, 2 * vh());

  // ---- Lenis smoothing + the wrap teleport ----
  if (window.Lenis) {
    var lenis = new Lenis();
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    // Momentum-preserving wrap. The loop is seamless for any y in the buffer (state at y === state
    // at y±N*vh), and with two-photo buffers we trigger one full photo IN from each edge, so a full
    // viewport of runway stays on BOTH sides of every teleport — Lenis clamps scroll to [0,max], so
    // triggering at the very edge would kill the inertial momentum against the wall before the jump.
    // We DON'T use lenis.scrollTo({immediate:true}) — that calls reset() and zeroes velocity, which
    // is the "slowdown" felt at every seam. Instead we offset animatedScroll AND targetScroll by the
    // same delta: the lerp gap is untouched, so next frame's velocity (animatedScroll − prev) is
    // unchanged and momentum carries straight through. setScroll() applies it to window.scrollY at
    // once (same call Lenis's own immediate path uses).
    function wrapBy(d) {
      lenis.animatedScroll += d;
      lenis.targetScroll  += d;
      lenis.setScroll(lenis.scroll);
      ScrollTrigger.update();
    }
    var loopReady = false;
    // With TWO-photo buffers the seamless teleport pairs are the two INTERIOR real-P0 rests:
    //   up-wrap   from y≈1*vh (one photo into the top buffer)     → land y≈5*vh  (+N*vh, clean P3/04 rest)
    //   down-wrap from y≈max−1*vh (one photo into the bottom buf) → land y≈2*vh  (−N*vh, clean P0/01 rest)
    // Each landing sits at a slice boundary (text fully at rest, never frozen mid-roll) with a full
    // viewport of runway to the nearest edge, so momentum carries through like an interior swap. The
    // landings (5*vh / 2*vh) are a full vh from the OPPOSITE trigger (max−1*vh / 1*vh), so the old
    // "land exactly on the other threshold → low-speed jitter ping-pong" can't happen. `armed` is
    // belt-and-suspenders: after a teleport, suppress BOTH wraps until y returns to the safe interior
    // band, so sub-pixel lerp noise at the seam still can't re-trip.
    var armed = true;
    lenis.on("scroll", function () {
      ScrollTrigger.update();
      if (!loopReady) return;
      var y = window.scrollY || window.pageYOffset || 0;
      var max = ScrollTrigger.maxScroll(window);
      var one = vh();
      if (!armed) {                                              // re-arm only well inside the loop
        if (y >= 1.5 * one && y <= max - 1.5 * one) armed = true;
        return;
      }
      if (lenis.direction < 0 && y <= one)            { wrapBy(+N * one); armed = false; }   // up past P0 → P3 (04)
      else if (lenis.direction > 0 && y >= max - one) { wrapBy(-N * one); armed = false; }   // down past P3 → P0 (01)
    });
    lenis.scrollTo(2 * vh(), { immediate: true });   // real P0 sits two photos in now
    requestAnimationFrame(function () { requestAnimationFrame(function () { loopReady = true; }); });
  }

  ScrollTrigger.refresh();
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
