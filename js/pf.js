(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* =====================================================================
     AUDIO: generative ambient soundtrack + sound effects (Web Audio)
     ===================================================================== */
  var Snd = (function () {
    var ctx = null, master, sfxBus, musicBus, reverb, delay;
    var sfxOn = false, musicOn = false, chordT = null, sparkT = null, chordIdx = 0;
    var midi = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
    function makeIR(sec) {
      var len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
      return b;
    }
    function init() {
      if (ctx) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC(); } catch (e) { return false; }
      master = ctx.createGain(); master.gain.value = 0.9;
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      reverb = ctx.createConvolver(); reverb.buffer = makeIR(3.6);
      var rv = ctx.createGain(); rv.gain.value = 0.6; reverb.connect(rv); rv.connect(master);
      delay = ctx.createDelay(1.2); delay.delayTime.value = 0.42;
      var fb = ctx.createGain(); fb.gain.value = 0.4; delay.connect(fb); fb.connect(delay);
      var dOut = ctx.createGain(); dOut.gain.value = 0.32; delay.connect(dOut); dOut.connect(master); dOut.connect(reverb);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
      var sSend = ctx.createGain(); sSend.gain.value = 0.35; sfxBus.connect(sSend); sSend.connect(reverb);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      var mSend = ctx.createGain(); mSend.gain.value = 0.9; musicBus.connect(mSend); mSend.connect(reverb);
      document.addEventListener("visibilitychange", function () {
        if (!ctx) return;
        if (document.hidden) { try { ctx.suspend(); } catch (e) {} }
        else if (sfxOn || musicOn) { try { ctx.resume(); } catch (e) {} }
      });
      return true;
    }
    function resume() { if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} } }
    function tone(bus, f, o) {
      o = o || {};
      var a = o.a || 0.008, d = o.d || 0.2, t = ctx.currentTime + (o.when || 0);
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type || "sine"; osc.frequency.setValueAtTime(f, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + a + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
      osc.connect(g); g.connect(bus); if (o.echo) g.connect(delay);
      osc.start(t); osc.stop(t + a + d + 0.05);
    }
    function noise(bus, dur, vol, f1, f2) {
      var t = ctx.currentTime, len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate), dd = buf.getChannelData(0);
      for (var i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var flt = ctx.createBiquadFilter(); flt.type = "bandpass"; flt.Q.value = 1.2;
      flt.frequency.setValueAtTime(f1, t); flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(bus); src.start(t); src.stop(t + dur + 0.05);
    }

    /* Ambient soundtrack: slow evolving pad chords, a sub drone, and twinkling pentatonic notes */
    var chords = [[57, 64, 67, 71, 74], [53, 60, 64, 69, 71], [48, 55, 64, 67, 71], [55, 62, 67, 69, 74]];
    var BAR = 8;
    function pad(chord) {
      var t = ctx.currentTime, dur = BAR + 2.5;
      var flt = ctx.createBiquadFilter(); flt.type = "lowpass"; flt.Q.value = 0.8;
      flt.frequency.setValueAtTime(420, t); flt.frequency.linearRampToValueAtTime(1500, t + dur * 0.55); flt.frequency.linearRampToValueAtTime(480, t + dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.085, t + 3.2);
      g.gain.setValueAtTime(0.085, t + dur - 3.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      flt.connect(g); g.connect(musicBus);
      chord.forEach(function (m) {
        [-7, 7].forEach(function (det) {
          var o = ctx.createOscillator(), og = ctx.createGain();
          o.type = "sawtooth"; o.frequency.value = midi(m); o.detune.value = det; og.gain.value = 0.16;
          o.connect(og); og.connect(flt); o.start(t); o.stop(t + dur + 0.1);
        });
      });
      var b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = "sine"; b.frequency.value = midi(chord[0] - 24);
      bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.16, t + 2.5);
      bg.gain.setValueAtTime(0.16, t + dur - 3); bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      b.connect(bg); bg.connect(musicBus); b.start(t); b.stop(t + dur + 0.1);
    }
    function chordLoop() {
      if (!musicOn) return;
      pad(chords[chordIdx % chords.length]); chordIdx++;
      chordT = setTimeout(chordLoop, BAR * 1000);
    }
    function sparkLoop() {
      if (!musicOn) return;
      var ch = chords[(chordIdx + chords.length - 1) % chords.length];
      if (Math.random() < 0.72) {
        var m = ch[Math.floor(Math.random() * ch.length)] + 12 + (Math.random() < 0.45 ? 12 : 0);
        tone(musicBus, midi(m), { vol: 0.03, a: 0.006, d: 1.8, echo: true });
      }
      sparkT = setTimeout(sparkLoop, 420 + Math.random() * 1000);
    }

    var penta = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
    var fx = {
      hover: function () { if (sfxOn) tone(sfxBus, midi(penta[6 + Math.floor(Math.random() * 5)]), { vol: 0.022, d: 0.35, echo: true }); },
      click: function () { if (sfxOn) { tone(sfxBus, 620, { type: "triangle", vol: 0.08, d: 0.08 }); tone(sfxBus, 930, { vol: 0.06, d: 0.18, when: 0.05 }); } },
      note: function (i) { if (sfxOn) { var m = penta[i % penta.length]; tone(sfxBus, midi(m), { vol: 0.08, d: 1.1, echo: true }); tone(sfxBus, midi(m + 12), { vol: 0.025, d: 0.7 }); } },
      sparkle: function () { if (sfxOn) tone(sfxBus, midi(penta[4 + Math.floor(Math.random() * 7)] + 12), { vol: 0.035, d: 0.6, echo: true }); },
      whoosh: function () { if (sfxOn) noise(sfxBus, 0.7, 0.06, 260, 2200); },
      catchStar: function () { if (sfxOn) [0, 2, 4, 7, 9].forEach(function (k, i) { tone(sfxBus, midi(penta[k] + 12), { vol: 0.065, d: 0.7, when: i * 0.055, echo: true }); }); },
      launch: function () { if (sfxOn) { noise(sfxBus, 1.8, 0.28, 110, 1400); tone(sfxBus, 80, { type: "sawtooth", vol: 0.05, a: 0.05, d: 1.5, slide: 640 }); } },
      success: function () { if (sfxOn) [57, 64, 69, 72, 76, 81].forEach(function (m, i) { tone(sfxBus, midi(m + 12), { vol: 0.05, d: 0.9, when: i * 0.07, echo: true }); }); },
      toggle: function () { if (sfxOn) { tone(sfxBus, midi(76), { vol: 0.07, d: 0.3 }); tone(sfxBus, midi(83), { vol: 0.06, d: 0.45, when: 0.08, echo: true }); } }
    };

    return {
      fx: fx,
      sfxOn: function () { return sfxOn; },
      musicOn: function () { return musicOn; },
      setSfx: function (v) { if (v && !init()) return false; sfxOn = !!v; resume(); return sfxOn; },
      setMusic: function (v) {
        if (v && !init()) return false;
        if (!ctx) return false;
        v = !!v; if (v === musicOn) return musicOn;
        musicOn = v; resume();
        var t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t);
        if (musicOn) { musicBus.gain.linearRampToValueAtTime(0.9, t + 3.5); chordLoop(); sparkLoop(); }
        else { musicBus.gain.linearRampToValueAtTime(0, t + 1.4); clearTimeout(chordT); clearTimeout(sparkT); }
        return musicOn;
      }
    };
  })();

  var musicBtn = $("#music-toggle"), sfxBtn = $("#sfx-toggle"), heroMusic = $("#hero-music"), prompt = $("#prompt");
  function syncUI() {
    musicBtn.setAttribute("aria-pressed", String(Snd.musicOn()));
    sfxBtn.setAttribute("aria-pressed", String(Snd.sfxOn()));
    heroMusic.querySelector("span").textContent = Snd.musicOn() ? "Pause the soundtrack" : "Play the soundtrack";
    store.set("jhc-music", Snd.musicOn() ? "1" : "0");
    store.set("jhc-sfx", Snd.sfxOn() ? "1" : "0");
  }
  function hidePrompt() { prompt.classList.remove("show"); store.set("jhc-prompt", "done"); }
  musicBtn.addEventListener("click", function () { Snd.setMusic(!Snd.musicOn()); syncUI(); hidePrompt(); });
  sfxBtn.addEventListener("click", function () { Snd.setSfx(!Snd.sfxOn()); syncUI(); Snd.fx.toggle(); hidePrompt(); });
  heroMusic.addEventListener("click", function () {
    var on = !Snd.musicOn(); Snd.setMusic(on); if (on && !Snd.sfxOn()) Snd.setSfx(true);
    syncUI(); hidePrompt(); if (on) toast("<strong>Now playing:</strong> an ambient score generated live for this page.");
  });
  $("#prompt-play").addEventListener("click", function () { Snd.setSfx(true); Snd.setMusic(true); syncUI(); Snd.fx.toggle(); hidePrompt(); toast("<strong>Sound on.</strong> Hover, click and explore."); });
  $("#prompt-close").addEventListener("click", hidePrompt);
  if (store.get("jhc-prompt") !== "done") setTimeout(function () { prompt.classList.add("show"); }, 2600);

  if (store.get("jhc-music") === "1" || store.get("jhc-sfx") === "1") {
    var restore = function (e) {
      window.removeEventListener("pointerdown", restore, true);
      if (e.target.closest && e.target.closest("#music-toggle, #sfx-toggle, #hero-music, #prompt")) return;
      if (store.get("jhc-sfx") === "1") Snd.setSfx(true);
      if (store.get("jhc-music") === "1") Snd.setMusic(true);
      syncUI();
    };
    window.addEventListener("pointerdown", restore, true);
  }

  var lastHover = 0;
  function hoverSound() { var n = performance.now(); if (n - lastHover > 90) { lastHover = n; Snd.fx.hover(); } }
  $$("a, button, .moon span, .fact").forEach(function (el) { el.addEventListener("pointerenter", hoverSound); });
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("a, button");
    if (el && !el.closest("#music-toggle, #sfx-toggle, #chips, #launch")) Snd.fx.click();
  });

  /* ================= Toast ================= */
  var toastEl = $("#toast"), toastT;
  function toast(html, ms) {
    toastEl.innerHTML = html; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 2800);
  }

  /* =====================================================================
     SPACE: starfield, nebula, rotating spiral galaxy, shooting stars,
     cursor stardust and click bursts, all on one fixed canvas
     ===================================================================== */
  var cv = $("#space"), c = cv.getContext("2d");
  var W = 0, H = 0, DPR = 1, nebula = null, stars = [], gal = [], shooters = [], parts = [];
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 }, scrollYv = 0, galRot = 0, nextShoot = 0, caught = 0, running = true;
  var STAR_COLS = ["255,255,255", "200,212,255", "255,226,196", "255,200,236", "190,240,255"];
  var GAL_COLS = ["176,164,255", "255,150,214", "140,220,255", "255,255,255", "214,200,255"];

  function buildStars() {
    stars = [];
    var n = Math.min(520, Math.round(W * H / 2400));
    for (var i = 0; i < n; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.15 + Math.random() * 0.85, r: Math.random() < 0.05 ? 1.3 + Math.random() * 1.1 : 0.35 + Math.random() * 0.9,
        ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 1.8, col: STAR_COLS[Math.floor(Math.random() * STAR_COLS.length)] });
    }
  }
  function buildNebula() {
    nebula = document.createElement("canvas"); nebula.width = Math.ceil(W / 2); nebula.height = Math.ceil(H / 2);
    var n = nebula.getContext("2d"), w = nebula.width, h = nebula.height, m = Math.max(w, h);
    [[0.78, 0.3, 0.55, "120,100,255", 0.22], [0.62, 0.18, 0.3, "255,110,200", 0.12], [0.12, 0.78, 0.5, "255,110,200", 0.1],
     [0.5, 0.95, 0.45, "90,210,255", 0.09], [0.95, 0.7, 0.35, "150,120,255", 0.1], [0.25, 0.25, 0.3, "90,160,255", 0.07]].forEach(function (b) {
      var gr = n.createRadialGradient(b[0] * w, b[1] * h, 0, b[0] * w, b[1] * h, b[2] * m);
      gr.addColorStop(0, "rgba(" + b[3] + "," + b[4] + ")"); gr.addColorStop(0.45, "rgba(" + b[3] + "," + (b[4] * 0.4) + ")"); gr.addColorStop(1, "rgba(" + b[3] + ",0)");
      n.fillStyle = gr; n.fillRect(0, 0, w, h);
    });
  }
  function buildGalaxy() {
    gal = [];
    var n = W < 720 ? 900 : 2000, arms = 3;
    for (var i = 0; i < n; i++) {
      var u = Math.pow(Math.random(), 1.35), arm = i % arms;
      var scatter = (Math.random() + Math.random() + Math.random() - 1.5) * (0.42 + (1 - u) * 0.25);
      gal.push({ u: u, base: arm * (Math.PI * 2 / arms) + u * 4.6 + scatter, s: 0.5 + Math.random() * 1.3,
        a: (u < 0.12 ? 0.9 : 0.25 + Math.random() * 0.6),
        col: u < 0.14 ? "255,236,205" : GAL_COLS[Math.floor(Math.random() * GAL_COLS.length)] });
    }
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); c.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildStars(); buildNebula(); buildGalaxy();
    if (reduce) draw(0);
  }

  function spawnShooter() {
    var fromRight = Math.random() < 0.75;
    var x = fromRight ? W * (0.35 + Math.random() * 0.75) : Math.random() * W * 0.4;
    var sp = 7 + Math.random() * 6, ang = fromRight ? Math.PI * (0.78 + Math.random() * 0.1) : Math.PI * (0.12 + Math.random() * 0.1);
    shooters.push({ x: x, y: -20 + Math.random() * H * 0.35, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, len: 110 + Math.random() * 90, life: 1 });
  }
  function burst(x, y, n, cols, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (0.6 + Math.random() * 2.6) * (power || 1);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, dec: 0.012 + Math.random() * 0.02, s: 1 + Math.random() * 2.2, col: cols[Math.floor(Math.random() * cols.length)] });
    }
  }
  function label(x, y, text) { parts.push({ txt: text, x: x, y: y, vx: 0, vy: -0.6, life: 1, dec: 0.012 }); }

  function draw(time) {
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, W, H);
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    scrollYv += (window.scrollY - scrollYv) * 0.12;
    var t = time / 1000;

    // nebula with slight parallax
    c.globalAlpha = 1;
    c.drawImage(nebula, -20 - mouse.x * 14, -20 - mouse.y * 14 - scrollYv * 0.04, W + 40, H + 40);

    // stars
    c.globalCompositeOperation = "lighter";
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
      var x = s.x - mouse.x * 28 * s.z;
      var y = ((s.y - mouse.y * 22 * s.z - scrollYv * 0.18 * s.z) % H + H) % H;
      c.fillStyle = "rgba(" + s.col + "," + (tw * (0.35 + s.z * 0.65)).toFixed(3) + ")";
      if (s.r > 1.2) {
        c.beginPath(); c.arc(x, y, s.r, 0, 6.283); c.fill();
        c.fillStyle = "rgba(" + s.col + "," + (tw * 0.05).toFixed(3) + ")";
        c.beginPath(); c.arc(x, y, s.r * 2.6, 0, 6.283); c.fill();
      } else c.fillRect(x, y, s.r * 1.6, s.r * 1.6);
    }

    // spiral galaxy
    var R = Math.min(W, H) * (W < 720 ? 0.55 : 0.46);
    var cx = W * (W < 720 ? 0.62 : 0.72) - mouse.x * 18, cy = H * 0.4 - mouse.y * 14 - scrollYv * 0.45;
    if (cy > -R && cy < H + R) {
      if (!reduce) galRot += 0.0007;
      var tilt = -0.42, ct = Math.cos(tilt), st = Math.sin(tilt), squash = 0.42;
      var core = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.38);
      core.addColorStop(0, "rgba(255,240,220,.55)"); core.addColorStop(0.25, "rgba(255,190,230,.22)"); core.addColorStop(1, "rgba(140,120,255,0)");
      c.save(); c.translate(cx, cy); c.rotate(tilt); c.scale(1, squash + 0.25); c.translate(-cx, -cy);
      c.fillStyle = core; c.beginPath(); c.arc(cx, cy, R * 0.38, 0, 6.283); c.fill(); c.restore();
      for (var j = 0; j < gal.length; j++) {
        var p = gal[j], r = p.u * R, ang = p.base + galRot * (1.6 - p.u * 0.9);
        var dx = Math.cos(ang) * r, dy = Math.sin(ang) * r * squash;
        var gx = cx + dx * ct - dy * st, gy = cy + dx * st + dy * ct;
        c.fillStyle = "rgba(" + p.col + "," + p.a + ")";
        c.fillRect(gx, gy, p.s, p.s);
      }
    }

    // shooting stars
    if (!reduce && time > nextShoot) { spawnShooter(); nextShoot = time + 2200 + Math.random() * 4200; }
    for (var k = shooters.length - 1; k >= 0; k--) {
      var sh = shooters[k];
      sh.x += sh.vx; sh.y += sh.vy;
      var v = Math.hypot(sh.vx, sh.vy), tx = sh.x - sh.vx / v * sh.len, ty = sh.y - sh.vy / v * sh.len;
      var lg = c.createLinearGradient(sh.x, sh.y, tx, ty);
      lg.addColorStop(0, "rgba(255,255,255,.95)"); lg.addColorStop(0.2, "rgba(190,220,255,.55)"); lg.addColorStop(1, "rgba(154,140,255,0)");
      c.strokeStyle = lg; c.lineWidth = 2; c.lineCap = "round";
      c.beginPath(); c.moveTo(sh.x, sh.y); c.lineTo(tx, ty); c.stroke();
      c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.arc(sh.x, sh.y, 2.2, 0, 6.283); c.fill();
      c.fillStyle = "rgba(190,220,255,.18)"; c.beginPath(); c.arc(sh.x, sh.y, 9, 0, 6.283); c.fill();
      if (sh.x < -250 || sh.x > W + 250 || sh.y > H + 250) shooters.splice(k, 1);
    }

    // particles: stardust trail, bursts, labels
    for (var q = parts.length - 1; q >= 0; q--) {
      var pt = parts[q];
      pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.97; pt.vy = pt.vy * 0.97 + (pt.txt ? 0 : 0.015); pt.life -= pt.dec;
      if (pt.life <= 0) { parts.splice(q, 1); continue; }
      if (pt.txt) {
        c.globalCompositeOperation = "source-over";
        c.fillStyle = "rgba(255,210,122," + pt.life.toFixed(3) + ")"; c.font = "700 12px 'Space Mono', monospace"; c.textAlign = "center";
        c.fillText(pt.txt, pt.x, pt.y);
        c.globalCompositeOperation = "lighter";
      } else {
        c.fillStyle = "rgba(" + pt.col + "," + pt.life.toFixed(3) + ")";
        c.beginPath(); c.arc(pt.x, pt.y, pt.s * pt.life, 0, 6.283); c.fill();
      }
    }
    c.globalCompositeOperation = "source-over";
  }
  function loop(time) {
    if (!running) return;
    draw(time || 0);
    requestAnimationFrame(loop);
  }

  window.addEventListener("pointermove", function (e) {
    mouse.tx = e.clientX / W - 0.5; mouse.ty = e.clientY / H - 0.5;
    if (fine && !reduce && parts.length < 260) {
      for (var i = 0; i < 2; i++) parts.push({ x: e.clientX + (Math.random() - 0.5) * 6, y: e.clientY + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 0.7, vy: (Math.random() - 0.5) * 0.7 + 0.25, life: 1, dec: 0.03 + Math.random() * 0.02, s: 0.8 + Math.random() * 1.8, col: ["255,255,255", "190,220,255", "255,190,230", "255,220,150"][Math.floor(Math.random() * 4)] });
    }
  }, { passive: true });

  function segDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0;
    t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  var caughtEl = $("#caught"), footCaught = $("#foot-caught"), caughtPill = $("#caught-pill");
  document.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest("a, button, input, textarea, [tabindex], .prompt, .toast, .nav")) return;
    var x = e.clientX, y = e.clientY;
    for (var k = 0; k < shooters.length; k++) {
      var sh = shooters[k], v = Math.hypot(sh.vx, sh.vy);
      var tx = sh.x - sh.vx / v * sh.len * 0.6, ty = sh.y - sh.vy / v * sh.len * 0.6;
      if (segDist(x, y, sh.x, sh.y, tx, ty) < (fine ? 34 : 48)) {
        shooters.splice(k, 1); caught++;
        caughtEl.textContent = caught; footCaught.textContent = caught;
        caughtPill.classList.remove("pop"); void caughtPill.offsetWidth; caughtPill.classList.add("pop");
        burst(x, y, 46, ["255,210,122", "255,255,255", "255,150,214", "140,220,255"], 1.6);
        label(x, y - 18, caught === 1 ? "caught! make a wish" : "caught ✦ " + caught);
        Snd.fx.catchStar();
        if (caught === 5) setTimeout(function () { toast("<strong>5 shooting stars!</strong> You have very good reflexes. A tester's eye, maybe?"); Snd.fx.success(); }, 500);
        return;
      }
    }
    if (!reduce) { burst(x, y, 18, ["255,255,255", "190,220,255", "200,180,255"], 0.9); Snd.fx.sparkle(); }
  });

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", function () {
    if (reduce) return;
    running = !document.hidden; if (running) requestAnimationFrame(loop);
  });
  resize();
  if (!reduce) requestAnimationFrame(loop);
  else { var redraw = function () { draw(0); }; window.addEventListener("scroll", redraw, { passive: true }); }

  /* ================= Hero name warp-in ================= */
  (function () {
    var el = $(".name .split"), txt = el.textContent, html = "";
    for (var i = 0; i < txt.length; i++) html += txt[i] === " " ? " " : "<span class=\"ch\" style=\"--i:" + i + "\">" + txt[i] + "</span>";
    el.innerHTML = html;
  })();

  /* ================= Role typer ================= */
  (function () {
    if (reduce) return;
    var roles = ["software QA", "data analysis", "API testing", "security testing", "software engineering"];
    var el = $("#role"), ri = 0, txt = roles[0], del = true;
    setTimeout(function step() {
      if (del) {
        txt = txt.slice(0, -1); el.textContent = txt;
        if (!txt) { del = false; ri = (ri + 1) % roles.length; }
        setTimeout(step, 45);
      } else {
        var target = roles[ri]; txt = target.slice(0, txt.length + 1); el.textContent = txt;
        if (txt === target) { del = true; setTimeout(step, 2200); } else setTimeout(step, 80 + Math.random() * 60);
      }
    }, 3200);
  })();

  /* ================= Scroll reveal ================= */
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.remove("pending"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -50px 0px" });
    $$("[data-reveal]").forEach(function (el) {
      if (el.getBoundingClientRect().top > innerHeight * 0.95) {
        var sibs = $$(":scope > [data-reveal]", el.parentElement), idx = sibs.indexOf(el);
        el.style.setProperty("--rd", (Math.max(idx, 0) % 4) * 0.1 + "s");
        el.classList.add("pending"); io.observe(el);
      }
    });
    var secIo = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) Snd.fx.whoosh(); }); }, { threshold: 0.3 });
    $$("section .sh").forEach(function (h) { secIo.observe(h); });
  }

  /* ================= Planet cards: 3D tilt + glare ================= */
  $$(".card").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", px * 100 + "%"); card.style.setProperty("--my", py * 100 + "%");
      if (fine && !reduce) card.style.transform = "perspective(1000px) rotateX(" + ((0.5 - py) * 7) + "deg) rotateY(" + ((px - 0.5) * 9) + "deg) translateY(-6px)";
    });
    card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    card.addEventListener("pointerenter", function () { Snd.fx.whoosh(); });
  });

  /* ================= Mission log rocket + progress ================= */
  var log = $("#log"), logItems = $$("li", log), prog = $("#progress");
  function onScroll() {
    var max = document.documentElement.scrollHeight - innerHeight;
    prog.style.setProperty("--prog", max > 0 ? Math.min(1, scrollY / max) : 0);
    var r = log.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
    log.style.setProperty("--p", reduce ? 1 : p);
    logItems.forEach(function (li) { li.classList.toggle("lit", reduce || li.getBoundingClientRect().top < innerHeight * 0.6); });
  }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ================= Skill constellation ================= */
  var cstars = $$(".cstar"), lines = $$(".cl"), chipBtns = $$("#chips button");
  var dIdx = $("#d-idx"), dBody = $("#d-body"), dName = $("#d-name"), dGroup = $("#d-group"), dDesc = $("#d-desc"), current = -1;
  function select(i, sound) {
    if (i === current) { if (sound) Snd.fx.note(i); return; }
    current = i;
    var s = cstars[i];
    cstars.forEach(function (x) { x.classList.toggle("active", x === s); });
    lines.forEach(function (l) { l.classList.toggle("hot", +l.getAttribute("data-a") === i || +l.getAttribute("data-b") === i); });
    chipBtns.forEach(function (b) { b.classList.toggle("active", +b.getAttribute("data-i") === i); });
    dIdx.textContent = "STAR " + String(i + 1).padStart(2, "0") + " / " + cstars.length;
    dName.textContent = s.getAttribute("data-name"); dGroup.textContent = s.getAttribute("data-group"); dDesc.textContent = s.getAttribute("data-desc");
    dBody.classList.remove("d-anim"); void dBody.offsetWidth; dBody.classList.add("d-anim");
    if (sound) Snd.fx.note(i);
  }
  cstars.forEach(function (s, i) {
    s.setAttribute("aria-label", s.getAttribute("data-name"));
    s.addEventListener("pointerenter", function () { select(i, true); });
    s.addEventListener("focus", function () { select(i, true); });
    s.addEventListener("click", function () { select(i, true); });
    s.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(i, true); } });
  });
  chipBtns.forEach(function (b) { b.addEventListener("click", function () { select(+b.getAttribute("data-i"), true); }); });
  select(0, false);
  (function () {
    var chart = $("#chart");
    if (reduce || !("IntersectionObserver" in window) || chart.getBoundingClientRect().top < innerHeight) return;
    chart.classList.add("undrawn");
    var cio = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) {
        cio.disconnect();
        setTimeout(function () {
          chart.classList.remove("undrawn");
          [0, 3, 6, 10].forEach(function (n, k) { setTimeout(function () { Snd.fx.note(n + k); }, k * 260); });
        }, 400);
      }
    }, { threshold: 0.4 });
    cio.observe(chart);
  })();

  /* ================= Contact: copy email + rocket launch ================= */
  $("#launch").addEventListener("click", function () {
    var btn = this, text = btn.getAttribute("data-copy"), r = btn.getBoundingClientRect();
    if (!reduce) {
      var f = document.createElement("div");
      f.className = "flyer";
      f.style.left = (r.left + r.width / 2 - 22) + "px"; f.style.top = (r.top - 60) + "px";
      f.innerHTML = '<svg viewBox="0 0 44 70" width="44" height="70" aria-hidden="true"><path class="flame" d="M14 52 Q22 72 30 52 Z" fill="#ffd27a"/><path class="flame" d="M17.5 52 Q22 65 26.5 52 Z" fill="#fff"/><path d="M22 2 C33 13 34 31 30 50 H14 C10 31 11 13 22 2 Z" fill="#eef0ff"/><circle cx="22" cy="22" r="5" fill="#72e4ff" stroke="#090a1c" stroke-width="2"/><path d="M14 36 L5 50 L14 47 Z M30 36 L39 50 L30 47 Z" fill="#ff7cc9"/></svg>';
      document.body.appendChild(f);
      setTimeout(function () { f.remove(); }, 1800);
      var bx = r.left + r.width / 2, by = r.top;
      var puff = setInterval(function () { burst(bx + (Math.random() - 0.5) * 30, by, 6, ["255,210,122", "255,255,255", "200,200,230"], 0.7); }, 60);
      setTimeout(function () { clearInterval(puff); }, 700);
    }
    Snd.fx.launch();
    var done = function () { toast("<strong>Email copied.</strong> " + text + " is ready to paste."); setTimeout(function () { Snd.fx.success(); }, 900); };
    var fail = function () { toast("Couldn't copy here. My email is <strong>" + text + "</strong>", 4500); };
    try { navigator.clipboard.writeText(text).then(done, fail); } catch (e) { fail(); }
  });
})();