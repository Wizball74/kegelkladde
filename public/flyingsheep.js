(function () {
  'use strict';

  const overlay = document.getElementById('sheep-overlay');
  if (!overlay) return;

  /* ═══ Constants ═══ */
  const HEAD_R = 5, HEAD_W = 12, HEAD_H = 12;
  const TORSO_W = 17, TORSO_H = 14;
  const LEG_W = 2, LEG_H = 8;
  const POLE_H = 5, HUB_SZ = 4;
  let W = innerWidth, H = innerHeight;

  const PROP_BASE = 8, PROP_MAX = 90;
  const BASE_MAX_SPEED = 3.0;
  const BASE_STEER = 0.06;
  const FRICTION = 0.985;
  const MARGIN = 35;
  const MAX_SHEEP = 10;

  /* Aging: 5min → 20min linear ramp */
  const AGE_START = 5 * 60 * 1000;   // 300 000 ms
  const AGE_FULL  = 20 * 60 * 1000;  // 1 200 000 ms

  /* Herde */
  const SEPARATION_R = 55, ALIGNMENT_R = 90, COHESION_R = 120;
  const SEP_FORCE = 0.08, ALI_FORCE = 0.006, COH_FORCE = 0.0015;
  const COLLISION_R = 16;

  const STORAGE_KEY = 'flyingSheepState';
  const SAVE_INTERVAL = 3000;

  /* ═══ Cursor ═══ */
  let cursorX = W / 2, cursorY = H / 2, cursorLastMove = 0;
  document.addEventListener('mousemove', function (e) {
    cursorX = e.clientX; cursorY = e.clientY; cursorLastMove = performance.now();
  });

  /* ═══ Flock ═══ */
  var flock = [];
  var dismissed = false;

  /* ═══ Aging helpers ═══ */
  function getAgeFactor(sh) {
    if (sh.age < AGE_START) return 0;
    return Math.min(1, (sh.age - AGE_START) / (AGE_FULL - AGE_START));
  }
  function getMaxSpeed(sh) {
    var sizeFactor = 1 / Math.sqrt(sh.sizeMultiplier);
    return BASE_MAX_SPEED * sizeFactor * (1 - getAgeFactor(sh) * 0.6);
  }
  function getSteer(sh) {
    var sizeFactor = 1 / Math.sqrt(sh.sizeMultiplier);
    return BASE_STEER * sizeFactor * (1 - getAgeFactor(sh) * 0.7);
  }

  /* ═══ Traits ═══ */
  function generateTraits() {
    var isBlack = Math.random() < 0.08;
    var scale = 0.75 + Math.random() * 0.5;
    var chub = 0.85 + Math.random() * 0.35;
    var legMul = 0.75 + Math.random() * 0.5;
    var headMul = 0.9 + Math.random() * 0.2;
    var woolColors = ['white', 'white', 'white', 'white', '#f5f0e0', '#eee', '#f0e6d3'];
    var woolColor = isBlack ? '#3a3a3a' : woolColors[Math.random() * woolColors.length | 0];
    var borderColor = isBlack ? '#1a1a1a' : '#444';
    var skinColor = isBlack ? '#2a2a2a' : '#444';
    var accColors = ['#e44', '#44e', '#4a4', '#e4e', '#fa0', '#0cd', '#f80', '#c44'];
    var accColor = accColors[Math.random() * accColors.length | 0];
    var accessory = null;
    var r = Math.random();
    if (r < .10) accessory = 'tophat';
    else if (r < .18) accessory = 'partyhat';
    else if (r < .22) accessory = 'crown';
    else if (r < .32) accessory = 'beanie';
    else if (r < .42) accessory = 'glasses';
    else if (r < .50) accessory = 'bowtie';
    else if (r < .57) accessory = 'bell';
    else if (r < .64) accessory = 'flower';
    else if (r < .72) accessory = 'scarf';
    else if (r < .80) accessory = 'shoes';
    var legSpread = 3 + Math.random() * 5;
    var legYBase = 4.5 + Math.random() * 3;
    var legBackOff = 0.5 + Math.random() * 1.5;
    var legs = [
      { lx: -legSpread / 2 - .5 + (Math.random() - .5), ly: legYBase + (Math.random() - .5) * 1.5 },
      { lx:  legSpread / 2 + .5 + (Math.random() - .5), ly: legYBase + (Math.random() - .5) * 1.5 },
      { lx: -legSpread / 2 + legBackOff + (Math.random() - .5), ly: legYBase + 1 + (Math.random() - .5) },
      { lx:  legSpread / 2 - legBackOff + (Math.random() - .5), ly: legYBase + 1 + (Math.random() - .5) },
    ];
    var legPhases = [
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    ];
    var legRestAngles = [
      (Math.random() - .5) * 12,
      (Math.random() - .5) * 12,
      (Math.random() - .5) * 12,
      (Math.random() - .5) * 12,
    ];
    var tailSize = 3 + Math.random() * 3;
    return { scale: scale, chub: chub, legMul: legMul, headMul: headMul, woolColor: woolColor, borderColor: borderColor, skinColor: skinColor, isBlack: isBlack, accessory: accessory, accColor: accColor, legs: legs, legPhases: legPhases, legRestAngles: legRestAngles, tailSize: tailSize };
  }

  /* ═══ DOM-Factory ═══ */
  function createSheepDOM(tr, letter) {
    var wrap = document.createElement('div');
    wrap.className = 's-wrap';
    overlay.appendChild(wrap);
    var mk = function (cls) { var el = document.createElement('div'); el.className = 'p ' + cls; wrap.appendChild(el); return el; };

    var tw = TORSO_W * tr.chub, th = TORSO_H;
    var hw = HEAD_W * tr.headMul, hh = HEAD_H * tr.headMul;
    var lh = LEG_H * tr.legMul;

    var lbl = mk('s-leg bk'); var lbr = mk('s-leg bk');
    var tail = mk('s-tail');
    var torso = mk('s-torso');
    var lfl = mk('s-leg fr'); var lfr = mk('s-leg fr');
    var head = mk('s-head');

    tail.style.cssText += 'width:' + tr.tailSize + 'px;height:' + tr.tailSize + 'px;background:' + tr.woolColor + ';border:1px solid ' + tr.borderColor + ';';
    torso.style.cssText += 'width:' + tw + 'px;height:' + th + 'px;background:' + tr.woolColor + ';border-color:' + tr.borderColor + ';';
    var labelEl = document.createElement('span'); labelEl.className = 's-label';
    labelEl.textContent = letter || '';
    if (tr.isBlack) labelEl.style.color = 'rgba(255,255,255,.45)';
    torso.appendChild(labelEl);
    head.style.cssText += 'width:' + hw + 'px;height:' + hh + 'px;background:' + tr.woolColor + ';border-color:' + tr.borderColor + ';';
    head.style.setProperty('--wool', tr.woolColor);
    head.style.setProperty('--bdr', tr.borderColor);
    var legEls = [lfl, lfr, lbl, lbr];
    for (var li = 0; li < legEls.length; li++) legEls[li].style.cssText += 'height:' + lh + 'px;background:' + tr.skinColor + ';';

    var earL = document.createElement('div'); earL.className = 's-ear l'; head.appendChild(earL);
    var earR = document.createElement('div'); earR.className = 's-ear r'; head.appendChild(earR);
    var earColor = tr.isBlack ? '#2a2a2a' : '#f4c7b0';
    earL.style.background = earR.style.background = earColor;
    earL.style.border = earR.style.border = '.8px solid ' + tr.borderColor;
    var eyeL = document.createElement('div'); eyeL.className = 's-eye l'; head.appendChild(eyeL);
    var eyeR = document.createElement('div'); eyeR.className = 's-eye r'; head.appendChild(eyeR);
    var mouth = document.createElement('div'); mouth.className = 's-mouth'; head.appendChild(mouth);
    if (tr.isBlack) { eyeL.style.background = eyeR.style.background = '#eee'; mouth.style.borderColor = tr.borderColor; }

    var pole = mk('s-pole'); var hub = mk('s-hub');
    var bwrap = mk('s-bwrap');
    var blades = document.createElement('div'); blades.className = 's-blades'; bwrap.appendChild(blades);
    blades.appendChild(Object.assign(document.createElement('div'), { className: 's-bl' }));
    blades.appendChild(Object.assign(document.createElement('div'), { className: 's-bl' }));

    /* Accessoire */
    if (tr.accessory === 'tophat') {
      var h = document.createElement('div'); h.className = 's-acc s-tophat';
      h.style.background = tr.isBlack ? '#555' : '#222';
      head.appendChild(h);
    } else if (tr.accessory === 'partyhat') {
      var h = document.createElement('div'); h.className = 's-acc s-partyhat';
      h.style.borderBottomColor = tr.accColor; h.style.borderBottomWidth = '10px';
      head.appendChild(h);
    } else if (tr.accessory === 'crown') {
      var h = document.createElement('div'); h.className = 's-acc s-crown';
      head.appendChild(h);
    } else if (tr.accessory === 'beanie') {
      var h = document.createElement('div'); h.className = 's-acc s-beanie';
      h.style.background = tr.accColor;
      head.appendChild(h);
    } else if (tr.accessory === 'glasses') {
      var g = document.createElement('div'); g.className = 's-acc s-glasses';
      g.innerHTML = '<span class="s-lens"></span><span class="s-lens"></span><span class="s-bridge"></span>';
      head.appendChild(g);
    } else if (tr.accessory === 'bowtie') {
      var bt = document.createElement('div'); bt.className = 's-acc s-bowtie';
      bt.style.borderLeftColor = bt.style.borderRightColor = tr.accColor;
      bt.style.borderLeftWidth = bt.style.borderRightWidth = '3.5px';
      torso.appendChild(bt);
    } else if (tr.accessory === 'bell') {
      var b = document.createElement('div'); b.className = 's-acc s-bell'; head.appendChild(b);
    } else if (tr.accessory === 'flower') {
      var f = document.createElement('div'); f.className = 's-acc s-flower'; f.style.background = tr.accColor; head.appendChild(f);
    } else if (tr.accessory === 'scarf') {
      var s = document.createElement('div'); s.className = 's-acc s-scarf'; s.style.background = tr.accColor;
      head.appendChild(s);
    } else if (tr.accessory === 'shoes') {
      for (var si = 0; si < legEls.length; si++) {
        var sh = document.createElement('div'); sh.className = 's-shoe'; sh.style.background = tr.accColor; legEls[si].appendChild(sh);
      }
    }

    return { wrap: wrap, torso: torso, head: head, tail: tail, label: labelEl, lfl: lfl, lfr: lfr, lbl: lbl, lbr: lbr, pole: pole, hub: hub, bwrap: bwrap, blades: blades, eyeL: eyeL, eyeR: eyeR };
  }

  /* ═══ Schaf erzeugen ═══ */
  function createSheep(x, y, ownerId, letter, opts) {
    opts = opts || {};
    var traits = opts.traits || generateTraits();
    var dom = createSheepDOM(traits, letter || '');
    var sheep = {
      dom: dom, traits: traits,
      tw: TORSO_W * traits.chub, th: TORSO_H,
      hw: HEAD_W * traits.headMul, hh: HEAD_H * traits.headMul,
      hr: HEAD_R * traits.headMul,
      ownerId: ownerId || null,
      letter: letter || '',
      sizeMultiplier: opts.sizeMultiplier || 1.0,
      age: opts.age || 0,
      x: x != null ? x : MARGIN + Math.random() * (W - MARGIN * 2),
      y: y != null ? y : MARGIN + Math.random() * (H - MARGIN * 2),
      vx: opts.vx != null ? opts.vx : (Math.random() - .5) * 2,
      vy: opts.vy != null ? opts.vy : (Math.random() - .5) * 2,
      bank: opts.bank || 0, headAngle: 0, headTarget: 0,
      propSpeed: opts.propSpeed || (10 + Math.random() * 10),
      propAngle: Math.random() * 360,
      bobPhase: Math.random() * 9999, legPhase: Math.random() * 9999,
      eyeX: 0, eyeY: 0, wobble: 0, wobbleV: 0,
      target: { x: 0, y: 0 }, state: opts.state || 'dart', stTimer: 0, stDur: 500,
      resumeDelay: 0, throwBoost: 0,
      orbitCenter: { x: 0, y: 0 }, orbitAngle: 0, orbitRadius: 40, orbitDir: 1,
      blinkTimer: 1500 + Math.random() * 3000, isBlinking: false, blinkDur: 0,
      wideEyes: 0, kickLeg: -1, kickTimer: 0, kickCD: 1500 + Math.random() * 2500,
      socialTarget: null, collisionCD: 0,
      scareCorner: null, canSpreadFear: false,
      solo: opts.solo != null ? opts.solo : Math.random() < 0.35,
      soloTimer: 4000 + Math.random() * 12000,
      tailSide: opts.tailSide || 0,
      legDragX: 0, legDragY: 0,
    };
    sheep.target = newTarget();
    flock.push(sheep);
    return sheep;
  }

  function removeSheep(sheep) {
    var i = flock.indexOf(sheep);
    if (i === -1) return;
    flock.splice(i, 1);
    sheep.dom.wrap.remove();
    saveFlock();
  }

  /* ═══ Targets ═══ */
  function newTarget() {
    var p = window.flyingSheepPerch;
    if (p && Math.random() < .7) return { x: p.x + (Math.random() - .5) * 70, y: p.y + (Math.random() - .5) * 40 };
    return { x: MARGIN + Math.random() * (W - MARGIN * 2), y: MARGIN + Math.random() * (H - MARGIN * 2) };
  }
  function nearTarget(sh, d) {
    var p = window.flyingSheepPerch;
    if (p && Math.random() < .6) return { x: p.x + (Math.random() - .5) * 80, y: p.y + (Math.random() - .5) * 50 };
    return { x: sh.x + (Math.random() - .5) * d, y: sh.y + (Math.random() - .5) * d };
  }

  /* ═══ Ecke + Angst ═══ */
  function nearestCorner(x, y) {
    var pad = MARGIN + 15;
    var corners = [{ x: pad, y: pad }, { x: W - pad, y: pad }, { x: pad, y: H - pad }, { x: W - pad, y: H - pad }];
    var best = corners[0], bestD = Infinity;
    for (var ci = 0; ci < corners.length; ci++) { var c = corners[ci]; var d = Math.hypot(c.x - x, c.y - y); if (d < bestD) { best = c; bestD = d; } }
    return best;
  }

  function makeSheepScared(sh, canSpread) {
    sh.state = 'scared'; sh.stTimer = 0; sh.stDur = 8000 + Math.random() * 7000;
    sh.scareCorner = nearestCorner(sh.x, sh.y);
    sh.wideEyes = sh.stDur + 1000; sh.propSpeed = PROP_MAX;
    sh.canSpreadFear = canSpread;
    if (canSpread) {
      for (var fi = 0; fi < flock.length; fi++) {
        var o = flock[fi];
        if (o === sh || o.state === 'scared') continue;
        if (Math.hypot(o.x - sh.x, o.y - sh.y) < 100) makeSheepScared(o, false);
      }
    }
  }

  /* ═══ Verhalten ═══ */
  function pickNext(sh) {
    if (sh.state === 'scared' || sh.state === 'departing') return;

    if (sh.solo) {
      var r = Math.random();
      if (r < .35) { sh.state = 'explore'; sh.target = newTarget(); sh.stTimer = 0; sh.stDur = 3000 + Math.random() * 5000; sh.propSpeed = Math.min(sh.propSpeed + 6, PROP_MAX); }
      else if (r < .55) { sh.state = 'dart'; sh.target = newTarget(); sh.stTimer = 0; sh.stDur = 800 + Math.random() * 1200; sh.propSpeed = Math.min(sh.propSpeed + 12, PROP_MAX); }
      else if (r < .72) { sh.state = 'zigzag'; sh.target = newTarget(); sh.stTimer = 0; sh.stDur = 2000 + Math.random() * 2500; }
      else if (r < .85) { sh.state = 'circle'; sh.orbitCenter = { x: sh.x, y: sh.y }; sh.orbitAngle = Math.random() * Math.PI * 2; sh.orbitRadius = 40 + Math.random() * 80; sh.orbitDir = Math.random() > .5 ? 1 : -1; sh.stTimer = 0; sh.stDur = 2000 + Math.random() * 3000; }
      else { sh.state = 'hover'; sh.stTimer = 0; sh.stDur = 500 + Math.random() * 1500; }
      return;
    }

    var curOK = (performance.now() - cursorLastMove) < 4000 && Math.hypot(sh.x - cursorX, sh.y - cursorY) > 60;
    var r = Math.random();
    if (curOK && r < .12) { sh.state = 'curious'; sh.stTimer = 0; sh.stDur = 2000 + Math.random() * 2500; }
    else if (flock.length > 1 && r < .22) {
      sh.state = 'social';
      var others = flock.filter(function (o) { return o !== sh && o.state !== 'departing'; });
      if (!others.length) { sh.state = 'explore'; sh.target = newTarget(); sh.stTimer = 0; sh.stDur = 2500; return; }
      sh.socialTarget = others[Math.random() * others.length | 0];
      sh.stTimer = 0; sh.stDur = 2000 + Math.random() * 2500;
    }
    else if (r < .42) { sh.state = 'dart'; sh.target = nearTarget(sh, 200); sh.stTimer = 0; sh.stDur = 600 + Math.random() * 1000; sh.propSpeed = Math.min(sh.propSpeed + 12, PROP_MAX); }
    else if (r < .52) { sh.state = 'hover'; sh.stTimer = 0; sh.stDur = 400 + Math.random() * 1200; }
    else if (r < .72) { sh.state = 'explore'; sh.target = newTarget(); sh.stTimer = 0; sh.stDur = 2000 + Math.random() * 3500; sh.propSpeed = Math.min(sh.propSpeed + 6, PROP_MAX); }
    else if (r < .85) { sh.state = 'circle'; sh.orbitCenter = { x: sh.x, y: sh.y }; sh.orbitAngle = Math.random() * Math.PI * 2; sh.orbitRadius = 30 + Math.random() * 60; sh.orbitDir = Math.random() > .5 ? 1 : -1; sh.stTimer = 0; sh.stDur = 1500 + Math.random() * 2000; }
    else { sh.state = 'zigzag'; sh.target = newTarget(); sh.stTimer = 0; sh.stDur = 1500 + Math.random() * 2000; }
  }

  function behave(sh, dt, t) {
    if (sh === dragSheep) {
      sh.headTarget = Math.max(-30, Math.min(30, sh.vx * 5));
      sh.wideEyes = Math.max(sh.wideEyes, 100);
      return;
    }
    if (sh.resumeDelay > 0) { sh.resumeDelay -= dt; return; }
    sh.stTimer += dt;
    var S = getSteer(sh);

    switch (sh.state) {
      case 'hover': {
        sh.vx *= .94; sh.vy *= .94;
        sh.headTarget = Math.sin(sh.stTimer * .005) * 35;
        if (sh.stTimer > sh.stDur) pickNext(sh);
        break;
      }
      case 'dart': {
        var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
        if (d < 20 || sh.stTimer > sh.stDur) { pickNext(sh); break; }
        sh.vx += (dx / d) * S * 1.4; sh.vy += (dy / d) * S * 1.4;
        sh.headTarget = Math.max(-22, Math.min(22, sh.vx * 5));
        break;
      }
      case 'explore': {
        var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
        if (d < 25 || sh.stTimer > sh.stDur) { pickNext(sh); break; }
        var nx = dx / d, ny = dy / d, arr = Math.min(1, d / 60);
        var w = Math.sin(t * .001 + sh.stTimer * .001 + sh.bobPhase) * .5;
        var c = Math.cos(w), sn = Math.sin(w);
        sh.vx += (nx * c - ny * sn) * S * arr; sh.vy += (nx * sn + ny * c) * S * arr;
        sh.headTarget = Math.max(-20, Math.min(20, sh.vx * 5));
        break;
      }
      case 'circle': {
        sh.orbitAngle += dt * .003 * sh.orbitDir;
        var tx = sh.orbitCenter.x + Math.cos(sh.orbitAngle) * sh.orbitRadius;
        var ty = sh.orbitCenter.y + Math.sin(sh.orbitAngle) * sh.orbitRadius;
        var dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
        if (d > 1) { sh.vx += (dx / d) * S * 1.1; sh.vy += (dy / d) * S * 1.1; }
        sh.headTarget = Math.max(-25, Math.min(25, sh.vx * 4));
        if (sh.stTimer > sh.stDur) pickNext(sh);
        break;
      }
      case 'zigzag': {
        var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
        if (d < 25 || sh.stTimer > sh.stDur) { pickNext(sh); break; }
        var nx = dx / d, ny = dy / d;
        var zig = Math.sin(sh.stTimer * .008) * 1.2, c = Math.cos(zig), sn = Math.sin(zig);
        sh.vx += (nx * c - ny * sn) * S * 1.2; sh.vy += (nx * sn + ny * c) * S * 1.2;
        sh.headTarget = Math.sin(sh.stTimer * .006) * 30;
        break;
      }
      case 'curious': {
        var dx = cursorX - sh.x, dy = cursorY - sh.y, d = Math.hypot(dx, dy);
        if (sh.stTimer > sh.stDur) { pickNext(sh); break; }
        if (d > 45) { sh.vx += (dx / d) * S * .9; sh.vy += (dy / d) * S * .9; sh.headTarget = Math.max(-30, Math.min(30, dx * .2)); }
        else { sh.vx *= .94; sh.vy *= .94; sh.headTarget = Math.max(-40, Math.min(40, dx * .35)); }
        break;
      }
      case 'social': {
        if (!sh.socialTarget || flock.indexOf(sh.socialTarget) === -1 || sh.socialTarget.state === 'departing') { pickNext(sh); break; }
        var dx = sh.socialTarget.x - sh.x, dy = sh.socialTarget.y - sh.y, d = Math.hypot(dx, dy);
        if (sh.stTimer > sh.stDur) { pickNext(sh); break; }
        if (d > 35) {
          sh.vx += (dx / d) * S * .8; sh.vy += (dy / d) * S * .8;
        } else {
          sh.vx += (sh.socialTarget.vx - sh.vx) * .03;
          sh.vy += (sh.socialTarget.vy - sh.vy) * .03;
          sh.vx *= .95; sh.vy *= .95;
        }
        sh.headTarget = Math.max(-35, Math.min(35, dx * .25));
        break;
      }
      case 'scared': {
        sh.wideEyes = Math.max(sh.wideEyes, 500);
        if (sh.stTimer > sh.stDur) { sh.wideEyes = 0; pickNext(sh); break; }
        var cmx = cursorX - sh.x, cmy = cursorY - sh.y, cmd = Math.hypot(cmx, cmy);
        if (cmd < 100) {
          if (cmd > 1) { sh.vx -= (cmx / cmd) * S * 1.8; sh.vy -= (cmy / cmd) * S * 1.8; }
          sh.propSpeed = Math.min(sh.propSpeed + 3, PROP_MAX);
          sh.scareCorner = nearestCorner(sh.x + (sh.x - cursorX), sh.y + (sh.y - cursorY));
        } else {
          var dcx = sh.scareCorner.x - sh.x, dcy = sh.scareCorner.y - sh.y, dc = Math.hypot(dcx, dcy);
          if (dc > 20) {
            sh.vx += (dcx / dc) * S * .8; sh.vy += (dcy / dc) * S * .8;
          } else {
            sh.vx *= .9; sh.vy *= .9;
            sh.vx += (Math.random() - .5) * .06; sh.vy += (Math.random() - .5) * .06;
          }
        }
        sh.headTarget = Math.max(-40, Math.min(40, cmx * .15 + Math.sin(sh.stTimer * .01) * 5));
        break;
      }
      case 'departing': {
        var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
        if (d > 1) { sh.vx += (dx / d) * S * 1.5; sh.vy += (dy / d) * S * 1.5; }
        sh.headTarget = Math.max(-22, Math.min(22, sh.vx * 5));
        break;
      }
    }
  }

  /* ═══ Herdenverhalten (Boids) ═══ */
  function flockForces(sh) {
    if (flock.length < 2 || sh === dragSheep || sh.state === 'departing' || sh.solo) return;
    var sepX = 0, sepY = 0;
    var aliVX = 0, aliVY = 0, aliN = 0;
    var cohX = 0, cohY = 0, cohN = 0;
    for (var fi = 0; fi < flock.length; fi++) {
      var o = flock[fi];
      if (o === sh || o.state === 'departing') continue;
      var dx = sh.x - o.x, dy = sh.y - o.y, d = Math.hypot(dx, dy);
      if (d < SEPARATION_R && d > 0) { sepX += (dx / d) / d; sepY += (dy / d) / d; }
      if (d < ALIGNMENT_R) { aliVX += o.vx; aliVY += o.vy; aliN++; }
      if (d < COHESION_R) { cohX += o.x; cohY += o.y; cohN++; }
    }
    sh.vx += sepX * SEP_FORCE; sh.vy += sepY * SEP_FORCE;
    if (aliN) { sh.vx += (aliVX / aliN - sh.vx) * ALI_FORCE; sh.vy += (aliVY / aliN - sh.vy) * ALI_FORCE; }
    if (cohN) { var cx = cohX / cohN - sh.x, cy = cohY / cohN - sh.y; sh.vx += cx * COH_FORCE; sh.vy += cy * COH_FORCE; }
  }

  /* ═══ Physik ═══ */
  function physics(sh, dt) {
    /* Aging */
    sh.age += dt;

    if (sh !== dragSheep) {
      sh.throwBoost = Math.max(0, sh.throwBoost - dt);
      var maxSpd = getMaxSpeed(sh);
      var curMax = sh.throwBoost > 0 ? maxSpd + (sh.throwBoost / 500) * 4 : maxSpd;
      var spd = Math.hypot(sh.vx, sh.vy);
      if (spd > curMax) { sh.vx *= curMax / spd; sh.vy *= curMax / spd; }
      sh.vx *= (sh.throwBoost > 0 ? .996 : FRICTION);
      sh.vy *= (sh.throwBoost > 0 ? .996 : FRICTION);

      sh.x += sh.vx * dt * .06; sh.y += sh.vy * dt * .06;

      /* Wandkollision */
      if (sh.state !== 'departing') {
        var preHitSpd = Math.hypot(sh.vx, sh.vy);
        var hit = false;

        /* Oben: OFFEN — Schwerkraft zieht zurück */
        if (sh.y < MARGIN) {
          sh.vy += 0.006 * dt;
        } else {
          if (sh.x < MARGIN)     { sh.x = MARGIN;     sh.vx = Math.abs(sh.vx) * .5; hit = true; }
          if (sh.x > W - MARGIN) { sh.x = W - MARGIN; sh.vx = -Math.abs(sh.vx) * .5; hit = true; }
        }
        if (sh.y > H - MARGIN) { sh.y = H - MARGIN; sh.vy = -Math.abs(sh.vy) * .5; hit = true; }

        if (hit && preHitSpd > 1.0) {
          spawnStars(sh.x, sh.y, 2 + (Math.random() * 2 | 0));
          sh.propSpeed = Math.min(sh.propSpeed + 15, PROP_MAX); sh.wobbleV += (Math.random() - .5) * 16;
          if (sh.throwBoost > 500 && sh.state !== 'scared') {
            makeSheepScared(sh, true);
          }
        }
      }
    }

    sh.bank += ((-sh.vx * 6) - sh.bank) * .12;
    sh.wobbleV -= sh.wobble * .3; sh.wobbleV *= .85; sh.wobble += sh.wobbleV * dt * .06;
    sh.headAngle += (sh.headTarget - sh.headAngle) * .09;

    sh.legDragX += (sh.vx - sh.legDragX) * .04;
    sh.legDragY += (sh.vy - sh.legDragY) * .04;

    var spd2 = Math.hypot(sh.vx, sh.vy);
    var tailTarget = spd2 > 0.3 ? Math.max(-1, Math.min(1, -sh.vx / spd2 * 1.5)) : sh.tailSide * .95;
    sh.tailSide += (tailTarget - sh.tailSide) * .06;

    var vel = Math.hypot(sh.vx, sh.vy);
    sh.propSpeed = Math.max(PROP_BASE + vel * 6, sh.propSpeed * .992);
    sh.propSpeed = Math.min(sh.propSpeed, PROP_MAX);
    sh.propAngle += sh.propSpeed * dt * .07;

    sh.bobPhase += dt; sh.legPhase += dt;

    if (sh.isBlinking) { sh.blinkDur -= dt; if (sh.blinkDur <= 0) { sh.isBlinking = false; sh.blinkTimer = 1500 + Math.random() * 3500; } }
    else { sh.blinkTimer -= dt; if (sh.blinkTimer <= 0) { sh.isBlinking = true; sh.blinkDur = 80 + Math.random() * 50; } }
    if (sh.wideEyes > 0) sh.wideEyes -= dt;

    if (sh.state === 'hover' || sh.state === 'curious') {
      sh.kickCD -= dt;
      if (sh.kickCD <= 0 && sh.kickLeg === -1) { sh.kickLeg = Math.random() * 4 | 0; sh.kickTimer = 250; sh.kickCD = 1500 + Math.random() * 3000; }
    }
    if (sh.kickTimer > 0) { sh.kickTimer -= dt; if (sh.kickTimer <= 0) sh.kickLeg = -1; }
    sh.collisionCD = Math.max(0, sh.collisionCD - dt);
  }

  /* ═══ Sheep-Kollisionen ═══ */
  function sheepCollisions() {
    for (var i = 0; i < flock.length; i++) {
      for (var j = i + 1; j < flock.length; j++) {
        var a = flock[i], b = flock[j];
        if (a.state === 'departing' || b.state === 'departing') continue;
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        var minD = COLLISION_R * (a.sizeMultiplier + b.sizeMultiplier);
        if (d < minD && d > 0) {
          var nx = dx / d, ny = dy / d, overlap = minD - d;
          a.x -= nx * overlap * .5; a.y -= ny * overlap * .5;
          b.x += nx * overlap * .5; b.y += ny * overlap * .5;
          var rv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rv > 0) { a.vx -= nx * rv * .4; a.vy -= ny * rv * .4; b.vx += nx * rv * .4; b.vy += ny * rv * .4; }
          if (rv > 1.5 && a.collisionCD <= 0 && b.collisionCD <= 0) {
            spawnStars((a.x + b.x) / 2, (a.y + b.y) / 2, 2 + (Math.random() * 2 | 0));
            a.wobbleV += (Math.random() - .5) * 8; b.wobbleV += (Math.random() - .5) * 8;
            a.propSpeed = Math.min(a.propSpeed + 10, PROP_MAX); b.propSpeed = Math.min(b.propSpeed + 10, PROP_MAX);
            a.collisionCD = 500; b.collisionCD = 500;
          }
        }
      }
    }
  }

  /* ═══ Render ═══ */
  function rot(lx, ly, a) { var c = Math.cos(a), sn = Math.sin(a); return { x: c * lx - sn * ly, y: sn * lx + c * ly }; }

  function render(sh) {
    var d = sh.dom, tr = sh.traits;
    var bankRad = (sh.bank + sh.wobble) * Math.PI / 180;
    var headRad = sh.headAngle * Math.PI / 180;
    var bob = Math.sin(sh.bobPhase * .006) * 2;
    var hBob = Math.sin(sh.bobPhase * .0045 + 1.5) * 1;

    /* Wrapper: Position + individuelle Größe × sizeMultiplier */
    d.wrap.style.transform = 'translate(' + sh.x + 'px,' + sh.y + 'px) scale(' + (tr.scale * sh.sizeMultiplier) + ')';

    var tx = 0, ty = bob;
    d.torso.style.transform = 'translate(' + (tx - sh.tw / 2) + 'px,' + (ty - sh.th / 2) + 'px) rotate(' + bankRad + 'rad)';

    var labelRotY = sh.tailSide * 65;
    d.label.style.transform = 'translate(-50%,-50%) rotateY(' + labelRotY + 'deg)';

    var ts = tr.tailSize;
    var tailWag = Math.sin(sh.bobPhase * .008) * 0.15;
    var tailLocalX = sh.tailSide * (sh.tw / 2 + ts * .3);
    var tailLocalY = 1;
    var tailPos = rot(tailLocalX, tailLocalY, bankRad);
    var tailX = tx + tailPos.x, tailY = ty + tailPos.y;
    d.tail.style.transform = 'translate(' + (tailX - ts / 2) + 'px,' + (tailY - ts / 2) + 'px) rotate(' + ((tailWag + sh.tailSide * .4) * Math.PI) + 'rad)';

    var headSideX = -sh.tailSide * (sh.tw * 0.38);
    var hOff = rot(headSideX, -5, bankRad);
    var hx = tx + hOff.x, hy = ty + hOff.y + hBob * .3;
    d.head.style.transform = 'translate(' + (hx - sh.hw / 2) + 'px,' + (hy - sh.hh / 2) + 'px) rotate(' + headRad + 'rad)';

    /* Augen */
    var sc = tr.scale * sh.sizeMultiplier;
    var headVX = sh.x + hx * sc, headVY = sh.y + hy * sc;
    var etx, ety;
    if (sh.wideEyes > 0) { etx = sh.vx * 3; ety = sh.vy * 2; }
    else if (sh.state === 'curious') { etx = (cursorX - headVX) * .03; ety = (cursorY - headVY) * .03; }
    else if (sh.state === 'social' && sh.socialTarget) { etx = (sh.socialTarget.x - headVX) * .04; ety = (sh.socialTarget.y - headVY) * .04; }
    else if (sh.state === 'scared') { etx = (cursorX - headVX) * .03; ety = (cursorY - headVY) * .03; }
    else if (sh.state === 'hover') {
      var looked = false;
      for (var fi = 0; fi < flock.length; fi++) { var o = flock[fi]; if (o !== sh && Math.hypot(o.x - sh.x, o.y - sh.y) < 50) { etx = (o.x - headVX) * .04; ety = (o.y - headVY) * .04; looked = true; break; } }
      if (!looked) { etx = Math.sin(sh.headAngle * Math.PI / 180) * 1.5; ety = 0; }
    }
    else { etx = sh.vx * 3; ety = sh.vy * 2; }
    etx = Math.max(-2, Math.min(2, etx)); ety = Math.max(-1.5, Math.min(1.5, ety));
    sh.eyeX += (etx - sh.eyeX) * .15; sh.eyeY += (ety - sh.eyeY) * .15;
    var ee = sh.isBlinking ? ' scaleY(0.1)' : sh.wideEyes > 0 ? ' scale(1.5)' : '';
    d.eyeL.style.transform = 'translate(' + sh.eyeX + 'px,' + sh.eyeY + 'px)' + ee;
    d.eyeR.style.transform = 'translate(' + sh.eyeX + 'px,' + sh.eyeY + 'px)' + ee;

    /* Propeller */
    var topX = hx - Math.sin(headRad) * (sh.hr + 1);
    var topY = hy - Math.cos(headRad) * (sh.hr + 1);
    var hd = sh.hr + POLE_H + 1;
    var hubX = hx - Math.sin(headRad) * hd, hubY = hy - Math.cos(headRad) * hd;
    var pdx = hubX - topX, pdy = hubY - topY, pL = Math.hypot(pdx, pdy);
    d.pole.style.height = pL + 'px'; d.pole.style.left = topX + 'px'; d.pole.style.top = topY + 'px';
    d.pole.style.transform = 'translateX(-50%) rotate(' + Math.atan2(pdx, -pdy) + 'rad)';
    d.hub.style.left = (hubX - HUB_SZ / 2) + 'px'; d.hub.style.top = (hubY - HUB_SZ / 2) + 'px';
    d.bwrap.style.left = (hubX - 14) + 'px'; d.bwrap.style.top = (hubY - 14) + 'px';
    d.blades.style.transform = 'rotateX(55deg) rotate(' + sh.propAngle + 'deg)';
    d.blades.style.opacity = Math.max(.25, 1 - (sh.propSpeed - PROP_BASE) / (PROP_MAX - PROP_BASE) * .75);

    /* Beine */
    var vel = Math.hypot(sh.vx, sh.vy);
    var legEls = [d.lfl, d.lfr, d.lbl, d.lbr];
    var dragDiffX = (sh.legDragX - sh.vx) * 4;
    var dragDiffY = (sh.legDragY - sh.vy) * 3.5;
    for (var i = 0; i < 4; i++) {
      var lp = tr.legs[i], hip = rot(lp.lx, lp.ly, bankRad);
      var hpX = tx + hip.x, hpY = ty + hip.y;
      var freq = .006 + vel * .005, amp = 5 + vel * 8;
      var idle = Math.sin(sh.legPhase * freq + tr.legPhases[i]) * amp;
      var sway = sh.legDragX * 3.5 * (i < 2 ? 1 : .7);
      var inertia = dragDiffX * (i < 2 ? 1.2 : .8);
      var lift = -sh.legDragY * 2.5;
      var kick = 0;
      if (i === sh.kickLeg && sh.kickTimer > 0) kick = Math.sin((1 - sh.kickTimer / 250) * Math.PI) * 35;
      var angle = tr.legRestAngles[i] + idle + sway + inertia + lift + kick;
      legEls[i].style.transform = 'translate(' + (hpX - LEG_W / 2) + 'px,' + hpY + 'px) rotate(' + (angle * Math.PI / 180) + 'rad)';
    }
  }

  /* ═══ Stars ═══ */
  function spawnStars(x, y, n) {
    for (var i = 0; i < n; i++) {
      var el = document.createElement('div'); el.className = 'star'; el.textContent = '\u2B50';
      var a = (Math.PI * 2 / n) * i + (Math.random() - .5), dd = 14 + Math.random() * 22;
      el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;font-size:' + (6 + Math.random() * 4) + 'px;';
      el.style.setProperty('--dx', Math.cos(a) * dd + 'px'); el.style.setProperty('--dy', Math.sin(a) * dd + 'px');
      overlay.appendChild(el); setTimeout(function (e) { e.remove(); }, 450, el);
    }
  }

  /* ═══ Drag ═══ */
  var dragSheep = null, dragOX = 0, dragOY = 0, dragLX = 0, dragLY = 0, dragLT = 0;
  var velBuf = [];

  function findNearest(x, y) {
    var best = null, bestD = 40;
    for (var fi = 0; fi < flock.length; fi++) {
      var sh = flock[fi];
      if (sh.state === 'departing') continue;
      var effectiveR = 40 * sh.sizeMultiplier;
      var d = Math.hypot(sh.x - x, sh.y - y);
      if (d < effectiveR && d < bestD * sh.sizeMultiplier) { best = sh; bestD = d / sh.sizeMultiplier; }
    }
    return best;
  }

  /* Capture-phase: intercept clicks near sheep before page elements get them */
  document.addEventListener('pointerdown', function (e) {
    if (flock.length === 0) return;
    var sh = findNearest(e.clientX, e.clientY);
    if (!sh) return;
    e.preventDefault(); e.stopPropagation();
    dragSheep = sh;
    dragOX = sh.x - e.clientX; dragOY = sh.y - e.clientY;
    dragLX = e.clientX; dragLY = e.clientY; dragLT = performance.now();
    velBuf.length = 0;
    /* Herde aufscheuchen */
    for (var fi = 0; fi < flock.length; fi++) {
      var o = flock[fi];
      if (o === sh) continue;
      var dx = o.x - sh.x, dy = o.y - sh.y, d = Math.hypot(dx, dy) || 1;
      o.vx += (dx / d) * 2.5; o.vy += (dy / d) * 2.5;
      o.propSpeed = Math.min(o.propSpeed + 15, PROP_MAX);
      o.wideEyes = Math.max(o.wideEyes, 600);
      o.state = 'dart'; o.target = { x: o.x + (dx / d) * 120, y: o.y + (dy / d) * 120 };
      o.stTimer = 0; o.stDur = 800 + Math.random() * 600;
    }
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (!dragSheep) return; e.preventDefault();
    var now = performance.now(), dtt = now - dragLT;
    if (dtt > 1) {
      velBuf.push({ vx: (e.clientX - dragLX) / dtt * 16, vy: (e.clientY - dragLY) / dtt * 16, t: now });
      while (velBuf.length && now - velBuf[0].t > 80) velBuf.shift();
    }
    dragSheep.x = e.clientX + dragOX; dragSheep.y = e.clientY + dragOY;
    if (dtt > 1) {
      dragSheep.vx += ((e.clientX - dragLX) / dtt * 12 - dragSheep.vx) * .3;
      dragSheep.vy += ((e.clientY - dragLY) / dtt * 12 - dragSheep.vy) * .3;
    }
    dragLX = e.clientX; dragLY = e.clientY; dragLT = now;
    dragSheep.propSpeed = Math.min(dragSheep.propSpeed + .5, PROP_MAX);
  });

  document.addEventListener('pointerup', function () {
    if (!dragSheep) return;
    var ax = 0, ay = 0;
    if (velBuf.length) { for (var vi = 0; vi < velBuf.length; vi++) { ax += velBuf[vi].vx; ay += velBuf[vi].vy; } ax /= velBuf.length; ay /= velBuf.length; }
    dragSheep.vx = ax * .8; dragSheep.vy = ay * .8;
    dragSheep.throwBoost = 2500; dragSheep.resumeDelay = 1200;
    dragSheep.wobbleV += (Math.random() - .5) * 12;
    velBuf.length = 0; dragSheep = null;
  });

  /* ═══ Persistence ═══ */
  function serializeFlock() {
    var sheep = [];
    for (var i = 0; i < flock.length; i++) {
      var sh = flock[i];
      sheep.push({
        x: sh.x, y: sh.y, vx: sh.vx, vy: sh.vy,
        traits: sh.traits,
        ownerId: sh.ownerId, letter: sh.letter,
        sizeMultiplier: sh.sizeMultiplier, age: sh.age,
        state: sh.state, tailSide: sh.tailSide,
        solo: sh.solo, bank: sh.bank, propSpeed: sh.propSpeed,
      });
    }
    return { version: 1, timestamp: Date.now(), sheep: sheep };
  }

  function saveFlock() {
    if (dismissed) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializeFlock()));
    } catch (e) { /* quota exceeded — ignore */ }
  }

  function restoreFlock() {
    var raw;
    try { raw = sessionStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || data.version !== 1 || !Array.isArray(data.sheep)) return;
    var elapsed = Math.max(0, Date.now() - (data.timestamp || 0));
    for (var i = 0; i < data.sheep.length; i++) {
      var s = data.sheep[i];
      /* Clamp position to current viewport */
      var x = Math.max(MARGIN, Math.min(W - MARGIN, s.x || W / 2));
      var y = Math.max(MARGIN, Math.min(H - MARGIN, s.y || H / 2));
      createSheep(x, y, s.ownerId, s.letter, {
        traits: s.traits,
        sizeMultiplier: s.sizeMultiplier || 1,
        age: (s.age || 0) + elapsed,
        vx: s.vx || 0, vy: s.vy || 0,
        state: s.state || 'explore',
        tailSide: s.tailSide || 0,
        solo: s.solo,
        bank: s.bank || 0,
        propSpeed: s.propSpeed || 15,
      });
    }
  }

  /* Auto-save every 3s */
  setInterval(saveFlock, SAVE_INTERVAL);
  window.addEventListener('beforeunload', saveFlock);

  /* ═══ Haupt-Loop ═══ */
  var lastT = 0;
  function frame(t) {
    var dt = lastT ? Math.min(t - lastT, 40) : 16;
    lastT = t;
    for (var fi = 0; fi < flock.length; fi++) {
      var sh = flock[fi];
      behave(sh, dt, t); flockForces(sh); physics(sh, dt); render(sh);
      /* Solo-Timer */
      if (sh.state !== 'scared' && sh.state !== 'departing') {
        sh.soloTimer -= dt;
        if (sh.soloTimer <= 0) {
          sh.solo = !sh.solo;
          sh.soloTimer = sh.solo ? 6000 + Math.random() * 15000 : 4000 + Math.random() * 10000;
        }
      }
    }
    sheepCollisions();
    /* Cleanup: Schafe die den Screen verlassen haben */
    for (var i = flock.length - 1; i >= 0; i--) {
      var sh = flock[i];
      if (sh === dragSheep) continue;
      /* Departing: off-screen */
      if (sh.state === 'departing' && (sh.x < -60 || sh.x > W + 60 || sh.y < -60 || sh.y > H + 60)) {
        removeSheep(sh); continue;
      }
      /* Rausgeworfen: weit genug oben → weg */
      if (sh.y < -80) {
        removeSheep(sh);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ═══ Public API ═══ */
  window.flyingSheep = {
    spawn: function (x, y, ownerId, letter) {
      /* Existiert schon ein Schaf mit dieser ownerId? → wachsen */
      if (ownerId) {
        for (var i = 0; i < flock.length; i++) {
          if (flock[i].ownerId === String(ownerId)) {
            var sh = flock[i];
            sh.sizeMultiplier = Math.min(2.5, sh.sizeMultiplier + 0.25);
            sh.wobbleV += (Math.random() > .5 ? 1 : -1) * 14;
            sh.wideEyes = 600;
            sh.propSpeed = Math.min(sh.propSpeed + 20, PROP_MAX);
            saveFlock();
            return sh;
          }
        }
      }
      /* Bei MAX_SHEEP: ältestes entfernen */
      if (flock.length >= MAX_SHEEP) {
        var oldest = flock[0], oldestAge = flock[0].age;
        for (var i = 1; i < flock.length; i++) {
          if (flock[i].age > oldestAge) { oldest = flock[i]; oldestAge = flock[i].age; }
        }
        removeSheep(oldest);
      }
      var sh = createSheep(x, y, String(ownerId || ''), letter);
      sh.propSpeed = PROP_MAX * 0.7;
      sh.state = 'dart';
      sh.target = newTarget();
      sh.stTimer = 0;
      sh.stDur = 800 + Math.random() * 600;
      saveFlock();
      return sh;
    },
    scare: function (fx, fy) {
      for (var fi = 0; fi < flock.length; fi++) {
        var sh = flock[fi];
        if (fx !== undefined && fy !== undefined) {
          var dx = sh.x - fx, dy = sh.y - fy, d = Math.hypot(dx, dy) || 1;
          sh.vx = (dx / d) * (4 + Math.random() * 2); sh.vy = (dy / d) * (3 + Math.random()) - 2.5;
        } else {
          sh.vx = (Math.random() - .5) * 5; sh.vy = -4.5 - Math.random() * 2;
        }
        sh.propSpeed = PROP_MAX; sh.wobbleV = (Math.random() - .5) * 24;
        sh.wideEyes = 1000; sh.throwBoost = 2500; sh.resumeDelay = 1500 + Math.random() * 800;
        sh.state = 'dart'; sh.target = { x: sh.x + sh.vx * 40, y: sh.y + sh.vy * 40 }; sh.stTimer = 0; sh.stDur = 800;
      }
    },
    count: function () { return flock.length; },
    save: saveFlock,
    dismiss: function (tx, ty) {
      dismissed = true;
      for (var fi = 0; fi < flock.length; fi++) {
        var sh = flock[fi];
        sh.state = 'departing';
        sh.target = { x: tx !== undefined ? tx : sh.x, y: ty !== undefined ? ty : -100 };
        sh.stTimer = 0;
        sh.propSpeed = PROP_MAX;
      }
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    },
  };

  /* ═══ Start ═══ */
  restoreFlock();
  requestAnimationFrame(frame);
  window.addEventListener('resize', function () { W = innerWidth; H = innerHeight; });

})();
