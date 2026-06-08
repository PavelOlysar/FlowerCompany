/* ==========================================================================
   Flower Company — preload.js
   One-time intro / preload animation, IDENTICAL for V1 and V2. Plays once per
   session over a fixed full-screen overlay, driven by real asset-load progress,
   then hands off seamlessly into the live hero (the overlay's final frame equals
   the real hero, so there's no jump). After it finishes, normal V1/V2 scrolling
   takes over.

   Beats (from the Figma "Storyboard", node 64:1963):
     1 LOGO IN      — logo mark fades/scales in, centred on white.
     2 COUNT        — the logo holds, static, while a 0→100 counter (real load
                      progress, min-duration floored) climbs to 100.
     3 STACK        — leaf clears; a concentric 3:2 card deck spawns into centre.
     4 ONE FILLS    — the front card grows to full-bleed (= the hero photo).
     5 REVEAL       — on the REAL hero: brand fades in, the headline rises under a
                      clip mask (V1 mechanic, both variants), then nav + bottombar
                      (+ a .fc-cookie hook) fade in last.

   Coordination with main.js via window.FC_INTRO (defined synchronously here,
   BEFORE main.js parses):
     • active            — gates V1's request() so gestures don't fire mid-intro.
     • willRun           — false on reduced-motion / already-seen / no-gsap.
     • whenReveal (Promise) — resolves once the overlay is full-bleed; V2 uses it to
                              position the hero at the MOL photo (scrollTo + refresh),
                              scroll still locked.
     • whenDone   (Promise) — resolves at teardown; V2 uses it to start Lenis.
     • lockScroll/unlockScroll — block scroll gestures during the intro.

   COOKIE BANNER: none exists in the repo/storyboard. Step 5 reveals the nav +
   bottombar as the chrome. A `.fc-cookie` element (if added later, hidden by the
   same fc-intro-armed guard) will auto-participate in the final fade.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- constants */
  // Timeline (seconds). Beat 2 is governed by COUNT_MIN; the rest are fixed.
  var LOGO_IN        = 0.4;     // leaf mark fade/scale in
  var COUNT_MIN      = 0.9;     // MIN time for 0→100 (was 2.2 → 1.3 → 0.9; leaf finishes open at 100)
  var LEAF_CLEAR     = 0.25;    // leaf + counter clear at 100
  var STACK          = 0.95;    // total card-spawn window (shortened)
  var STACK_STAGGER  = 0.075;   // per-card delay
  var CARD_COUNT     = 4;       // deck cards (Figma beat 4 = 4); CARD_SCALES must match
  var FILL           = 0.6;     // front card → full-bleed
  var REVEAL         = 1.8;     // brand + masked headline + chrome (sub-tweens below)
  var REVEAL_STAGGER = 0.08;    // per line (V1) / per char (V2) headline stagger

  var EASE_PATH = "M0,0 C0.625,0.05 0,1 1,1";   // shared EASE — cubic-bezier(.625,.05,0,1)

  // Loading / counter
  var HERO_IMG     = "assets/img/mol.png";   // state-1 hero — the only blocking preload
  var W_IMG        = 0.7;       // progress weight: hero image
  var W_FONT       = 0.3;       // progress weight: fonts.ready
  var COUNT_EASE_K = 0.16;      // per-frame easing of the displayed number toward target (was 0.12 — snappier)
  var LOAD_TIMEOUT = 8000;      // ms watchdog so the counter can never hang

  // Gating
  var SHOW_ONCE = true;                 // Plays on every reload + first visit; skipped only when navigating between version pages.
  var NAV_KEY   = "FC_INTRO_NAV";       // sessionStorage flag set on a version-switch click; consumed (→ skip) by the next page

  // Look
  var PL_BG       = "#ffffff";  // Figma-exact white (storyboard frames are bg-white). Set a cream here if desired.
  var LEAF_COLOR  = "#111111";  // black-on-white, as the Figma exclusion blend reads
  var CARD_RATIO  = 3 / 2;      // 3:2 landscape (matches the hero photo + storyboard)
  var CARD_SCALES = [1, 1.77, 2.51, 2.90];   // front→back, from Figma widths 248/439/623/719
  var CARD_RADIUS = 4;          // deck card corner radius (animates to 0 on fill)

  // Exact leaf geometry from Figma (node 64:1822 closed, 64:1833 open). currentColor fill.
  var LEAF_CLOSED = { vb: "0 0 52.9276 74.3467", w: 52.9276, h: 74.3467,
    d: "M26.0933 0C40.5774 6.79971 50.1355 19.5657 52.1363 35.334C54.2464 50.3437 51.9321 64.1908 47.6138 73.7031C47.4589 72.9198 47.2939 72.1097 47.1197 71.2754C47.1119 71.8255 47.0914 72.3644 47.0572 72.8906C45.5904 69.7071 43.6862 66.0048 41.3902 61.9932C42.1978 64.3466 43.0347 66.5673 43.9605 68.6172C44.5748 69.9852 44.9994 70.9614 45.4185 72.0283C45.7372 72.5144 46.0491 72.9876 46.3511 73.4482C46.1743 73.3282 45.9967 73.2055 45.8179 73.082C45.9616 73.4711 46.1124 73.8863 46.274 74.3467C43.7582 72.3849 41.2205 70.1542 38.729 67.6826C32.0203 62.1405 24.5985 54.8759 17.4927 46.5869C6.05192 34.8259 -0.42831 23.4403 0.0220133 15.1318C5.58906 17.0265 11.0653 19.5761 16.2066 22.6699C16.5674 14.2543 19.9543 6.4546 26.0933 0ZM32.4546 23.3877C32.5745 27.2137 33.2665 32.1576 34.4703 37.7891C35.5457 39.0252 36.5685 40.2933 37.5318 41.5918C39.1291 44.1233 40.5056 46.6391 41.6783 49.1104C38.8013 38.5212 35.4996 29.3081 32.4546 23.3877Z" };
  var LEAF_OPEN = { vb: "0 0 56.345 87.8564", w: 56.345, h: 87.8564,
    d: "M34.4419 0C48.063 8.39556 56.1139 22.1615 56.3169 38.0547C56.7144 53.2067 52.8473 66.7027 47.48 75.665C46.9679 69.4141 46.0415 61.4721 44.6998 52.7979C43.0135 41.0284 40.6297 30.61 38.1138 23.958C37.5578 30.7147 38.3877 41.1588 40.5415 52.876V52.8672C41.7862 59.2575 42.8108 65.1688 44.4263 70.1992C44.8892 71.6512 45.2036 72.6789 45.5035 73.8076C45.7076 74.5677 45.8901 75.3189 46.0542 76.0596C46.0614 76.0907 46.0695 76.1218 46.0767 76.1533C46.0757 76.1524 46.0748 76.1514 46.0738 76.1504C46.9709 80.2353 47.2701 84.0078 47.0562 87.2988C44.7344 82.2597 41.3184 75.921 36.9839 69.1123C30.4779 60.0715 23.5125 52.2507 18.1187 47.4033C21.6409 52.6952 27.6438 60.7773 34.4234 69.792C39.0492 76.7143 43.1722 83.0091 46.3501 87.8564C37.9902 82.1809 27.4317 72.5902 17.4917 60.9951C6.05102 49.2342 -0.428305 37.8484 0.022016 29.54C8.82088 32.5347 17.3937 37.1621 24.772 42.998C24.2923 41.6898 23.841 40.3642 23.4244 39.0225C18.8606 23.5825 23.0806 9.51152 34.4419 0Z" };

  /* ----------------------------------------------------------------- environment */
  var body    = document.body;
  var isV1     = body.classList.contains("v1");
  var isV2     = body.classList.contains("v2");
  var isV3     = body.classList.contains("v3");
  var reduced  = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var skip     = SHOW_ONCE && (function () { try { return sessionStorage.getItem(NAV_KEY) === "1"; } catch (e) { return false; } })();
  try { sessionStorage.removeItem(NAV_KEY); } catch (e) {}   // consume it: a later RELOAD has no flag → plays
  var willRun  = !!window.gsap && !reduced && !skip && (isV1 || isV2 || isV3);

  // Skip the intro when moving BETWEEN version pages (a left-click on a version switcher);
  // reload / first visit / typed URL leave no flag, so the intro still plays there. Attached
  // unconditionally (scripts load at end of <body>, so a.nav__version is in the DOM).
  Array.prototype.forEach.call(document.querySelectorAll("a.nav__version"), function (a) {
    a.addEventListener("click", function (e) {
      if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        try { sessionStorage.setItem(NAV_KEY, "1"); } catch (err) {}
      }
    });
  });

  /* ------------------------------------------------------------------- contract */
  var resolveReveal, resolveDone;
  var whenReveal = new Promise(function (r) { resolveReveal = r; });
  var whenDone   = new Promise(function (r) { resolveDone = r; });

  var SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1, " ": 1, Spacebar: 1 };
  function blockMove(e) { e.preventDefault(); }
  function blockKeys(e) { if (SCROLL_KEYS[e.key]) e.preventDefault(); }
  var locked = false;
  function lockScroll() {
    if (locked) return; locked = true;
    // Block gestures (not overflow:hidden) so programmatic scrollTo still works for V2's hero positioning.
    window.addEventListener("wheel",     blockMove, { passive: false, capture: true });
    window.addEventListener("touchmove", blockMove, { passive: false, capture: true });
    window.addEventListener("keydown",   blockKeys, { capture: true });
  }
  function unlockScroll() {
    if (!locked) return; locked = false;
    window.removeEventListener("wheel",     blockMove, { capture: true });
    window.removeEventListener("touchmove", blockMove, { capture: true });
    window.removeEventListener("keydown",   blockKeys, { capture: true });
  }

  window.FC_INTRO = {
    active: willRun, reduced: reduced, willRun: willRun,
    whenReveal: whenReveal, whenDone: whenDone,
    lockScroll: lockScroll, unlockScroll: unlockScroll
  };

  /* --------------------------------------------------- skip / reduced / no-gsap */
  if (!willRun) {
    body.classList.remove("fc-intro-armed");   // un-hide the chrome immediately
    resolveReveal();
    resolveDone();
    return;
  }

  /* ------------------------------------------------------------------- run it */
  lockScroll();
  if (window.CustomEase) gsap.registerPlugin(CustomEase);
  var EASE = window.CustomEase ? CustomEase.create("plroll", EASE_PATH) : "power2.inOut";

  // ----- build the overlay -----
  function leafSvg(L) {
    return '<svg viewBox="' + L.vb + '" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
           '<path fill="currentColor" d="' + L.d + '"/></svg>';
  }
  var overlay = document.createElement("div");
  overlay.id = "preload";
  overlay.style.background = PL_BG;

  var stage = document.createElement("div");
  stage.className = "pl-stage";

  // Deck (built back-to-front in DOM so the front card sits on top via z-index).
  // Only V1 darkens its photos, so only V1 deck cards carry a scrim (matches the live
  // V1 hero). V2/V3 photos are full-brightness, so their deck cards stay bright too.
  var SCRIM_OP = 0.40;                            // V1 only: rgba(2,2,8,.4)
  var deck = document.createElement("div");
  deck.className = "pl-deck";
  var frontW = Math.max(170, Math.min(window.innerWidth * 0.172, 260));   // 248/1440 ≈ 17.2%
  var cards = [];
  for (var i = 0; i < CARD_COUNT; i++) {
    var card = document.createElement("div");
    card.className = "pl-card";
    var w = frontW * (CARD_SCALES[i] || 1);
    card.style.width = w + "px";
    card.style.height = (w / CARD_RATIO) + "px";
    card.style.zIndex = String(CARD_COUNT - i);    // front (i=0) highest
    var img = document.createElement("img");
    img.src = HERO_IMG; img.alt = "";
    card.appendChild(img);
    // Per-card scrim, present from spawn — V1 only (its live hero is darkened). V2/V3
    // cards stay full-brightness, matching their bright live heroes, so the fill→hero
    // handoff stays seamless.
    if (isV1) {
      var cardScrim = document.createElement("div");
      cardScrim.style.cssText = "position:absolute;inset:0;background:#020208;opacity:" + SCRIM_OP + ";pointer-events:none;";
      card.appendChild(cardScrim);
    }
    deck.appendChild(card);
    cards.push(card);
  }

  // Logo mark — a single static leaf mark (no open animation; it just holds while the count runs).
  var leaf = document.createElement("div");
  leaf.className = "pl-leaf";
  leaf.style.color = LEAF_COLOR;
  leaf.innerHTML = '<div class="pl-leaf-svg">' + leafSvg(LEAF_OPEN) + "</div>";
  var leafLayer = leaf.querySelector(".pl-leaf-svg");
  // Size the mark to read ~10vh tall (native aspect preserved).
  var markH = Math.max(72, Math.min(window.innerHeight * 0.10, 104));
  var K     = markH / LEAF_OPEN.h;
  leafLayer.style.width = (LEAF_OPEN.w * K) + "px";
  leafLayer.style.height = (LEAF_OPEN.h * K) + "px";

  // Counter (thin, split to the edges, % sign).
  var counter = document.createElement("div");
  counter.className = "pl-counter";
  counter.innerHTML = '<span class="pl-count-num">0</span><span class="pl-count-pct">%</span>';
  var numEl = counter.querySelector(".pl-count-num");

  stage.appendChild(deck);
  stage.appendChild(leaf);
  stage.appendChild(counter);
  overlay.appendChild(stage);
  body.appendChild(overlay);

  // ----- initial states -----
  gsap.set(leaf, { scale: 0.6, opacity: 0, transformOrigin: "50% 50%" });
  gsap.set(counter, { opacity: 0 });
  gsap.set(cards, { scale: 0, opacity: 0 });

  /* ------------------------------------------------- beat 1 + the count loop */
  gsap.timeline({ onComplete: startCount })
    .to(leaf,    { scale: 1, opacity: 1, duration: LOGO_IN, ease: EASE }, 0)
    .to(counter, { opacity: 1, duration: LOGO_IN, ease: "none" }, 0);

  // Real load progress: hero image (onload OR onerror) + fonts.ready, each weighted.
  var imgDone = false, fontDone = false;
  var pre = new Image();
  pre.onload = pre.onerror = function () { imgDone = true; };
  pre.src = HERO_IMG;
  if (pre.complete) imgDone = true;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontDone = true; });
  else fontDone = true;

  function startCount() {
    var startT = null, displayed = 0, deadline = (window.performance ? performance.now() : Date.now()) + LOAD_TIMEOUT;
    function tick(now) {
      if (startT === null) startT = now;
      var elapsed = (now - startT) / 1000;
      var realP = (imgDone ? W_IMG : 0) + (fontDone ? W_FONT : 0);
      if (now > deadline) realP = 1;                              // watchdog: never hang
      var timeCap = Math.min(1, elapsed / COUNT_MIN);             // never finish before COUNT_MIN
      var target = Math.min(realP, timeCap) * 100;
      displayed += (target - displayed) * COUNT_EASE_K;
      if (target >= 100 && displayed > 99.4) displayed = 100;     // snap the asymptote
      numEl.textContent = Math.round(displayed);
      if (displayed >= 100) { numEl.textContent = "100"; playStackFill(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* --------------------------------------------------- beats 3 + 4 (stack, fill) */
  function playStackFill() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var cardDur = Math.max(0.3, STACK - (CARD_COUNT - 1) * STACK_STAGGER);
    gsap.timeline({ onComplete: revealHero })
      // leaf + counter clear at 100
      .to(leaf,    { scale: 1.15, opacity: 0, duration: LEAF_CLEAR, ease: EASE }, 0)
      .to(counter, { opacity: 0, duration: LEAF_CLEAR, ease: "none" }, 0)
      // cards spawn front-first into the concentric deck
      .to(cards,   { scale: 1, opacity: 1, duration: cardDur, stagger: STACK_STAGGER, ease: EASE }, LEAF_CLEAR * 0.5)
      // front card grows to full-bleed (= the hero photo box); its own scrim rides along
      .to(cards[0], { width: vw, height: vh, borderRadius: 0, duration: FILL, ease: EASE }, ">-0.05");
  }

  /* ------------------------------------------------------------- beat 5 (reveal) */
  function revealHero() {
    // Position the real hero at the MOL photo (V2: scrollTo vh + refresh) — scroll stays locked.
    resolveReveal();
    // Lock the front card to full viewport (resize-proof) for the brief gap before removal.
    gsap.set(cards[0], { width: "100vw", height: "100vh" });

    // After the microtask (main.js position()) has applied, swap to the real hero and reveal.
    requestAnimationFrame(function () {
      var titleEls, sec;
      if (isV1) {
        sec = document.querySelector(".hero--v1");                       // section 1 (current)
        titleEls = toArr(sec.querySelectorAll(".ln-in"))
                     .concat(toArr(sec.querySelectorAll(".num-in")))
                     .concat(toArr(sec.querySelectorAll(".cnt-rest-in")));   // " / 04" pops in too
      } else {
        sec = document.querySelector('.hero--v2[data-state="1"]');       // MOL section (keeps its titlerow)
        titleEls = toArr(sec.querySelectorAll(".hero__title .v2-ch"))
                     .concat(toArr(sec.querySelectorAll(".hero__counter .v2-ch")));   // whole counter ("01" + " / 04")
        // Every V2 section has its own fixed titlerow, so 4 identical " / 04" totals overlap.
        // Hide them ALL; only `sec`'s is in titleEls and pops back in — so one " / 04" reveals
        // instead of one popping over three static copies. (clones have no titlerow.)
        gsap.set(document.querySelectorAll(".hero--v2 .cnt-rest .v2-ch"), { yPercent: 100, force3D: false });
      }
      // Hide the headline + whole counter under their clip masks, then reveal all titlerows.
      // force3D:false everywhere here (see main.js): the default "auto" leaves a translate3d
      // GPU layer on the chars, anti-aliasing the rolled number lighter than the static " / 04".
      if (titleEls.length) gsap.set(titleEls, { yPercent: 100, force3D: false });
      gsap.set(document.querySelectorAll(".hero__titlerow"), { opacity: 1 });

      // Remove the overlay — its full-bleed photo + scrim already match the real hero, so it's invisible.
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);

      // Reveal on the REAL elements: brand → masked headline → nav/bottombar/cookie last.
      var last = [".nav__menu", ".nav__lang", ".bottombar"];
      if (isV1) last.push(".hero--v1 .hero__window");      // restore V1's peek-through card
      if (document.querySelector(".fc-cookie")) last.push(".fc-cookie");

      var rt = gsap.timeline({ onComplete: handoff });
      rt.to(".nav__logo", { opacity: 1, duration: REVEAL * 0.32, ease: "none" }, 0);
      if (titleEls.length) {
        rt.to(titleEls, { yPercent: 0, duration: REVEAL * 0.42, stagger: REVEAL_STAGGER, ease: EASE, force3D: false }, REVEAL * 0.1);
      }
      rt.to(last, { opacity: 1, duration: REVEAL * 0.36, ease: "none" }, REVEAL * 0.55);
    });
  }

  /* --------------------------------------------------------------- teardown */
  function handoff() {
    body.classList.remove("fc-intro-armed");
    // Clear the inline opacities so base.css hover transitions work again.
    gsap.set([".nav__logo", ".nav__menu", ".nav__lang", ".bottombar", ".fc-cookie",
              ".hero__titlerow", ".hero--v1 .hero__window"], { clearProps: "opacity" });
    window.FC_INTRO.active = false;
    unlockScroll();
    resolveDone();   // V2: start Lenis
  }

  function toArr(nl) { return Array.prototype.slice.call(nl); }
})();
