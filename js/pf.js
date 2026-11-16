/* =========================================================
   John Harley Cruz · Portfolio script (pf.js)
   - Generative soundtrack (3 tracks) + sound effects (Web Audio API)
   - Space canvas: starfield, nebula, spiral galaxy, shooting stars,
     warp speed, stardust cursor, music-reactive glow
   - Interactions: constellation, 3D tech globe, stats, rocket, etc.
   ========================================================= */
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
     AUDIO ENGINE
     ===================================================================== */
  var Snd = (function () {
    var ctx = null, volume, master, sfxBus, musicBus, reverb, delay, analyser, freq = null;
    var sfxOn = false, musicOn = false, timer = null, trackIdx = 0, stepIdx = 0, nextTime = 0;
    var vol = parseFloat(store.get("jhc-vol") || "0.8");
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
      volume = ctx.createGain(); volume.gain.value = vol;
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp); comp.connect(volume); volume.connect(ctx.destination);
      reverb = ctx.createConvolver(); reverb.buffer = makeIR(3.6);
      var rv = ctx.createGain(); rv.gain.value = 0.55; reverb.connect(rv); rv.connect(master);
      delay = ctx.createDelay(1.5); delay.delayTime.value = 0.45;
      var fb = ctx.createGain(); fb.gain.value = 0.38; delay.connect(fb); fb.connect(delay);
      var dOut = ctx.createGain(); dOut.gain.value = 0.3; delay.connect(dOut); dOut.connect(master); dOut.connect(reverb);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
      var sSend = ctx.createGain(); sSend.gain.value = 0.35; sfxBus.connect(sSend); sSend.connect(reverb);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      var mSend = ctx.createGain(); mSend.gain.value = 0.8; musicBus.connect(mSend); mSend.connect(reverb);
      analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8;
      musicBus.connect(analyser); freq = new Uint8Array(analyser.frequencyBinCount);
      document.addEventListener("visibilitychange", function () {
        if (!ctx) return;
        if (document.hidden) { try { ctx.suspend(); } catch (e) {} }
        else if (sfxOn || musicOn) { try { ctx.resume(); } catch (e) {} }
      });
      return true;
    }
    function resume() { if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} } }

    /* --- building blocks --- */
    function tone(bus, f, o) {
      o = o || {};
      var a = o.a || 0.008, d = o.d || 0.2, t = (o.at || ctx.currentTime) + (o.when || 0);
      var osc = ctx.createOscillator(), g = ctx.createGain(), out = g;
      osc.type = o.type || "sine"; osc.frequency.setValueAtTime(f, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + a + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
      if (o.lp) { var flt = ctx.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = o.lp; osc.connect(flt); flt.connect(g); }
      else osc.connect(g);
      out.connect(bus); if (o.echo) out.connect(delay);
      osc.start(t); osc.stop(t + a + d + 0.05);
    }
    var noiseBuf = null;
    function getNoise() {
      if (noiseBuf) return noiseBuf;
      var len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return noiseBuf;
    }
    function noise(bus, dur, vol, f1, f2, at, type) {
      var t = at || ctx.currentTime;
      var src = ctx.createBufferSource(); src.buffer = getNoise();
      var flt = ctx.createBiquadFilter(); flt.type = type || "bandpass"; flt.Q.value = 1.1;
      flt.frequency.setValueAtTime(f1, t); flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01 + dur * 0.25, 0.4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(bus); src.start(t, Math.random()); src.stop(t + dur + 0.05);
    }
    function kick(t, v) { tone(musicBus, 140, { at: t, a: 0.003, d: 0.32, vol: v, slide: 42 }); }
    function snare(t, v) { noise(musicBus, 0.18, v, 1800, 900, t); tone(musicBus, 190, { at: t, a: 0.002, d: 0.1, vol: v * 0.5, type: "triangle" }); }
    function hat(t, v) { noise(musicBus, 0.05, v, 8000, 9000, t, "highpass"); }
    function pad(chord, t, dur, peak, hi) {
      var flt = ctx.createBiquadFilter(); flt.type = "lowpass"; flt.Q.value = 0.8;
      flt.frequency.setValueAtTime(420, t); flt.frequency.linearRampToValueAtTime(hi || 1500, t + dur * 0.55); flt.frequency.linearRampToValueAtTime(480, t + dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + Math.min(3.2, dur * 0.35));
      g.gain.setValueAtTime(peak, t + dur * 0.62); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      flt.connect(g); g.connect(musicBus);
      chord.forEach(function (m) {
        [-7, 7].forEach(function (det) {
          var o = ctx.createOscillator(), og = ctx.createGain();
          o.type = "sawtooth"; o.frequency.value = midi(m); o.detune.value = det; og.gain.value = 0.16;
          o.connect(og); og.connect(flt); o.start(t); o.stop(t + dur + 0.1);
        });
      });
    }
    function sub(m, t, dur, v) {
      var b = ctx.createOscillator(), g = ctx.createGain();
      b.type = "sine"; b.frequency.value = midi(m);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(2.5, dur * 0.3));
      g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      b.connect(g); g.connect(musicBus); b.start(t); b.stop(t + dur + 0.1);
    }

    /* --- the three tracks --- */
    var AMB = [[57, 64, 67, 71, 74], [53, 60, 64, 69, 71], [48, 55, 64, 67, 71], [55, 62, 67, 69, 74]];
    var TRI = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
    var tracks = [
      { name: "Nebula Drift", mood: "ambient", bpm: 60, spb: 1,
        step: function (i, t) {
          var ch = AMB[Math.floor(i / 8) % 4];
          if (i % 8 === 0) { pad(ch, t, 10.5, 0.085, 1500); sub(ch[0] - 24, t, 10, 0.15); }
          if (Math.random() < 0.7) tone(musicBus, midi(ch[Math.floor(Math.random() * ch.length)] + 12 + (Math.random() < 0.45 ? 12 : 0)), { at: t, when: Math.random() * 0.6, vol: 0.03, d: 1.8, echo: true });
        } },
      { name: "Hyperdrive", mood: "synthwave", bpm: 100, spb: 4,
        step: function (i, t) {
          var s = i % 16, bar = Math.floor(i / 16), ch = TRI[Math.floor(i / 32) % 4];
          if (i % 32 === 0) pad(ch.map(function (m) { return m + 12; }), t, 5.6, 0.05, 1900);
          if (s === 0 || s === 8 || (s === 10 && bar % 2)) kick(t, 0.42);
          if (s === 4 || s === 12) snare(t, 0.14);
          if (s % 4 === 2) hat(t, 0.06); else if (s % 2 === 1) hat(t, 0.022);
          if (s % 2 === 0) tone(musicBus, midi(ch[0] - 24 + (s % 4 === 2 ? 12 : 0)), { at: t, type: "sawtooth", a: 0.005, d: 0.2, vol: 0.075, lp: 520 });
          var seq = [0, 1, 2, 3, 2, 1, 2, 3], notes = [ch[0], ch[1], ch[2], ch[0] + 12];
          tone(musicBus, midi(notes[seq[s % 8]] + 12), { at: t, type: "triangle", a: 0.004, d: 0.17, vol: 0.032, lp: 2600, echo: s % 4 === 0 });
        } },
      { name: "Stardust Lullaby", mood: "music box", bpm: 76, spb: 2,
        step: function (i, t) {
          var mel = [76, 0, 79, 0, 81, 0, 79, 76, 74, 0, 72, 0, 74, 0, 0, 0, 72, 0, 74, 76, 79, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0];
          var ch = AMB[Math.floor(i / 16) % 4], m = mel[i % 32];
          if (i % 16 === 0) { pad(ch, t, 14, 0.05, 1100); sub(ch[0] - 24, t, 13, 0.11); }
          if (m) { tone(musicBus, midi(m + 12), { at: t, vol: 0.05, a: 0.004, d: 1.4, echo: true }); tone(musicBus, midi(m + 24), { at: t, vol: 0.012, a: 0.003, d: 0.6 }); }
          if (i % 4 === 2 && Math.random() < 0.5) tone(musicBus, midi(ch[2] + 24), { at: t, vol: 0.012, d: 0.8, echo: true });
        } }
    ];
    function schedule() {
      var tr = tracks[trackIdx];
      while (nextTime < ctx.currentTime + 0.2) {
        tr.step(stepIdx, nextTime);
        nextTime += 60 / tr.bpm / tr.spb; stepIdx++;
      }
    }
    function startTrack() {
      clearInterval(timer); stepIdx = 0; nextTime = ctx.currentTime + 0.08;
      schedule(); timer = setInterval(schedule, 40);
    }

    /* --- sound effects --- */
    var penta = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
    var fx = {
      hover: function () { if (sfxOn) tone(sfxBus, midi(penta[6 + Math.floor(Math.random() * 5)]), { vol: 0.022, d: 0.35, echo: true }); },
      click: function () { if (sfxOn) { tone(sfxBus, 620, { type: "triangle", vol: 0.08, d: 0.08 }); tone(sfxBus, 930, { vol: 0.06, d: 0.18, when: 0.05 }); } },
      note: function (i) { if (sfxOn) { var m = penta[i % penta.length]; tone(sfxBus, midi(m), { vol: 0.08, d: 1.1, echo: true }); tone(sfxBus, midi(m + 12), { vol: 0.025, d: 0.7 }); } },
      sparkle: function () { if (sfxOn) tone(sfxBus, midi(penta[4 + Math.floor(Math.random() * 7)] + 12), { vol: 0.035, d: 0.6, echo: true }); },
      whoosh: function () { if (sfxOn) noise(sfxBus, 0.7, 0.06, 260, 2200); },
      tick: function () { if (sfxOn) tone(sfxBus, 1760, { type: "square", vol: 0.015, d: 0.04 }); },
      catchStar: function () { if (sfxOn) [0, 2, 4, 7, 9].forEach(function (k, i) { tone(sfxBus, midi(penta[k] + 12), { vol: 0.065, d: 0.7, when: i * 0.055, echo: true }); }); },
      warp: function () { if (sfxOn) { noise(sfxBus, 1.2, 0.22, 180, 5200); tone(sfxBus, 90, { type: "sawtooth", vol: 0.05, a: 0.05, d: 1.1, slide: 900, lp: 1800 }); tone(sfxBus, midi(93), { vol: 0.04, d: 1.2, when: 0.75, echo: true }); } },
      launch: function () { if (sfxOn) { noise(sfxBus, 1.8, 0.28, 110, 1400); tone(sfxBus, 80, { type: "sawtooth", vol: 0.05, a: 0.05, d: 1.5, slide: 640 }); } },
      success: function () { if (sfxOn) [57, 64, 69, 72, 76, 81].forEach(function (m, i) { tone(sfxBus, midi(m + 12), { vol: 0.05, d: 0.9, when: i * 0.07, echo: true }); }); },
      toggle: function () { if (sfxOn) { tone(sfxBus, midi(76), { vol: 0.07, d: 0.3 }); tone(sfxBus, midi(83), { vol: 0.06, d: 0.45, when: 0.08, echo: true }); } }
    };

    return {
      fx: fx,
      tracks: tracks,
      trackIdx: function () { return trackIdx; },
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
        if (musicOn) { musicBus.gain.linearRampToValueAtTime(0.9, t + 2.5); startTrack(); }
        else { musicBus.gain.linearRampToValueAtTime(0, t + 1.2); clearInterval(timer); }
        return musicOn;
      },
      setTrack: function (i) {
        trackIdx = (i + tracks.length) % tracks.length;
        store.set("jhc-track", String(trackIdx));
        if (musicOn && ctx) {
          var t = ctx.currentTime;
          musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(0.25, t); musicBus.gain.linearRampToValueAtTime(0.9, t + 1.8);
          startTrack();
        }
      },
      setVolume: function (v) { vol = v; store.set("jhc-vol", String(v)); if (volume) volume.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
      volume: function () { return vol; },
      level: function () {
        if (!analyser || !musicOn) return 0;
        analyser.getByteFrequencyData(freq);
        var s = 0; for (var i = 1; i < 8; i++) s += freq[i];
        return s / (7 * 255);
      },
      spectrum: function () { if (!analyser) return null; analyser.getByteFrequencyData(freq); return freq; }
    };
  })();
  var savedTrack = parseInt(store.get("jhc-track") || "0", 10);
  if (savedTrack > 0) Snd.setTrack(savedTrack);

  /* =====================================================================
     AUDIO UI: nav toggles, hero button, prompt, player
     ===================================================================== */
  var musicBtn = $("#music-toggle"), sfxBtn = $("#sfx-toggle"), heroMusic = $("#hero-music"), prompt = $("#prompt");
  var player = $("#player"), plPlay = $("#pl-play"), plIcon = $("#pl-icon"), plTitle = $("#pl-title"), plSub = $("#pl-sub"), plVol = $("#pl-vol");
  var PLAY = "M8 5v14l11-7z", PAUSE = "M6 5h4v14H6zm8 0h4v14h-4z";
  plVol.value = Snd.volume();

  function syncUI(noSave) {
    var on = Snd.musicOn(), tr = Snd.tracks[Snd.trackIdx()];
    musicBtn.setAttribute("aria-pressed", String(on));
    sfxBtn.setAttribute("aria-pressed", String(Snd.sfxOn()));
    heroMusic.querySelector("span").textContent = on ? "Pause the soundtrack" : "Play the soundtrack";
    plIcon.innerHTML = "<path d=\"" + (on ? PAUSE : PLAY) + "\"/>";
    player.classList.toggle("playing", on);
    plTitle.textContent = tr.name;
    plSub.textContent = "Track " + (Snd.trackIdx() + 1) + " of " + Snd.tracks.length + " · " + tr.mood;
    if (on) player.classList.add("show");
    if (noSave) return;
    store.set("jhc-music", on ? "1" : "0");
    store.set("jhc-sfx", Snd.sfxOn() ? "1" : "0");
  }
  function hidePrompt() { prompt.classList.remove("show"); store.set("jhc-prompt", "done"); }
  function startMusic(on) { Snd.setMusic(on); if (on && !Snd.sfxOn()) Snd.setSfx(true); syncUI(); hidePrompt(); }

  musicBtn.addEventListener("click", function () { startMusic(!Snd.musicOn()); });
  sfxBtn.addEventListener("click", function () { Snd.setSfx(!Snd.sfxOn()); syncUI(); Snd.fx.toggle(); hidePrompt(); });
  heroMusic.addEventListener("click", function () {
    var on = !Snd.musicOn(); startMusic(on);
    if (on) toast("<strong>Now playing:</strong> " + Snd.tracks[Snd.trackIdx()].name + ". Switch tracks in the player.");
  });
  plPlay.addEventListener("click", function () { startMusic(!Snd.musicOn()); });
  $("#pl-next").addEventListener("click", function () { Snd.setTrack(Snd.trackIdx() + 1); if (!Snd.musicOn()) startMusic(true); syncUI(); });
  $("#pl-prev").addEventListener("click", function () { Snd.setTrack(Snd.trackIdx() - 1); if (!Snd.musicOn()) startMusic(true); syncUI(); });
  plVol.addEventListener("input", function () { Snd.setVolume(parseFloat(plVol.value)); });
  $("#prompt-play").addEventListener("click", function () { Snd.setSfx(true); startMusic(true); Snd.fx.toggle(); toast("<strong>Sound on.</strong> Hover, click and explore."); });
  $("#prompt-close").addEventListener("click", hidePrompt);
  if (store.get("jhc-prompt") !== "done") setTimeout(function () { prompt.classList.add("show"); }, 3000);

  if (store.get("jhc-music") === "1" || store.get("jhc-sfx") === "1") {
    var restore = function (e) {
      window.removeEventListener("pointerdown", restore, true);
      if (e.target.closest && e.target.closest("#music-toggle, #sfx-toggle, #hero-music, #prompt, #player")) return;
      if (store.get("jhc-sfx") === "1") Snd.setSfx(true);
      if (store.get("jhc-music") === "1") Snd.setMusic(true);
      syncUI();
    };
    window.addEventListener("pointerdown", restore, true);
  }
  syncUI(true);

  /* visualizer in the player */
  (function () {
    var vc = $("#pl-viz"), v = vc.getContext("2d"), bars = 18;
    function frame() {
      requestAnimationFrame(frame);
      if (!player.classList.contains("show")) return;
      v.clearRect(0, 0, vc.width, vc.height);
      var data = Snd.musicOn() ? Snd.spectrum() : null, w = vc.width / bars;
      for (var i = 0; i < bars; i++) {
        var val = data ? data[2 + i * 3] / 255 : 0.04;
        var h = Math.max(3, val * vc.height);
        var gr = v.createLinearGradient(0, vc.height, 0, vc.height - h);
        gr.addColorStop(0, "#72e4ff"); gr.addColorStop(0.6, "#9a8cff"); gr.addColorStop(1, "#ff7cc9");
        v.fillStyle = gr; v.fillRect(i * w + 1.5, vc.height - h, w - 3, h);
      }
    }
    requestAnimationFrame(frame);
  })();

  var lastHover = 0;
  function hoverSound() { var n = performance.now(); if (n - lastHover > 90) { lastHover = n; Snd.fx.hover(); } }
  $$("a, button, .moon span, .fact, .lang, .db").forEach(function (el) { el.addEventListener("pointerenter", hoverSound); });
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("a, button");
    if (el && !el.closest("#music-toggle, #sfx-toggle, #chips, #launch, #globe, #player") && !(el.getAttribute("href") || "").startsWith("#")) Snd.fx.click();
  });

  /* ================= Toast ================= */
  var toastEl = $("#toast"), toastT;
  function toast(html, ms) {
    toastEl.innerHTML = html; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 3000);
  }

  /* =====================================================================
     SPACE CANVAS
     ===================================================================== */
  var cv = $("#space"), c = cv.getContext("2d");
  var W = 0, H = 0, DPR = 1, nebula = null, stars = [], gal = [], shooters = [], parts = [];
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 }, scrollYv = 0, galRot = 0, nextShoot = 0, caught = 0, running = true;
  var warp = reduce ? 0 : 1, warpTarget = 0, beat = 0;
  var STAR_COLS = ["255,255,255", "200,212,255", "255,226,196", "255,200,236", "190,240,255"];
  var GAL_COLS = ["176,164,255", "255,150,214", "140,220,255", "255,255,255", "214,200,255"];

  function newStar(center) {
    return { x: center ? W / 2 + (Math.random() - 0.5) * W * 0.5 : Math.random() * W, y: center ? H / 2 + (Math.random() - 0.5) * H * 0.5 : Math.random() * H,
      z: 0.15 + Math.random() * 0.85, r: Math.random() < 0.05 ? 1.3 + Math.random() * 1.1 : 0.35 + Math.random() * 0.9,
      ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 1.8, col: STAR_COLS[Math.floor(Math.random() * STAR_COLS.length)] };
  }
  function buildStars() { stars = []; var n = Math.min(520, Math.round(W * H / 2400)); for (var i = 0; i < n; i++) stars.push(newStar(false)); }
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
        a: (u < 0.12 ? 0.9 : 0.25 + Math.random() * 0.6), col: u < 0.14 ? "255,236,205" : GAL_COLS[Math.floor(Math.random() * GAL_COLS.length)] });
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
    shooters.push({ x: x, y: -20 + Math.random() * H * 0.35, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, len: 110 + Math.random() * 90 });
  }
  function burst(x, y, n, cols, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (0.6 + Math.random() * 2.6) * (power || 1);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, dec: 0.012 + Math.random() * 0.02, s: 1 + Math.random() * 2.2, col: cols[Math.floor(Math.random() * cols.length)] });
    }
  }
  function label(x, y, text) { parts.push({ txt: text, x: x, y: y, vx: 0, vy: -0.6, life: 1, dec: 0.012 }); }
  function triggerWarp(ms) {
    if (reduce) return;
    warpTarget = 1; Snd.fx.warp();
    setTimeout(function () { warpTarget = 0; }, ms || 800);
  }

  function draw(time) {
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, W, H);
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    scrollYv += (window.scrollY - scrollYv) * 0.12;
    warp += (warpTarget - warp) * (warpTarget > warp ? 0.1 : 0.035);
    if (warp < 0.002) warp = 0;
    beat += (Snd.level() - beat) * 0.25;
    var t = time / 1000, cxs = W / 2, cys = H / 2;

    c.globalAlpha = 1 - warp * 0.4;
    c.drawImage(nebula, -20 - mouse.x * 14, -20 - mouse.y * 14, W + 40, H + 40);
    c.globalAlpha = 1;

    // stars (stretch into streaks at warp speed)
    c.globalCompositeOperation = "lighter";
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = reduce ? 0.8 : Math.min(1, 0.55 + 0.45 * Math.sin(t * s.sp + s.ph) + beat * 0.35);
      if (warp > 0.01) {
        var dx = s.x - cxs, dy = s.y - cys, d = Math.hypot(dx, dy) || 1;
        s.x += dx / d * warp * (6 + d * 0.06) * s.z; s.y += dy / d * warp * (6 + d * 0.06) * s.z;
        if (s.x < -50 || s.x > W + 50 || s.y < -50 || s.y > H + 50) { var ns = newStar(true); s.x = ns.x; s.y = ns.y; }
        var len = warp * (20 + d * 0.28) * s.z;
        c.strokeStyle = "rgba(" + s.col + "," + (0.35 + 0.6 * s.z).toFixed(3) + ")"; c.lineWidth = s.r * 1.2;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - dx / d * len, s.y - dy / d * len); c.stroke();
        continue;
      }
      var x = s.x - mouse.x * 28 * s.z;
      var y = ((s.y - mouse.y * 22 * s.z - scrollYv * 0.18 * s.z) % H + H) % H;
      c.fillStyle = "rgba(" + s.col + "," + (tw * (0.35 + s.z * 0.65)).toFixed(3) + ")";
      if (s.r > 1.2) {
        c.beginPath(); c.arc(x, y, s.r, 0, 6.283); c.fill();
        c.fillStyle = "rgba(" + s.col + "," + (tw * 0.05).toFixed(3) + ")";
        c.beginPath(); c.arc(x, y, s.r * 2.6, 0, 6.283); c.fill();
      } else c.fillRect(x, y, s.r * 1.6, s.r * 1.6);
    }

    // spiral galaxy (core pulses with the music)
    var R = Math.min(W, H) * (W < 720 ? 0.55 : 0.46);
    var cx = W * (W < 720 ? 0.62 : 0.72) - mouse.x * 18, cy = H * 0.4 - mouse.y * 14 - scrollYv * 0.45;
    if (cy > -R && cy < H + R && warp < 0.95) {
      if (!reduce) galRot += 0.0007 + warp * 0.01;
      c.globalAlpha = 1 - warp;
      var tilt = -0.42, ct = Math.cos(tilt), st = Math.sin(tilt), squash = 0.42, coreR = R * (0.38 + beat * 0.22);
      var core = c.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0, "rgba(255,240,220," + (0.55 + beat * 0.3).toFixed(3) + ")"); core.addColorStop(0.25, "rgba(255,190,230,.22)"); core.addColorStop(1, "rgba(140,120,255,0)");
      c.save(); c.translate(cx, cy); c.rotate(tilt); c.scale(1, squash + 0.25); c.translate(-cx, -cy);
      c.fillStyle = core; c.beginPath(); c.arc(cx, cy, coreR, 0, 6.283); c.fill(); c.restore();
      for (var j = 0; j < gal.length; j++) {
        var p = gal[j], r = p.u * R, ang = p.base + galRot * (1.6 - p.u * 0.9);
        var gdx = Math.cos(ang) * r, gdy = Math.sin(ang) * r * squash;
        c.fillStyle = "rgba(" + p.col + "," + p.a + ")";
        c.fillRect(cx + gdx * ct - gdy * st, cy + gdx * st + gdy * ct, p.s, p.s);
      }
      c.globalAlpha = 1;
    }

    // shooting stars
    if (!reduce && time > nextShoot && warp < 0.1) { spawnShooter(); nextShoot = time + 2200 + Math.random() * 4200; }
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

    // particles
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

    // warp vignette flash
    if (warp > 0.02) {
      var vg = c.createRadialGradient(cxs, cys, 0, cxs, cys, Math.max(W, H) * 0.7);
      vg.addColorStop(0, "rgba(180,200,255," + (warp * 0.12).toFixed(3) + ")"); vg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
    }
    c.globalCompositeOperation = "source-over";
  }
  function loop(time) { if (!running) return; draw(time || 0); requestAnimationFrame(loop); }

  window.addEventListener("pointermove", function (e) {
    mouse.tx = e.clientX / W - 0.5; mouse.ty = e.clientY / H - 0.5;
    if (fine && !reduce && parts.length < 260) {
      for (var i = 0; i < 2; i++) parts.push({ x: e.clientX + (Math.random() - 0.5) * 6, y: e.clientY + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 0.7, vy: (Math.random() - 0.5) * 0.7 + 0.25, life: 1, dec: 0.03 + Math.random() * 0.02, s: 0.8 + Math.random() * 1.8, col: ["255,255,255", "190,220,255", "255,190,230", "255,220,150"][Math.floor(Math.random() * 4)] });
    }
  }, { passive: true });

  function segDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, tt = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0;
    tt = Math.max(0, Math.min(1, tt)); return Math.hypot(px - (x1 + tt * dx), py - (y1 + tt * dy));
  }
  var caughtEl = $("#caught"), footCaught = $("#foot-caught"), caughtPill = $("#caught-pill");
  document.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest("a, button, input, textarea, [tabindex], .prompt, .toast, .nav, .player, .globe")) return;
    var x = e.clientX, y = e.clientY;
    for (var k = 0; k < shooters.length; k++) {
      var sh = shooters[k], v = Math.hypot(sh.vx, sh.vy);
      if (segDist(x, y, sh.x, sh.y, sh.x - sh.vx / v * sh.len * 0.6, sh.y - sh.vy / v * sh.len * 0.6) < (fine ? 34 : 48)) {
        shooters.splice(k, 1); caught++;
        caughtEl.textContent = caught; footCaught.textContent = caught;
        caughtPill.classList.remove("pop"); void caughtPill.offsetWidth; caughtPill.classList.add("pop");
        burst(x, y, 46, ["255,210,122", "255,255,255", "255,150,214", "140,220,255"], 1.6);
        label(x, y - 18, caught === 1 ? "caught! make a wish" : "caught ✦ " + caught);
        Snd.fx.catchStar();
        if (caught === 5) setTimeout(function () { toast("<strong>5 shooting stars!</strong> Great reflexes. A tester's eye, maybe?"); Snd.fx.success(); }, 500);
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
  else window.addEventListener("scroll", function () { draw(0); }, { passive: true });

  /* ---- warp jumps: nav links and the W key ---- */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href"), target = id.length > 1 ? $(id) : null;
      if (!target || reduce) return;
      e.preventDefault();
      triggerWarp(650);
      setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 180);
    });
  });
  var warpedOnce = false;
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.key === "w" || e.key === "W") {
      triggerWarp(1100);
      if (!warpedOnce) { warpedOnce = true; toast("<strong>Warp drive engaged.</strong> Press W any time to jump again."); }
    }
  });

  /* =====================================================================
     PAGE ANIMATIONS
     ===================================================================== */
  (function () {
    var el = $(".name .split"), txt = el.textContent, html = "";
    for (var i = 0; i < txt.length; i++) html += txt[i] === " " ? " " : "<span class=\"ch\" style=\"--i:" + i + "\">" + txt[i] + "</span>";
    el.innerHTML = html;
  })();

  (function () {
    if (reduce) return;
    var roles = ["software QA", "data analysis", "API testing", "ethical hacking", "Python & Java", "databases", "software engineering"];
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
    }, 3600);
  })();

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

  /* stats count-up */
  (function () {
    var nums = $$(".stat b[data-to]"), band = $(".stats-in");
    if (reduce || !("IntersectionObserver" in window) || band.getBoundingClientRect().top < innerHeight * 0.9) {
      if (!reduce) setTimeout(run, 1800);
      return;
    }
    nums.forEach(function (n) { n.textContent = "0"; });
    var sio = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { sio.disconnect(); run(); } }, { threshold: 0.5 });
    sio.observe(band);
    function run() {
      nums.forEach(function (n, k) {
        var to = +n.getAttribute("data-to"), start = null, dur = 1100 + k * 150, last = -1;
        (function step(ts) {
          if (!start) start = ts;
          var p = Math.min(1, (ts - start) / dur), val = Math.round(to * (1 - Math.pow(1 - p, 3)));
          if (val !== last) { n.textContent = val; last = val; if (val) Snd.fx.tick(); }
          if (p < 1) requestAnimationFrame(step);
        })(performance.now());
      });
    }
  })();

  /* planet cards: 3D tilt + glare */
  $$(".card").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", px * 100 + "%"); card.style.setProperty("--my", py * 100 + "%");
      if (fine && !reduce) card.style.transform = "perspective(1000px) rotateX(" + ((0.5 - py) * 7) + "deg) rotateY(" + ((px - 0.5) * 9) + "deg) translateY(-6px)";
    });
    card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    card.addEventListener("pointerenter", function () { Snd.fx.whoosh(); });
  });

  /* mission log rocket + page progress */
  var log = $("#log"), logItems = $$("li", log), prog = $("#progress");
  function onScroll() {
    var max = document.documentElement.scrollHeight - innerHeight;
    prog.style.setProperty("--prog", max > 0 ? Math.min(1, scrollY / max) : 0);
    var r = log.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
    log.style.setProperty("--p", reduce ? 1 : p);
    logItems.forEach(function (li) { li.classList.toggle("lit", reduce || li.getBoundingClientRect().top < innerHeight * 0.6); });
  }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* skill constellation */
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

  /* 3D tech globe */
  (function () {
    var globe = $("#globe"), items = $$("li", globe), tags = $$(".tag", globe), info = $("#tag-info");
    var N = items.length, pts = [], R = 200, ax = 0.4, ay = 0, vx = 0.0016, vy = 0.0034, inView = true, raf = null;
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
      pts.push({ x: Math.cos(th) * rad, y: y, z: Math.sin(th) * rad });
    }
    function size() { R = globe.clientWidth * 0.37; }
    function render() {
      var cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
      for (var i = 0; i < N; i++) {
        var p = pts[i];
        var y1 = p.y * cx - p.z * sx, z1 = p.y * sx + p.z * cx;
        var x2 = p.x * cy + z1 * sy, z2 = -p.x * sy + z1 * cy;
        var sc = 2.4 / (2.4 - z2);
        items[i].style.transform = "translate3d(" + (x2 * R).toFixed(1) + "px," + (y1 * R).toFixed(1) + "px,0) scale(" + (sc * 0.78).toFixed(3) + ")";
        items[i].style.opacity = (0.22 + (z2 + 1) / 2 * 0.78).toFixed(3);
        items[i].style.zIndex = String(Math.round((z2 + 1) * 100));
      }
    }
    function frame() {
      if (!inView) { raf = null; return; }
      ax += vx; ay += vy; render();
      raf = requestAnimationFrame(frame);
    }
    size(); render();
    window.addEventListener("resize", function () { size(); render(); });
    if (!reduce) {
      globe.addEventListener("pointermove", function (e) {
        var r = globe.getBoundingClientRect();
        vy = ((e.clientX - r.left) / r.width - 0.5) * 0.035;
        vx = -((e.clientY - r.top) / r.height - 0.5) * 0.035;
      });
      globe.addEventListener("pointerleave", function () { vx = 0.0016; vy = 0.0034; });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView && !raf) raf = requestAnimationFrame(frame); }).observe(globe);
      } else raf = requestAnimationFrame(frame);
    }
    tags.forEach(function (tg, i) {
      tg.addEventListener("click", function () {
        tags.forEach(function (x) { x.classList.toggle("on", x === tg); });
        info.innerHTML = "<b>" + tg.textContent + "</b> · " + tg.getAttribute("data-cat");
        Snd.fx.note(i);
        var r = tg.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 16, ["255,255,255", "140,220,255", "255,210,122"], 0.8);
      });
      tg.addEventListener("pointerenter", hoverSound);
    });
  })();

  /* contact: copy email + rocket launch */
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