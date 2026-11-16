(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ================= Sound (synthesized with Web Audio, no files) ================= */
  var Sound = (function () {
    var ctx = null, master = null, on = false;
    function init() {
      if (ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination); } catch (e) { ctx = null; }
    }
    function tone(freq, dur, type, vol, when, slideTo) {
      if (!on || !ctx) return;
      var t = ctx.currentTime + (when || 0);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur, vol, freq) {
      if (!on || !ctx) return;
      var t = ctx.currentTime, len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq || 1400; f.Q.value = 0.9;
      var g = ctx.createGain(); g.gain.value = vol || 0.3;
      src.connect(f); f.connect(g); g.connect(master); src.start(t);
    }
    return {
      audio: function () { init(); return ctx; },
      peek: function () { return ctx; },
      isOn: function () { return on; },
      set: function (v) {
        init();
        on = !!(v && ctx);
        if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
      },
      hover: function () { tone(2200, 0.035, "sine", 0.035); },
      click: function () { tone(520, 0.06, "triangle", 0.14); tone(780, 0.09, "triangle", 0.1, 0.045); },
      tick: function () { tone(1480, 0.045, "square", 0.025); },
      chime: function () { tone(880, 0.16, "sine", 0.09); tone(1318.5, 0.22, "sine", 0.07, 0.08); },
      pass: function () { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.28, "sine", 0.1, i * 0.075); }); },
      squash: function () { noise(0.12, 0.35, 900); tone(340, 0.14, "sawtooth", 0.06, 0, 70); },
      win: function () {
        [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { tone(f, 0.35, "triangle", 0.08, i * 0.09); });
        tone(1568, 0.6, "sine", 0.06, 0.6);
      }
    };
  })();

  /* ================= Background music (generated live: lo-fi lab beat) ================= */
  var Music = (function () {
    var ctx = null, bus = null, on = false, timer = null, step = 0, next = 0, BPM = 78, SPB = 2;
    var CH = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]];
    function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function setup() {
      ctx = Sound.audio(); if (!ctx) return false;
      if (!bus) { bus = ctx.createGain(); bus.gain.value = 0; var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3400; bus.connect(lp); lp.connect(ctx.destination); }
      return true;
    }
    function note(f, t, o) {
      var a = o.a || 0.01, osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type || "triangle"; osc.frequency.setValueAtTime(f, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + a + o.d);
      if (o.det) osc.detune.value = o.det;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.d);
      osc.connect(g); g.connect(bus); osc.start(t); osc.stop(t + a + o.d + 0.05);
    }
    var nbuf = null;
    function hiss(t, d, v, f, type) {
      if (!nbuf) { var len = ctx.sampleRate; nbuf = ctx.createBuffer(1, len, ctx.sampleRate); var dd = nbuf.getChannelData(0); for (var i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1; }
      var s = ctx.createBufferSource(); s.buffer = nbuf;
      var fl = ctx.createBiquadFilter(); fl.type = type || "highpass"; fl.frequency.value = f;
      var g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02);
    }
    function play(i, t) {
      var s = i % 8, ch = CH[Math.floor(i / 8) % 4];
      if (s % 2) t += 0.06;
      if (s === 0) ch.forEach(function (m, k) { note(midi(m), t + k * 0.014, { v: 0.045, a: 0.02, d: 1.7, det: k % 2 ? 6 : -6 }); });
      if (s === 3) ch.slice(1).forEach(function (m, k) { note(midi(m + 12), t + k * 0.01, { type: "sine", v: 0.02, d: 0.5 }); });
      if (s === 0 || s === 5) { note(midi(ch[0] - 24), t, { type: "sine", v: 0.16, d: 0.55 }); note(120, t, { type: "sine", v: 0.22, a: 0.002, d: 0.22, slide: 45 }); }
      if (s === 2 || s === 6) hiss(t, 0.16, 0.06, 1500, "bandpass");
      hiss(t, 0.04, s % 2 ? 0.012 : 0.02, 7000);
      if (Math.random() < 0.18) note(midi(ch[Math.floor(Math.random() * ch.length)] + 24), t, { type: "sine", v: 0.02, a: 0.005, d: 0.9 });
      if (Math.random() < 0.3) hiss(t + Math.random() * 0.2, 0.01, 0.012, 3000);
    }
    function sched() { while (next < ctx.currentTime + 0.2) { play(step, next); next += 60 / BPM / SPB; step++; } }
    return {
      isOn: function () { return on; },
      set: function (v) {
        if (v && !setup()) return false;
        if (!ctx) return false;
        v = !!v; if (v === on) return on; on = v;
        if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
        var t = ctx.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t);
        clearInterval(timer);
        if (on) { bus.gain.linearRampToValueAtTime(0.55, t + 2); step = 0; next = t + 0.08; sched(); timer = setInterval(sched, 40); }
        else bus.gain.linearRampToValueAtTime(0, t + 0.8);
        return on;
      }
    };
  })();

  var musBtn = $("#music-toggle");
  function setMusic(v) {
    Music.set(v);
    musBtn.setAttribute("aria-pressed", String(Music.isOn()));
    $(".lbl", musBtn).textContent = Music.isOn() ? "Music on" : "Music off";
    try { localStorage.setItem("jhc-music", Music.isOn() ? "1" : "0"); } catch (e) {}
  }
  musBtn.addEventListener("click", function () { setMusic(!Music.isOn()); });
  var wantMusic = false;
  try { wantMusic = localStorage.getItem("jhc-music") === "1"; } catch (e) {}
  if (wantMusic) {
    var onceM = function (e) {
      window.removeEventListener("pointerdown", onceM, true);
      if (e.target.closest && e.target.closest("#music-toggle")) return;
      setMusic(true);
    };
    window.addEventListener("pointerdown", onceM, true);
  }
  document.addEventListener("visibilitychange", function () {
    var c = Sound.peek(); if (!c) return;
    if (document.hidden) { try { c.suspend(); } catch (e) {} }
    else if (Music.isOn() || Sound.isOn()) { try { c.resume(); } catch (e) {} }
  });

  var sndBtn = $("#sound-toggle");
  function setSound(v) {
    Sound.set(v);
    sndBtn.setAttribute("aria-pressed", String(Sound.isOn()));
    $(".lbl", sndBtn).textContent = Sound.isOn() ? "Sound on" : "Sound off";
    try { localStorage.setItem("jhc-sound", Sound.isOn() ? "1" : "0"); } catch (e) {}
    if (Sound.isOn()) Sound.chime();
  }
  sndBtn.addEventListener("click", function () { setSound(!Sound.isOn()); });
  var wantSound = false;
  try { wantSound = localStorage.getItem("jhc-sound") === "1"; } catch (e) {}
  if (wantSound) {
    var once = function (e) {
      window.removeEventListener("pointerdown", once, true);
      if (e.target.closest && e.target.closest("#sound-toggle")) return;
      setSound(true);
    };
    window.addEventListener("pointerdown", once, true);
  }

  var lastHover = 0;
  $$("a, button, .card, .cred, .lchip").forEach(function (el) {
    el.addEventListener("pointerenter", function () {
      var n = performance.now();
      if (n - lastHover > 70) { lastHover = n; Sound.hover(); }
    });
  });
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("a, button") && !e.target.closest("#sound-toggle, #music-toggle")) Sound.click();
  });

  /* ================= Toast ================= */
  var toastEl = $("#toast"), toastT;
  function toast(html, ms) {
    toastEl.innerHTML = html;
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 2600);
  }

  /* ================= Custom cursor ================= */
  var ring = $("#cur-ring"), dot = $("#cur-dot");
  var curOn = fine && !reduce;
  if (curOn) {
    document.documentElement.classList.add("has-cursor");
    var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    window.addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
    });
    (function loop() {
      rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
      requestAnimationFrame(loop);
    })();
    document.addEventListener("pointerover", function (e) {
      ring.classList.toggle("big", !!(e.target.closest && e.target.closest("a, button, .card, .cred")));
    });
    document.addEventListener("pointerleave", function () { ring.style.opacity = 0; dot.style.opacity = 0; });
    document.addEventListener("pointerenter", function () { ring.style.opacity = 1; dot.style.opacity = 1; });
  }

  /* ================= Bug hunt ================= */
  var hero = $("#top"), cv = $("#bugs"), g = cv.getContext("2d");
  var TOTAL = 10, W = 0, H = 0, bugs = [], fx = [], fixedCount = 0, totalSquashed = 0;
  var ptr = { x: -999, y: -999 }, heroOn = true, raf = null;
  var countEl = $("#bug-count"), pill = $("#bug-pill"), footBugs = $("#foot-bugs");

  function resize() {
    var r = hero.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    bugs.forEach(function (b) { b.x = Math.min(Math.max(b.x, 12), W - 12); b.y = Math.min(Math.max(b.y, 90), H - 12); });
  }
  function spawn() {
    bugs = [];
    for (var i = 0; i < TOTAL; i++) {
      bugs.push({ x: 20 + Math.random() * (W - 40), y: 110 + Math.random() * (H - 140), a: Math.random() * Math.PI * 2,
        s: 4 + Math.random() * 2.6, sp: 0.45 + Math.random() * 0.75, ph: Math.random() * 10, alive: true, born: 0 });
    }
    fixedCount = 0; updateCount();
  }
  function updateCount() {
    countEl.textContent = fixedCount + "/" + TOTAL;
    footBugs.textContent = totalSquashed;
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

  function drawBug(b) {
    var s = b.s, w = Math.sin(b.ph) * s * 0.45, grow = Math.min(1, b.born);
    g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.scale(grow, grow);
    g.strokeStyle = "rgba(255,107,90,.85)"; g.lineWidth = 1.1; g.lineCap = "round";
    g.beginPath();
    for (var i = -1; i <= 1; i++) {
      var lx = i * s * 0.65, k = (i === 0 ? -w : w);
      g.moveTo(lx, 0); g.lineTo(lx + k, -s * 1.55);
      g.moveTo(lx, 0); g.lineTo(lx - k, s * 1.55);
    }
    g.moveTo(s * 1.35, -1); g.quadraticCurveTo(s * 2.1, -s * 0.4, s * 2.5, -s * 0.95);
    g.moveTo(s * 1.35, 1); g.quadraticCurveTo(s * 2.1, s * 0.4, s * 2.5, s * 0.95);
    g.stroke();
    g.shadowColor = "rgba(255,107,90,.8)"; g.shadowBlur = 14;
    g.fillStyle = "#ff6b5a";
    g.beginPath(); g.ellipse(-s * 0.25, 0, s * 1.15, s * 0.78, 0, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "rgba(10,20,23,.55)";
    g.fillRect(-s * 0.3, -s * 0.78, 1.2, s * 1.56);
    g.fillStyle = "#ffb547";
    g.beginPath(); g.arc(s * 1.05, 0, s * 0.45, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function frame() {
    if (!heroOn) { raf = null; return; }
    g.clearRect(0, 0, W, H);
    var near = false;
    for (var i = 0; i < bugs.length; i++) {
      var b = bugs[i];
      if (!b.alive) continue;
      if (b.born < 1) b.born += 0.04;
      if (!reduce) {
        b.a += (Math.random() - 0.5) * 0.32;
        var dx = b.x - ptr.x, dy = b.y - ptr.y, d = Math.sqrt(dx * dx + dy * dy), sp = b.sp;
        if (d < 130) { b.a += angDiff(Math.atan2(dy, dx), b.a) * 0.22; sp *= 2.7; }
        if (d < 46) near = true;
        b.x += Math.cos(b.a) * sp; b.y += Math.sin(b.a) * sp; b.ph += sp * 0.55;
        if (b.x < 12) { b.x = 12; b.a = Math.PI - b.a; }
        if (b.x > W - 12) { b.x = W - 12; b.a = Math.PI - b.a; }
        if (b.y < 90) { b.y = 90; b.a = -b.a; }
        if (b.y > H - 12) { b.y = H - 12; b.a = -b.a; }
      } else {
        var ddx = b.x - ptr.x, ddy = b.y - ptr.y;
        if (ddx * ddx + ddy * ddy < 46 * 46) near = true;
      }
      drawBug(b);
    }
    for (var j = fx.length - 1; j >= 0; j--) {
      var p = fx[j];
      if (p.kind === "ring") {
        p.r += 2.2; p.life -= 0.04;
        g.strokeStyle = "rgba(255,181,71," + Math.max(p.life, 0) + ")"; g.lineWidth = 1.5;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.stroke();
      } else if (p.kind === "txt") {
        p.y -= 0.7; p.life -= 0.016;
        g.fillStyle = "rgba(116,227,180," + Math.max(p.life, 0) + ")";
        g.font = "500 12px 'JetBrains Mono', monospace"; g.textAlign = "center";
        g.fillText("fixed ✓", p.x, p.y);
      } else {
        p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.98; p.life -= 0.028;
        g.fillStyle = p.c; g.globalAlpha = Math.max(p.life, 0);
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); g.globalAlpha = 1;
      }
      if (p.life <= 0) fx.splice(j, 1);
    }
    if (curOn) ring.classList.toggle("hunt", near);
    raf = requestAnimationFrame(frame);
  }
  function startLoop() { if (!raf && heroOn) raf = requestAnimationFrame(frame); }

  function squash(b) {
    b.alive = false; fixedCount++; totalSquashed++;
    fx.push({ kind: "ring", x: b.x, y: b.y, r: 4, life: 1 });
    fx.push({ kind: "txt", x: b.x, y: b.y - 14, life: 1 });
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3;
      fx.push({ kind: "p", x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, c: i % 2 ? "#ff6b5a" : "#ffb547" });
    }
    Sound.squash();
    updateCount();
    pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
    if (fixedCount === TOTAL) {
      setTimeout(function () {
        Sound.win();
        toast("<strong>All " + TOTAL + " bugs fixed.</strong> <span>Zero known issues. Ship it.</span> <button type=\"button\" class=\"tbtn\" id=\"respawn\">Release more bugs</button>", 7000);
      }, 450);
    }
  }

  hero.addEventListener("pointermove", function (e) {
    var r = cv.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
  });
  hero.addEventListener("pointerleave", function () { ptr.x = -999; ptr.y = -999; if (curOn) ring.classList.remove("hunt"); });
  hero.addEventListener("pointerdown", function (e) {
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var best = null, bd = fine ? 24 : 34;
    bugs.forEach(function (b) {
      if (!b.alive) return;
      var d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    });
    if (best) { e.preventDefault(); squash(best); }
  });
  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "respawn") { spawn(); toastEl.classList.remove("show"); }
  });

  resize(); spawn(); startLoop();
  window.addEventListener("resize", resize);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { heroOn = es[0].isIntersecting; startLoop(); }).observe(hero);
  }

  /* ================= Terminal typing ================= */
  (function () {
    if (reduce) return;
    var body = $("#term-body"), lines = $$("p", body), cmd = $("#cmd-text"), full = cmd.textContent;
    lines.slice(1).forEach(function (l) { l.classList.add("pend"); });
    cmd.textContent = "";
    var i = 0;
    setTimeout(function typeCmd() {
      if (i <= full.length) { cmd.textContent = full.slice(0, i++); if (i % 2) Sound.tick(); setTimeout(typeCmd, 38 + Math.random() * 40); return; }
      var k = 1;
      (function show() {
        if (k >= lines.length) { Sound.chime(); return; }
        lines[k].classList.remove("pend");
        if (lines[k].classList.contains("ok")) Sound.tick();
        k++; setTimeout(show, 150);
      })();
    }, 900);
  })();

  /* ================= QR codes (deterministic per project) ================= */
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  $$("svg.qr").forEach(function (svg) {
    var N = 21, rand = rng(hash(svg.getAttribute("data-seed") || "x")), out = "";
    function finder(x, y) {
      var zones = [[0, 0], [N - 7, 0], [0, N - 7]];
      for (var z = 0; z < 3; z++) {
        var fx0 = zones[z][0], fy0 = zones[z][1], lx = x - fx0, ly = y - fy0;
        if (lx >= -1 && lx <= 7 && ly >= -1 && ly <= 7) {
          if (lx < 0 || ly < 0 || lx > 6 || ly > 6) return 0;
          if (lx === 0 || ly === 0 || lx === 6 || ly === 6) return 1;
          if (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4) return 1;
          return 0;
        }
      }
      return -1;
    }
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var f = finder(x, y), fill = f === -1 ? rand() > 0.52 : f === 1;
      if (fill) out += "<rect class=\"m\" x=\"" + x + "\" y=\"" + y + "\" width=\"1.02\" height=\"1.02\" style=\"--d:" + ((x + y) * 18) + "ms\"/>";
    }
    svg.setAttribute("viewBox", "0 0 " + N + " " + N);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.innerHTML = out;
  });

  /* ================= Project cards: tilt, glare, scan + test run ================= */
  $$(".card").forEach(function (card) {
    var chip = $(".chip", card), busy = false;
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", (px * 100) + "%"); card.style.setProperty("--my", (py * 100) + "%");
      if (!reduce && fine) card.style.transform = "perspective(900px) rotateX(" + ((0.5 - py) * 7) + "deg) rotateY(" + ((px - 0.5) * 9) + "deg) translateY(-4px)";
    });
    card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    card.addEventListener("pointerenter", function () {
      if (busy) return; busy = true;
      chip.textContent = "RUNNING"; chip.classList.add("run");
      card.classList.remove("scanning"); void card.offsetWidth; card.classList.add("scanning");
      setTimeout(function () {
        chip.textContent = "PASS"; chip.classList.remove("run"); Sound.chime();
        setTimeout(function () { busy = false; }, 500);
      }, 720);
    });
  });

  /* ================= Magnetic buttons ================= */
  if (fine && !reduce) {
    $$(".mag").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        el.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.22) + "px," + ((e.clientY - r.top - r.height / 2) * 0.3) + "px)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
      el.style.transition = "transform .35s cubic-bezier(.2,.8,.2,1), border-color .25s, color .25s";
    });
  }

  /* ================= Scroll reveal ================= */
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.remove("pending"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$("[data-reveal]").forEach(function (el) {
      if (el.getBoundingClientRect().top > innerHeight * 0.92) {
        var sib = el.parentElement ? $$(":scope > [data-reveal]", el.parentElement).indexOf(el) : 0;
        el.style.setProperty("--rd", (Math.max(sib, 0) % 4) * 0.09 + "s");
        el.classList.add("pending"); io.observe(el);
      }
    });
  }

  /* ================= Coverage bar + timeline ================= */
  var covBar = $(".cov"), covNum = $("#cov-num"), tl = $("#tl"), tlItems = $$("li", tl);
  function onScroll() {
    var max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? Math.min(1, scrollY / max) : 0;
    covBar.style.setProperty("--cov", p);
    covNum.textContent = Math.round(p * 100) + "%";
    if (!reduce) {
      var r = tl.getBoundingClientRect(), tp = Math.min(1, Math.max(0, (innerHeight * 0.65 - r.top) / r.height));
      tl.style.setProperty("--p", tp);
      tlItems.forEach(function (li) { li.classList.toggle("lit", li.getBoundingClientRect().top < innerHeight * 0.65); });
    } else {
      tlItems.forEach(function (li) { li.classList.add("lit"); });
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ================= Skills test suite ================= */
  var rows = $$("#suite .t"), sum = $("#suite-sum"), runningSuite = false;
  var totalMs = rows.reduce(function (a, r) { return a + (+r.getAttribute("data-ms") || 0); }, 0);
  function runSuite() {
    if (runningSuite) return; runningSuite = true;
    rows.forEach(function (r) { r.classList.remove("ok", "run"); });
    sum.innerHTML = "<span>running " + rows.length + " tests…</span>";
    var i = 0;
    (function next() {
      if (i > 0) { rows[i - 1].classList.remove("run"); rows[i - 1].classList.add("ok"); Sound.tick(); }
      if (i === rows.length) {
        sum.innerHTML = "<span class=\"ok\">" + rows.length + " passing</span><span>0 failing</span><span>" + totalMs + "ms</span>";
        Sound.pass(); runningSuite = false; return;
      }
      rows[i].classList.add("run"); i++;
      setTimeout(next, reduce ? 0 : 150 + Math.random() * 130);
    })();
  }
  $("#rerun").addEventListener("click", runSuite);
  if (!reduce && "IntersectionObserver" in window) {
    var suite = $("#suite");
    if (suite.getBoundingClientRect().top > innerHeight) {
      rows.forEach(function (r) { r.classList.remove("ok"); });
      sum.innerHTML = "<span>" + rows.length + " tests queued</span>";
      var sio = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { sio.disconnect(); setTimeout(runSuite, 350); }
      }, { threshold: 0.35 });
      sio.observe(suite);
    }
  }

  /* ================= Database query panel ================= */
  (function () {
    var panel = $("#dbq"), qrows = $$(".qrow", panel), res = $("#q-res"), busy = false;
    function runQuery() {
      if (busy) return; busy = true;
      qrows.forEach(function (r) { r.classList.add("hide"); r.classList.remove("new"); });
      res.textContent = "running query…";
      var i = 0;
      (function next() {
        if (i < qrows.length) { qrows[i].classList.remove("hide"); qrows[i].classList.add("new"); Sound.tick(); i++; setTimeout(next, reduce ? 0 : 280); return; }
        res.textContent = qrows.length + " rows in set (0.0" + (1 + Math.floor(Math.random() * 8)) + " sec)";
        setTimeout(function () { qrows.forEach(function (r) { r.classList.remove("new"); }); }, 900);
        Sound.pass(); busy = false;
      })();
    }
    $("#q-run").addEventListener("click", runQuery);
    if (!reduce && "IntersectionObserver" in window && panel.getBoundingClientRect().top > innerHeight) {
      qrows.forEach(function (r) { r.classList.add("hide"); });
      res.textContent = "waiting to run…";
      var qio = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { qio.disconnect(); setTimeout(runQuery, 400); }
      }, { threshold: 0.4 });
      qio.observe(panel);
    }
  })();

  /* ================= Copy email ================= */
  $("#copy-email").addEventListener("click", function () {
    var text = this.getAttribute("data-copy");
    var done = function () { toast("<strong>Copied.</strong> <span>" + text + "</span>", 2400); Sound.pass(); };
    var fail = function () { toast("<span>Couldn't copy here. My email is </span><strong>" + text + "</strong>", 4200); };
    try { navigator.clipboard.writeText(text).then(done, fail); } catch (e) { fail(); }
  });
})();