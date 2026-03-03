(function () {
  'use strict';

  const overlay = document.getElementById('sheep-overlay');
  if (!overlay) return;

  /* ═══ Accessoire-Config (aus Admin-Umkleide) ═══ */
  function sheepCfg() { return window.__sheepConfig || {}; }

  /* ═══ Constants ═══ */
  const HEAD_R = 5, HEAD_W = 12, HEAD_H = 12;
  const TORSO_W = 17, TORSO_H = 14;
  const LEG_W = 2, LEG_H = 8;
  const POLE_H = 3, HUB_SZ = 4;
  let W = innerWidth, H = innerHeight;

  const PROP_BASE = 8, PROP_MAX = 90;
  function darkenColor(hex) {
    var r, g, b;
    if (hex.length === 4) { r = parseInt(hex[1]+hex[1],16); g = parseInt(hex[2]+hex[2],16); b = parseInt(hex[3]+hex[3],16); }
    else { r = parseInt(hex.substr(1,2),16); g = parseInt(hex.substr(3,2),16); b = parseInt(hex.substr(5,2),16); }
    r = Math.round(r * 0.65); g = Math.round(g * 0.65); b = Math.round(b * 0.65);
    return '#' + ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
  }
  const BASE_MAX_SPEED = 2.0;
  const BASE_STEER = 0.045;
  const FRICTION = 0.98;
  const MARGIN = 35;
  const MAX_SHEEP = 10;

  /* Aging: 5min → 20min linear ramp */
  const AGE_START = 5 * 60 * 1000;   // 300 000 ms
  const AGE_FULL  = 20 * 60 * 1000;  // 1 200 000 ms

  /* Herde */
  const SEPARATION_R = 55, ALIGNMENT_R = 90, COHESION_R = 120;
  const SEP_FORCE = 0.08, ALI_FORCE = 0.006, COH_FORCE = 0.0015;
  const COLLISION_R = 16;
  const DESYNC_R = 65, DESYNC_FORCE = 0.12;

  const STORAGE_KEY = 'flyingSheepState';
  const SAVE_INTERVAL = 3000;

  /* Physics tuning */
  const DT_SCALE = 0.06;          // Position-Integrationsfaktor (sh.x += sh.vx * dt * DT_SCALE)
  const HOVER_DAMP = 0.94;        // Geschwindigkeits-Dämpfung beim Hovern/Idle
  const BANK_LERP = 0.12;         // Bank-Winkel Interpolation
  const HEAD_LERP = 0.09;         // Kopfwinkel Interpolation
  const WOBBLE_SPRING = 0.3;      // Wobble-Federkonstante
  const WOBBLE_DAMP = 0.85;       // Wobble-Dämpfung
  const EYE_LERP = 0.15;          // Augen-Blickrichtung Interpolation
  const LEG_DRAG_LERP = 0.04;     // Bein-Trägheit Interpolation
  const STAR_DURATION = 450;      // Star-Animations-Dauer (ms)

  /* ═══ Cursor ═══ */
  let cursorX = W / 2, cursorY = H / 2, cursorLastMove = 0;
  /* Annoyance-Tracker: erkennt ob User genervt ist (schnelle Mausbewegungen nahe Schafen) */
  var annoyance = 0;                   // 0 = chill, 100 = maximal genervt
  var cursorPrevX = W / 2, cursorPrevY = H / 2, cursorPrevT = 0;
  document.addEventListener('mousemove', function (e) {
    cursorX = e.clientX; cursorY = e.clientY;
    var now = performance.now();
    var dtt = now - cursorPrevT;
    /* Annoyance nur alle 100ms pruefen (spart Flock-Iteration) */
    if (dtt > 100) {
      var speed = Math.hypot(e.clientX - cursorPrevX, e.clientY - cursorPrevY) / dtt;
      if (speed > 2.5) {
        var nearSheep = false;
        for (var i = 0; i < flock.length; i++) {
          if (Math.hypot(flock[i].x - e.clientX, flock[i].y - e.clientY) < 120) { nearSheep = true; break; }
        }
        if (nearSheep) annoyance = Math.min(100, annoyance + speed * 1.5);
      }
      cursorPrevX = e.clientX; cursorPrevY = e.clientY; cursorPrevT = now;
    }
    cursorLastMove = now;
  });

  /* ═══ Flock ═══ */
  var flock = [];
  var dismissed = false;
  var flockDirty = false;
  function markDirty() { flockDirty = true; }

  /* ═══ Aging helpers ═══ */
  function getAgeFactor(sh) {
    if (sh.age < AGE_START) return 0;
    return Math.min(1, (sh.age - AGE_START) / (AGE_FULL - AGE_START));
  }
  function getMaxSpeed(sh) {
    var sizeFactor = 1 / Math.sqrt(sh.sizeMultiplier);
    var energyFactor = sh.traits.energy != null ? sh.traits.energy : 1;
    return BASE_MAX_SPEED * sizeFactor * energyFactor * (1 - getAgeFactor(sh) * 0.6);
  }
  function getSteer(sh) {
    var sizeFactor = 1 / Math.sqrt(sh.sizeMultiplier);
    var energyFactor = sh.traits.energy != null ? sh.traits.energy : 1;
    return BASE_STEER * sizeFactor * energyFactor * (1 - getAgeFactor(sh) * 0.7);
  }

  /* ═══ Traits ═══ */
  function generateTraits() {
    var isBlack = Math.random() < 0.08;
    var scale = 0.6 + Math.random() * 0.8;
    var chub = 0.7 + Math.random() * 0.7;
    var legMul = 0.9 + Math.random() * 0.8;
    var headMul = 0.75 + Math.random() * 0.5;
    var woolColors = ['white', 'white', 'white', '#f5f0e0', '#eee', '#f0e6d3',
                      '#e8ddd0', '#f5e6f0', '#e0f0e8', '#f0f0d8', '#ffe8d6'];
    var woolColor = isBlack ? '#3a3a3a' : woolColors[Math.random() * woolColors.length | 0];
    var borderColor = isBlack ? '#1a1a1a' : '#444';
    var skinColor = isBlack ? '#2a2a2a' : '#444';
    var accColors = ['#e44', '#44e', '#4a4', '#e4e', '#fa0', '#0cd', '#f80', '#c44'];
    var accColor = accColors[Math.random() * accColors.length | 0];
    var sCfg = sheepCfg();
    var hatCount = 25 + ((sCfg.spriteHat && sCfg.spriteHat.customSlots) || []).length;
    var glCount = 32 + ((sCfg.spriteGlasses && sCfg.spriteGlasses.customSlots) || []).length;
    var stCount = 12 + ((sCfg.spriteStache && sCfg.spriteStache.customSlots) || []).length;
    var spriteHat = Math.random() < 0.55 ? (Math.random() * hatCount | 0) : -1;
    var spriteGlasses = Math.random() < 0.40 ? (Math.random() * glCount | 0) : -1;
    var spriteStache = Math.random() < 0.35 ? (Math.random() * stCount | 0) : -1;
    var spriteBody = -1;  // nur via Epic-Meilenstein
    var spriteTail = -1;  // nur via Epic-Meilenstein
    /* Accessoire-Pool: nur kompatible Typen einfügen */
    var accPool = ['bowtie', 'bell', 'flower', 'scarf', 'shoes'];
    if (spriteHat < 0) accPool.push('tophat', 'partyhat', 'crown', 'beanie');
    if (spriteGlasses < 0) accPool.push('glasses');
    var accChance = 0.50 + accPool.length * 0.03;
    var accessory = Math.random() < accChance ? accPool[Math.random() * accPool.length | 0] : null;
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
    // Persönlichkeit: beeinflusst Verhalten pro Schaf
    var energy = 0.4 + Math.random() * 1.2;       // 0.4–1.6: faul bis hyperaktiv
    var curiosity = 0.3 + Math.random() * 1.0;    // 0.3–1.3: ängstlich bis neugierig
    var sociability = Math.random();               // 0–1: Einzelgänger bis Herdentier
    var hasKnees = Math.random() < 0.4;
    // Propeller-Varianten
    var propBladeCount = [2, 2, 2, 3, 3, 4][Math.random() * 6 | 0];
    var propBladeColors = ['#ffd740', '#ffd740', '#ff6b6b', '#69db7c', '#74c0fc', '#da77f2', '#ffa94d', '#e8e8e8'];
    var propBladeColor = propBladeColors[Math.random() * propBladeColors.length | 0];
    var propHubColor = Math.random() < 0.7 ? '#666' : darkenColor(propBladeColor);
    var propSize = +(0.7 + Math.random() * 0.6).toFixed(2);
    var propShapes = ['standard', 'standard', 'standard', 'round', 'slim', 'teardrop'];
    var propShape = propShapes[Math.random() * propShapes.length | 0];
    return { scale: scale, chub: chub, legMul: legMul, headMul: headMul, woolColor: woolColor, borderColor: borderColor, skinColor: skinColor, isBlack: isBlack, accessory: accessory, accColor: accColor, legs: legs, legPhases: legPhases, legRestAngles: legRestAngles, tailSize: tailSize, spriteHat: spriteHat, spriteGlasses: spriteGlasses, spriteStache: spriteStache, spriteBody: spriteBody, spriteTail: spriteTail, energy: energy, curiosity: curiosity, sociability: sociability, hasKnees: hasKnees, propBladeCount: propBladeCount, propBladeColor: propBladeColor, propHubColor: propHubColor, propSize: propSize, propShape: propShape };
  }

  /* ═══ DOM-Factory: Sub-Funktionen ═══ */

  function createFace(head, tr, fc) {
    var earL = document.createElement('div'); earL.className = 's-ear l'; head.appendChild(earL);
    var earR = document.createElement('div'); earR.className = 's-ear r'; head.appendChild(earR);
    var earColor = tr.isBlack ? '#2a2a2a' : '#f4c7b0';
    earL.style.background = earR.style.background = earColor;
    earL.style.border = earR.style.border = '.8px solid ' + tr.borderColor;
    if (fc.earY != null) { earL.style.top = fc.earY + 'px'; earR.style.top = fc.earY + 'px'; }
    if (fc.earLeftX != null) earL.style.left = fc.earLeftX + 'px';
    if (fc.earRightX != null) earR.style.right = fc.earRightX + 'px';
    var eyeL = document.createElement('div'); eyeL.className = 's-eye l'; head.appendChild(eyeL);
    var eyeR = document.createElement('div'); eyeR.className = 's-eye r'; head.appendChild(eyeR);
    /* Augen höher setzen wenn Schnurrbart vorhanden, damit nichts überlagert */
    var eyeYBase = (fc.eyeY != null) ? fc.eyeY : (tr.spriteStache >= 0 ? 2 : null);
    if (eyeYBase != null) { eyeL.style.top = eyeYBase + 'px'; eyeR.style.top = eyeYBase + 'px'; }
    if (fc.eyeLeftX != null) eyeL.style.left = fc.eyeLeftX + 'px';
    if (fc.eyeRightX != null) eyeR.style.right = fc.eyeRightX + 'px';
    var mouth = document.createElement('div'); mouth.className = 's-mouth'; head.appendChild(mouth);
    if (fc.mouthY != null) mouth.style.bottom = fc.mouthY + 'px';
    if (tr.isBlack) { eyeL.style.background = eyeR.style.background = '#eee'; mouth.style.borderColor = tr.borderColor; }
    return { eyeL: eyeL, eyeR: eyeR };
  }

  function createPropeller(wrap, mk, tr) {
    var pole = mk('s-pole'); var hub = mk('s-hub');
    var bwrap = mk('s-bwrap');
    var blades = document.createElement('div'); blades.className = 's-blades'; bwrap.appendChild(blades);
    var pBC = tr.propBladeCount || 2;
    var pColor = tr.propBladeColor || '#ffd740';
    var pHubC = tr.propHubColor || '#666';
    var pSz = tr.propSize || 1.0;
    var pShape = tr.propShape || 'standard';
    blades.style.setProperty('--bl-dark', darkenColor(pColor));
    blades.style.setProperty('--bl-light', pColor);
    hub.style.setProperty('--hub-color', pHubC);
    var hubSzInit = HUB_SZ * pSz;
    hub.style.width = hubSzInit + 'px'; hub.style.height = hubSzInit + 'px';
    var bwSz = Math.round(28 * pSz);
    bwrap.style.width = bwSz + 'px'; bwrap.style.height = bwSz + 'px';
    var shapeClass = pShape !== 'standard' ? ' s-bl--' + pShape : '';
    for (var bi = 0; bi < pBC; bi++) {
      var bl = document.createElement('div'); bl.className = 's-bl' + shapeClass;
      if (pSz !== 1 && bi > 0) bl.style.transform = 'rotate(' + (bi * (360 / pBC)) + 'deg) scale(' + pSz + ')';
      else if (pSz !== 1 && bi === 0) bl.style.transform = 'scale(' + pSz + ')';
      else if (bi > 0) bl.style.transform = 'rotate(' + (bi * (360 / pBC)) + 'deg)';
      blades.appendChild(bl);
    }
    return { pole: pole, hub: hub, bwrap: bwrap, blades: blades, propSize: pSz };
  }

  var cssAccDefY = {tophat:-9,partyhat:-12,crown:-7,beanie:-5,glasses:2.5,bowtie:-3,bell:-2,flower:-1,scarf:-2.5,shoes:-2};

  function applyCssAccOff(el, type, cssAccCfg) {
    var c = cssAccCfg[type]; if (!c) return;
    if (c.offsetY) el.style.top = ((cssAccDefY[type] || 0) + c.offsetY) + 'px';
    if (c.offsetX) el.style.marginLeft = c.offsetX + 'px';
    if (c.scale && c.scale !== 1) { var t = el.style.transform || ''; el.style.transform = t + ' scale(' + c.scale + ')'; }
  }

  function attachCssAccessory(head, torso, legEls, shinEls, tr, cfg) {
    var cssAccCfg = cfg.cssAccessories || {};
    var acc = tr.accessory;
    if (!acc) return;
    if (acc === 'shoes') {
      for (var si = 0; si < legEls.length; si++) {
        var shoe = document.createElement('div'); shoe.className = 's-shoe'; shoe.style.background = tr.accColor;
        /* Bei Kniegelenken: Schuh ans Schienbein, nicht an den Oberschenkel */
        var target = (shinEls && shinEls[si]) ? shinEls[si] : legEls[si];
        target.appendChild(shoe);
      }
      return;
    }
    var el = document.createElement('div');
    var parent = head;
    if (acc === 'tophat') { el.className = 's-acc s-tophat'; el.style.background = tr.isBlack ? '#555' : '#222'; }
    else if (acc === 'partyhat') { el.className = 's-acc s-partyhat'; el.style.borderBottomColor = tr.accColor; el.style.borderBottomWidth = '10px'; }
    else if (acc === 'crown') { el.className = 's-acc s-crown'; }
    else if (acc === 'beanie') { el.className = 's-acc s-beanie'; el.style.background = tr.accColor; }
    else if (acc === 'glasses') {
      el.className = 's-acc s-glasses';
      var lens1 = document.createElement('span'); lens1.className = 's-lens';
      var lens2 = document.createElement('span'); lens2.className = 's-lens';
      var bridge = document.createElement('span'); bridge.className = 's-bridge';
      el.appendChild(lens1); el.appendChild(lens2); el.appendChild(bridge);
    }
    else if (acc === 'bowtie') { el.className = 's-acc s-bowtie'; el.style.borderLeftColor = el.style.borderRightColor = tr.accColor; el.style.borderLeftWidth = el.style.borderRightWidth = '3.5px'; parent = torso; }
    else if (acc === 'bell') { el.className = 's-acc s-bell'; }
    else if (acc === 'flower') { el.className = 's-acc s-flower'; el.style.background = tr.accColor; }
    else if (acc === 'scarf') { el.className = 's-acc s-scarf'; el.style.background = tr.accColor; }
    parent.appendChild(el);
    applyCssAccOff(el, acc, cssAccCfg);
  }

  function applySpriteOverlay(head, el, idx, spriteCfg, defaults) {
    var customSlots = spriteCfg.customSlots || [];
    var defaultCount = defaults.defaultCount || 16;
    var item;

    if (idx >= defaultCount && customSlots[idx - defaultCount]) {
      // Custom Slot → Einzelbild
      var cs = customSlots[idx - defaultCount];
      item = cs;
      if (cs.image) {
        el.style.backgroundImage = 'url(' + cs.image + ')';
        el.style.backgroundSize = 'contain';
        el.style.backgroundPosition = 'center';
      }
    } else {
      item = (spriteCfg.items && spriteCfg.items[idx]) || {};
      if (item.customImage) {
        // Default-Slot mit ersetztem Bild
        el.style.backgroundImage = 'url(' + item.customImage + ')';
        el.style.backgroundSize = 'contain';
        el.style.backgroundPosition = 'center';
      } else {
        // Standard: Spritesheet
        if (spriteCfg.customSheet) el.style.backgroundImage = 'url(' + spriteCfg.customSheet + ')';
        var cols = spriteCfg.cols || defaults.cols;
        var slotW = spriteCfg.slotW || defaults.slotW;
        var slotH = spriteCfg.slotH || defaults.slotH;
        var col = idx % cols, row = (idx / cols) | 0;
        el.style.backgroundPosition = -(col * slotW) + 'px ' + -(row * slotH) + 'px';
      }
    }

    var posY = (spriteCfg.offsetY != null ? spriteCfg.offsetY : defaults.offsetY) + (item.dY || 0);
    el.style[defaults.posYProp || 'top'] = posY + 'px';
    var totalX = (spriteCfg.offsetX || 0) + (item.dX || 0);
    if (totalX) el.style.left = 'calc(50% + ' + totalX + 'px)';
    var totalS = (spriteCfg.scale != null ? spriteCfg.scale : defaults.scale) * (item.dS || 1);
    if (totalS !== 1) el.style.transform = 'translateX(-50%) scale(' + totalS + ')';
    head.appendChild(el);
  }

  function applyCustomSpriteOverlay(parent, el, idx, spriteCfg, defaults) {
    var customSlots = spriteCfg.customSlots || [];
    var cs = customSlots[idx];
    if (!cs) return;
    var item = cs;
    if (cs.image) {
      el.style.backgroundImage = 'url(' + cs.image + ')';
      el.style.backgroundSize = 'contain';
      el.style.backgroundPosition = 'center';
    }
    var posY = (spriteCfg.offsetY || 0) + (item.dY || 0);
    el.style.top = posY + 'px';
    var totalX = (spriteCfg.offsetX || 0) + (item.dX || 0);
    if (totalX) el.style.left = totalX + 'px';
    var totalS = (spriteCfg.scale != null ? spriteCfg.scale : 1) * (item.dS || 1);
    if (totalS !== 1) el.style.transform = 'scale(' + totalS + ')';
    parent.appendChild(el);
  }

  function attachSpriteOverlays(head, tr, cfg, torso, tail) {
    if (tr.spriteHat >= 0) {
      var hatEl = document.createElement('div');
      var hatCfg = cfg.spriteHat || {};
      var wigHasCustom = tr.spriteHat >= 16 && tr.spriteHat < 25 && hatCfg.items && hatCfg.items[tr.spriteHat] && hatCfg.items[tr.spriteHat].customImage;
      if (tr.spriteHat >= 16 && tr.spriteHat < 25 && !wigHasCustom) {
        hatEl.className = 's-sprite-wig';
        var wigIdx = tr.spriteHat - 16;
        var wigCol = wigIdx % 3, wigRow = (wigIdx / 3) | 0;
        hatEl.style.backgroundPosition = (wigCol * 50) + '% ' + (wigRow * 50) + '%';
        head.appendChild(hatEl);
      } else {
        hatEl.className = 's-sprite-hat';
        applySpriteOverlay(head, hatEl, tr.spriteHat, hatCfg,
          { cols: 4, slotW: 9.85, slotH: 8.85, offsetY: -8, scale: 1, defaultCount: 25 });
      }
    }
    if (tr.spriteGlasses >= 0) {
      var glEl = document.createElement('div');
      glEl.className = 's-sprite-glasses';
      applySpriteOverlay(head, glEl, tr.spriteGlasses, cfg.spriteGlasses || {},
        { cols: 4, slotW: 16.975, slotH: 8.3375, offsetY: 1.5, scale: 0.65, defaultCount: 32 });
    }
    if (tr.spriteStache >= 0) {
      var stEl = document.createElement('div');
      stEl.className = 's-sprite-stache';
      applySpriteOverlay(head, stEl, tr.spriteStache, cfg.spriteStache || {},
        { cols: 3, slotW: 40, slotH: 30, offsetY: -1, scale: 0.25, posYProp: 'bottom', defaultCount: 12 });
    }
    var bodySprite = null;
    if (tr.spriteBody >= 0 && torso) {
      var bodyCfg = cfg.spriteBody || {};
      var customSlots = bodyCfg.customSlots || [];
      var cs = customSlots[tr.spriteBody];
      if (cs) {
        bodySprite = document.createElement('div');
        bodySprite.className = 's-sprite-body epic-shimmer';
        bodySprite.style.width = torso.style.width;
        bodySprite.style.height = torso.style.height;
        bodySprite.style.borderRadius = '50%';
        if (cs.image) {
          bodySprite.style.backgroundImage = 'url(' + cs.image + ')';
          bodySprite.style.backgroundSize = 'contain';
          bodySprite.style.backgroundPosition = 'center';
        }
        var bsY = (bodyCfg.offsetY || 0) + (cs.dY || 0);
        var bsX = (bodyCfg.offsetX || 0) + (cs.dX || 0);
        var bsS = (bodyCfg.scale != null ? bodyCfg.scale : 1) * (cs.dS || 1);
        bodySprite.dataset.offsetY = String(bsY);
        bodySprite.dataset.offsetX = String(bsX);
        bodySprite.dataset.spriteScale = String(bsS);
        torso.parentNode.appendChild(bodySprite);
      }
    }
    if (tr.spriteTail >= 0 && tail) {
      var tlEl = document.createElement('div');
      tlEl.className = 's-sprite-tail epic-shimmer';
      applyCustomSpriteOverlay(tail, tlEl, tr.spriteTail, cfg.spriteTail || {});
      tail.style.background = 'none';
      tail.style.border = 'none';
    }
    return bodySprite;
  }

  /* ═══ DOM-Factory ═══ */
  function createSheepDOM(tr, letter, skipMount) {
    var cfg = sheepCfg();
    var wrap = document.createElement('div');
    wrap.className = 's-wrap';
    if (!skipMount) overlay.appendChild(wrap);
    var mk = function (cls) { var el = document.createElement('div'); el.className = 'p ' + cls; wrap.appendChild(el); return el; };

    var tw = TORSO_W * tr.chub, th = TORSO_H;
    var hw = HEAD_W * tr.headMul, hh = HEAD_H * tr.headMul;
    var lh = LEG_H * tr.legMul;

    /* Körper-Elemente (Reihenfolge = z-order) */
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

    /* Beine + Kniegelenke */
    var legEls = [lfl, lfr, lbl, lbr];
    var shinEls = [null, null, null, null];
    if (tr.hasKnees) {
      var thighH = Math.round(lh * 0.5);
      var shinH = lh - thighH;
      for (var li = 0; li < legEls.length; li++) {
        legEls[li].style.cssText += 'height:' + thighH + 'px;background:' + tr.skinColor + ';';
        var shin = document.createElement('div');
        shin.className = 's-shin';
        shin.style.cssText = 'position:absolute;left:0;top:' + (thighH - 2) + 'px;width:' + LEG_W + 'px;height:' + shinH + 'px;background:' + tr.skinColor + ';border-radius:1px;transform-origin:1px 0;';
        legEls[li].appendChild(shin);
        shinEls[li] = shin;
      }
    } else {
      for (var li = 0; li < legEls.length; li++) legEls[li].style.cssText += 'height:' + lh + 'px;background:' + tr.skinColor + ';';
    }

    /* Gesicht */
    var face = createFace(head, tr, cfg.face || {});

    /* Propeller */
    var prop = createPropeller(wrap, mk, tr);

    /* Accessoire + Sprite-Overlays */
    attachCssAccessory(head, torso, legEls, shinEls, tr, cfg);
    var bodySprite = attachSpriteOverlays(head, tr, cfg, torso, tail);

    /* Namens-Bubble: zeigt ownerName über dem Schaf (erste 10s + beim Draggen) */
    var nameEl = document.createElement('div');
    nameEl.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);pointer-events:none;z-index:100;background:rgba(0,0,0,.72);color:#fff;font:600 .7rem/1 system-ui,sans-serif;padding:3px 8px;border-radius:8px;white-space:nowrap;display:none;transition:opacity .6s;';
    wrap.appendChild(nameEl);

    /* Debug-Label: zeigt aktuellen State unter dem Schaf (Konsole: SHEEP_DEBUG=true) */
    var debugEl = document.createElement('div');
    debugEl.style.cssText = 'position:absolute;left:50%;top:18px;transform:translateX(-50%);font:600 7px/1 monospace;color:#f00;white-space:nowrap;pointer-events:none;z-index:99;text-shadow:0 0 2px #fff,0 0 2px #fff;display:none;';
    wrap.appendChild(debugEl);

    return {
      wrap: wrap, torso: torso, head: head, tail: tail, label: labelEl,
      lfl: lfl, lfr: lfr, lbl: lbl, lbr: lbr, shinEls: shinEls,
      pole: prop.pole, hub: prop.hub, bwrap: prop.bwrap, blades: prop.blades,
      eyeL: face.eyeL, eyeR: face.eyeR, propSize: prop.propSize,
      bodySprite: bodySprite, nameEl: nameEl, debugEl: debugEl
    };
  }

  /* ═══ Schaf erzeugen ═══ */
  function createSheep(x, y, ownerId, letter, opts) {
    opts = opts || {};
    var traits = opts.traits || generateTraits();
    var dom = createSheepDOM(traits, letter || '', opts._skipMount);
    var sheep = {
      dom: dom, traits: traits,
      tw: TORSO_W * traits.chub, th: TORSO_H,
      hw: HEAD_W * traits.headMul, hh: HEAD_H * traits.headMul,
      hr: HEAD_R * traits.headMul,
      ownerId: ownerId || null,
      ownerName: (opts && opts.ownerName) || '',
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
      blinkTimer: (1500 + Math.random() * 3000) / (traits.energy || 1), isBlinking: false, blinkDur: 0,
      wideEyes: 0, kickLeg: -1, kickTimer: 0, kickCD: (1500 + Math.random() * 2500) / (traits.energy || 1),
      socialTarget: null, collisionCD: 0,
      scareCorner: null, canSpreadFear: false,
      solo: opts.solo != null ? opts.solo : Math.random() < (1 - (traits.sociability != null ? traits.sociability : 0.5)),
      soloTimer: (15000 + Math.random() * 30000) + (Math.random() < (1 - (traits.sociability != null ? traits.sociability : 0.5)) ? (1 - (traits.sociability || 0.5)) * 240000 : (traits.sociability || 0.5) * 240000),
      tailSide: opts.tailSide || 0,
      legDragX: 0, legDragY: 0,
      groupData: null, headbuttPartner: null, headbuttPhase: 0,
      followTarget: null, bullyTarget: null, fenceJumpPhase: 'wait',
      dizzyPhase: 0, greetTarget: null, greetPhase: 0, showNameTimer: 0,
      stuckTimer: 0, lastCheckX: x, lastCheckY: y,
      scoreCounts: opts.scoreCounts || { alle9: 0, kranz: 0 },
    };
    sheep.target = newTarget();
    /* Sofort positionieren damit kein Frame bei (0,0) sichtbar ist */
    dom.wrap.style.transform = 'translate(' + sheep.x + 'px,' + sheep.y + 'px) scale(' + (traits.scale * sheep.sizeMultiplier) + ')';
    flock.push(sheep);
    return sheep;
  }

  function logSheepDeath(sheep, deathCause) {
    var csrfMeta = document.querySelector('meta[name="csrf-token"]');
    if (!csrfMeta) return;
    var payload = {
      ownerId: sheep.ownerId || '',
      ownerName: sheep.ownerName || '',
      letter: sheep.letter || '',
      traits: sheep.traits,
      sizeMultiplier: sheep.sizeMultiplier,
      ageMs: sheep.age,
      deathCause: deathCause
    };
    fetch('/api/sheep-graveyard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfMeta.content },
      body: JSON.stringify(payload)
    }).catch(function() {});
  }

  function removeSheep(sheep, deathCause) {
    var i = flock.indexOf(sheep);
    if (i === -1) return;
    flock.splice(i, 1);
    sheep.dom.wrap.remove();
    if (deathCause) logSheepDeath(sheep, deathCause);
    saveFlock(true);
  }

  /* ═══ Targets ═══ */
  function edgeTarget() {
    /* Zufaellige Position am Bildschirmrand */
    var side = Math.random() * 4 | 0;
    var pad = MARGIN + 10;
    if (side === 0) return { x: pad + Math.random() * 60, y: pad + Math.random() * (H - pad * 2) };
    if (side === 1) return { x: W - pad - Math.random() * 60, y: pad + Math.random() * (H - pad * 2) };
    if (side === 2) return { x: pad + Math.random() * (W - pad * 2), y: pad + Math.random() * 60 };
    return { x: pad + Math.random() * (W - pad * 2), y: H - pad - Math.random() * 60 };
  }
  function newTarget() {
    /* Bei hoher Annoyance: bevorzugt Rand-Positionen */
    if (annoyance > 30 && Math.random() < annoyance / 100) return edgeTarget();
    var p = window.flyingSheepPerch;
    if (p && Math.random() < .7) return { x: p.x + (Math.random() - .5) * 70, y: p.y + (Math.random() - .5) * 40 };
    return { x: MARGIN + Math.random() * (W - MARGIN * 2), y: MARGIN + Math.random() * (H - MARGIN * 2) };
  }
  function nearTarget(sh, d) {
    if (annoyance > 30 && Math.random() < annoyance / 100) return edgeTarget();
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
    var cur = sh.traits.curiosity != null ? sh.traits.curiosity : 0.8;
    // Neugierige Schafe: kürzere Schreckdauer (1.3→×0.6, 0.3→×0.95)
    var scareMul = 1.05 - cur * 0.35;
    sh.state = 'scared'; sh.stTimer = 0; sh.stDur = (8000 + Math.random() * 7000) * scareMul;
    sh.scareCorner = nearestCorner(sh.x, sh.y);
    sh.wideEyes = sh.stDur + 1000; sh.propSpeed = PROP_MAX;
    sh.canSpreadFear = canSpread;
    if (canSpread) {
      for (var fi = 0; fi < flock.length; fi++) {
        var o = flock[fi];
        if (o === sh || o.state === 'scared') continue;
        // Neugierige Schafe lassen sich weniger leicht anstecken
        var oCur = o.traits.curiosity != null ? o.traits.curiosity : 0.8;
        var fearRadius = 100 - oCur * 25; // 0.3→92px, 1.3→68px
        if (Math.hypot(o.x - sh.x, o.y - sh.y) < fearRadius) makeSheepScared(o, false);
      }
    }
  }

  /* ═══ Gewichtete Verhaltenswahl ═══ */
  function weightedPick(options) {
    var total = 0;
    for (var i = 0; i < options.length; i++) total += options[i].w;
    var r = Math.random() * total;
    for (var i = 0; i < options.length; i++) {
      r -= options[i].w;
      if (r <= 0) return options[i].id;
    }
    return options[options.length - 1].id;
  }

  /* ═══ Verhalten ═══ */
  function pickNext(sh) {
    if (sh.state === 'scared' || sh.state === 'departing' || sh.state === 'dizzy' || isGroupState(sh.state)) return;

    var en = sh.traits.energy != null ? sh.traits.energy : 1;
    var cur = sh.traits.curiosity != null ? sh.traits.curiosity : 0.8;
    var soc = sh.traits.sociability != null ? sh.traits.sociability : 0.5;
    var curOK = (performance.now() - cursorLastMove) < 4000 && Math.hypot(sh.x - cursorX, sh.y - cursorY) > 60;
    var prevState = sh.state;

    /* Gewichte je nach Solo/Herde aufbauen */
    var opts;
    if (sh.solo) {
      opts = [
        { id: 'explore', w: 5 + en * 3 },
        { id: 'dart',    w: 3 + en * 5 },
        { id: 'zigzag',  w: 2 + en * 3 },
        { id: 'circle',  w: 3 + (1 - en) * 3 },
        { id: 'hover',   w: 4 + (1 - en) * 5 },
      ];
      if (curOK) opts.push({ id: 'curious', w: 3 + cur * 8 });
    } else {
      opts = [
        { id: 'explore', w: 4 + en * 2 },
        { id: 'dart',    w: 3 + en * 4 },
        { id: 'hover',   w: 3 + (1 - en) * 4 },
        { id: 'circle',  w: 2 + (1 - en) * 2 },
        { id: 'zigzag',  w: 2 + en * 2 },
      ];
      if (curOK) opts.push({ id: 'curious', w: 3 + cur * 8 });
      if (flock.length > 1) opts.push({ id: 'social', w: 5 + soc * 8 });
    }

    /* Vorlieben-Wiederholung: vorheriges Verhalten +50% Gewicht */
    if (prevState !== 'hover' && prevState !== 'scared') {
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].id === prevState) { opts[i].w *= 1.5; break; }
      }
    }

    var chosen = weightedPick(opts);

    /* State + Trait-beeinflusste Dauer setzen
       Dauern: bewusst lang (30s–3min), damit Persoenlichkeit erkennbar wird.
       Kegeln dauert 2h — Schafe duerfen minutenlang dasselbe tun. */
    sh.stTimer = 0;
    switch (chosen) {
      case 'hover':
        sh.state = 'hover';
        /* Faule: 30–90s, Energische: 8–25s */
        sh.stDur = (8000 + Math.random() * 25000) * (2.5 - en);
        break;
      case 'explore':
        sh.state = 'explore';
        sh.target = newTarget();
        /* 30–90s, Energische etwas kuerzer */
        sh.stDur = (30000 + Math.random() * 60000) * (1.1 - en * 0.2);
        sh.propSpeed = Math.min(sh.propSpeed + 6, PROP_MAX);
        break;
      case 'dart':
        sh.state = 'dart';
        sh.target = sh.solo ? newTarget() : nearTarget(sh, 200);
        /* Dart bleibt kurz (3–8s) — schneller Sprint, dann naechste Aktion */
        sh.stDur = (3000 + Math.random() * 5000) * (0.6 + en * 0.4);
        sh.propSpeed = Math.min(sh.propSpeed + 12, PROP_MAX);
        break;
      case 'zigzag':
        sh.state = 'zigzag';
        sh.target = newTarget();
        /* 15–40s */
        sh.stDur = 15000 + Math.random() * 25000;
        break;
      case 'circle':
        sh.state = 'circle';
        sh.orbitRadius = (sh.solo ? 80 : 60) + Math.random() * (sh.solo ? 120 : 90);
        sh.orbitDir = Math.random() > .5 ? 1 : -1;
        /* Zentrum versetzt: nicht auf dem Schaf, sondern Radius-weit daneben */
        var cOffAngle = Math.random() * Math.PI * 2;
        sh.orbitCenter = { x: sh.x + Math.cos(cOffAngle) * sh.orbitRadius, y: sh.y + Math.sin(cOffAngle) * sh.orbitRadius };
        /* Startwinkel: Schaf ist schon am Rand des Kreises */
        sh.orbitAngle = cOffAngle + Math.PI;
        /* 20–60s */
        sh.stDur = 20000 + Math.random() * 40000;
        break;
      case 'curious':
        sh.state = 'curious';
        /* 20–60s, Neugierige noch laenger */
        sh.stDur = (20000 + Math.random() * 40000) * (0.8 + cur * 0.4);
        break;
      case 'social':
        sh.state = 'social';
        var others = flock.filter(function (o) { return o !== sh && o.state !== 'departing'; });
        if (!others.length) { sh.state = 'explore'; sh.target = newTarget(); sh.stDur = 15000; return; }
        sh.socialTarget = others[Math.random() * others.length | 0];
        /* 30s–2min, Gesellige noch laenger */
        sh.stDur = (30000 + Math.random() * 60000) * (0.6 + soc * 0.6);
        break;
    }
  }

  /* ═══ Gruppenaktionen ═══ */
  var GROUP_STATES = ['headbutt', 'followLeader', 'followLine', 'circleDance', 'fenceJump', 'bully', 'dance', 'greet'];
  var groupCooldown = 5000 + Math.random() * 5000;

  function isGroupState(state) {
    return GROUP_STATES.indexOf(state) !== -1;
  }

  function getAvailableSheep() {
    var available = [];
    for (var i = 0; i < flock.length; i++) {
      var sh = flock[i];
      if (sh === dragSheep) continue;
      if (sh.state === 'scared' || sh.state === 'departing') continue;
      if (isGroupState(sh.state)) continue;
      if (sh.resumeDelay > 0 || sh.throwBoost > 0) continue;
      available.push(sh);
    }
    return available;
  }

  function endGroupAction(sh) {
    sh.groupData = null;
    sh.headbuttPartner = null;
    sh.headbuttPhase = 0;
    sh.followTarget = null;
    sh.bullyTarget = null;
    sh.fenceJumpPhase = 'wait';
    /* Scatter-Impuls damit Schafe nicht kleben bleiben */
    sh.vx += (Math.random() - 0.5) * 3;
    sh.vy += (Math.random() - 0.5) * 3;
    sh.state = 'hover';
    pickNext(sh);
  }

  function tryGroupAction() {
    var available = getAvailableSheep();
    if (available.length < 2) return;
    var possible = [];
    if (available.length >= 2) { possible.push('headbutt'); possible.push('bully'); possible.push('dance'); }
    if (available.length >= 3) possible.push('followLeader');
    if (available.length >= 4) possible.push('circleDance');
    if (available.length >= 5) possible.push('fenceJump');
    var action = possible[Math.random() * possible.length | 0];
    switch (action) {
      case 'headbutt': startHeadbutt(available); break;
      case 'bully': startBully(available); break;
      case 'dance': startDance(available); break;
      case 'followLeader': startFollowLeader(available); break;
      case 'circleDance': startCircleDance(available); break;
      case 'fenceJump': startFenceJump(available); break;
    }
  }

  function startHeadbutt(available) {
    var a = null, b = null, bestD = Infinity;
    for (var i = 0; i < available.length; i++) {
      for (var j = i + 1; j < available.length; j++) {
        var d = Math.hypot(available[i].x - available[j].x, available[i].y - available[j].y);
        if (d < bestD) { bestD = d; a = available[i]; b = available[j]; }
      }
    }
    if (!a || !b) return;
    var dur = 8000 + Math.random() * 7000;
    a.state = 'headbutt'; a.stTimer = 0; a.stDur = dur;
    a.groupData = { type: 'headbutt' }; a.headbuttPartner = b; a.headbuttPhase = 0;
    b.state = 'headbutt'; b.stTimer = 0; b.stDur = dur;
    b.groupData = { type: 'headbutt' }; b.headbuttPartner = a; b.headbuttPhase = 0;
  }

  function startBully(available) {
    var biggest = available[0], smallest = available[0];
    for (var i = 1; i < available.length; i++) {
      var sz = available[i].sizeMultiplier * available[i].traits.scale;
      if (sz > biggest.sizeMultiplier * biggest.traits.scale) biggest = available[i];
      if (sz < smallest.sizeMultiplier * smallest.traits.scale) smallest = available[i];
    }
    if (biggest === smallest) return;
    var bigSz = biggest.sizeMultiplier * biggest.traits.scale;
    var smallSz = smallest.sizeMultiplier * smallest.traits.scale;
    if (bigSz < smallSz * 1.2) return;
    var dur = 15000 + Math.random() * 20000;
    biggest.state = 'bully'; biggest.stTimer = 0; biggest.stDur = dur;
    biggest.groupData = { type: 'bully' }; biggest.bullyTarget = smallest;
  }

  function startFollowLeader(available) {
    var leaderIdx = Math.random() * available.length | 0;
    var leader = available[leaderIdx];
    var others = [];
    for (var i = 0; i < available.length; i++) { if (available[i] !== leader) others.push(available[i]); }
    others.sort(function (a, b) {
      return Math.hypot(a.x - leader.x, a.y - leader.y) - Math.hypot(b.x - leader.x, b.y - leader.y);
    });
    var maxF = Math.min(4, others.length);
    var followers = others.slice(0, maxF);
    if (followers.length < 2) return;
    var dur = 30000 + Math.random() * 60000;
    var data = { type: 'followLeader', leader: leader, followers: followers };
    leader.state = 'followLeader'; leader.stTimer = 0; leader.stDur = dur;
    leader.groupData = data; leader.target = newTarget();
    for (var i = 0; i < followers.length; i++) {
      var f = followers[i];
      f.state = 'followLine'; f.stTimer = 0; f.stDur = dur;
      f.groupData = data;
      f.followTarget = i === 0 ? leader : followers[i - 1];
    }
  }

  function startCircleDance(available) {
    var n = Math.min(available.length, 6);
    var cx = 0, cy = 0;
    for (var i = 0; i < available.length; i++) { cx += available[i].x; cy += available[i].y; }
    cx /= available.length; cy /= available.length;
    available.sort(function (a, b) {
      return Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy);
    });
    var participants = available.slice(0, n);
    cx = 0; cy = 0;
    for (var i = 0; i < participants.length; i++) { cx += participants[i].x; cy += participants[i].y; }
    cx /= participants.length; cy /= participants.length;
    var dur = 20000 + Math.random() * 40000;
    var radius = 40 + Math.random() * 20;
    var dir = Math.random() > 0.5 ? 1 : -1;
    var center = { x: cx, y: cy };
    var data = { type: 'circleDance', center: center };
    for (var i = 0; i < participants.length; i++) {
      var sh = participants[i];
      sh.state = 'circleDance'; sh.stTimer = 0; sh.stDur = dur;
      sh.groupData = data;
      sh.orbitCenter = center;
      sh.orbitAngle = (Math.PI * 2 / participants.length) * i;
      sh.orbitRadius = radius;
      sh.orbitDir = dir;
    }
  }

  function startDance(available) {
    var a = available[Math.random() * available.length | 0];
    var others = [];
    for (var i = 0; i < available.length; i++) { if (available[i] !== a) others.push(available[i]); }
    if (!others.length) return;
    others.sort(function (x, y) { return Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y); });
    var b = others[0];
    var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    var radius = 30 + Math.random() * 25;
    var dur = 20000 + Math.random() * 40000;
    var dir = Math.random() > 0.5 ? 1 : -1;
    var center = { x: cx, y: cy };
    var data = { type: 'dance', center: center, partner: [a, b] };
    a.state = 'dance'; a.stTimer = 0; a.stDur = dur;
    a.groupData = data; a.orbitCenter = center;
    a.orbitAngle = 0; a.orbitRadius = radius; a.orbitDir = dir;
    b.state = 'dance'; b.stTimer = 0; b.stDur = dur;
    b.groupData = data; b.orbitCenter = center;
    b.orbitAngle = Math.PI; b.orbitRadius = radius; b.orbitDir = dir;
  }

  function startFenceJump(available) {
    var n = Math.min(available.length, 7);
    available.sort(function (a, b) { return a.x - b.x; });
    var participants = available.slice(0, n);
    var fenceX = W / 2;
    var dur = n * 4000 + 10000;
    var data = { type: 'fenceJump', fenceX: fenceX, activeIdx: 0, participants: participants };
    for (var i = 0; i < participants.length; i++) {
      var sh = participants[i];
      sh.state = 'fenceJump'; sh.stTimer = 0; sh.stDur = dur;
      sh.groupData = data;
      sh.fenceJumpPhase = i === 0 ? 'jump' : 'wait';
    }
  }

  /* ═══ Steering-Helper ═══ */
  function steerTo(sh, tx, ty, strength) {
    var dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
    if (d > 1) { sh.vx += (dx / d) * strength; sh.vy += (dy / d) * strength; }
    return d;
  }

  /* ═══ State-Handler (je ein Verhalten) ═══ */
  function behaveHover(sh) {
    sh.vx *= HOVER_DAMP; sh.vy *= HOVER_DAMP;
    sh.headTarget = Math.sin(sh.stTimer * .005) * 35;
    if (sh.stTimer > sh.stDur) pickNext(sh);
  }

  function behaveDart(sh, dt, t, S) {
    var d = Math.hypot(sh.target.x - sh.x, sh.target.y - sh.y);
    if (sh.stTimer > sh.stDur) { pickNext(sh); return; }
    if (d < 20) { sh.target = sh.solo ? newTarget() : nearTarget(sh, 200); }
    steerTo(sh, sh.target.x, sh.target.y, S * 1.4);
    sh.headTarget = Math.max(-22, Math.min(22, sh.vx * 5));
  }

  function behaveExplore(sh, dt, t, S) {
    var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
    if (sh.stTimer > sh.stDur) { pickNext(sh); return; }
    if (d < 25) { sh.target = newTarget(); dx = sh.target.x - sh.x; dy = sh.target.y - sh.y; d = Math.hypot(dx, dy); }
    var nx = dx / d, ny = dy / d, arr = Math.min(1, d / 60);
    var w = Math.sin(t * .001 + sh.stTimer * .001 + sh.bobPhase) * .5;
    var c = Math.cos(w), sn = Math.sin(w);
    sh.vx += (nx * c - ny * sn) * S * arr; sh.vy += (nx * sn + ny * c) * S * arr;
    sh.headTarget = Math.max(-20, Math.min(20, sh.vx * 5));
  }

  function behaveCircle(sh, dt, t, S) {
    sh.orbitAngle += dt * .005 * sh.orbitDir;
    var tx = sh.orbitCenter.x + Math.cos(sh.orbitAngle) * sh.orbitRadius;
    var ty = sh.orbitCenter.y + Math.sin(sh.orbitAngle) * sh.orbitRadius;
    steerTo(sh, tx, ty, S * 1.8);
    sh.propSpeed = Math.min(sh.propSpeed + 0.5, PROP_MAX * 0.7);
    sh.headTarget = Math.max(-30, Math.min(30, sh.vx * 5));
    if (sh.stTimer > sh.stDur) pickNext(sh);
  }

  function behaveZigzag(sh, dt, t, S) {
    var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
    if (sh.stTimer > sh.stDur) { pickNext(sh); return; }
    if (d < 25) { sh.target = newTarget(); dx = sh.target.x - sh.x; dy = sh.target.y - sh.y; d = Math.hypot(dx, dy); }
    var nx = dx / d, ny = dy / d;
    /* Starke seitliche Auslenkung: langsame Frequenz (.002), grosser Winkel (2.2 rad ≈ 126°) */
    var zig = Math.sin(sh.stTimer * .002) * 2.2, c = Math.cos(zig), sn = Math.sin(zig);
    sh.vx += (nx * c - ny * sn) * S * 1.4; sh.vy += (nx * sn + ny * c) * S * 1.4;
    sh.headTarget = Math.sin(sh.stTimer * .002) * 40;
    sh.propSpeed = Math.min(sh.propSpeed + 0.3, PROP_MAX * 0.6);
  }

  function behaveCurious(sh, dt, t, S) {
    var dx = cursorX - sh.x, dy = cursorY - sh.y, d = Math.hypot(dx, dy);
    if (sh.stTimer > sh.stDur) { pickNext(sh); return; }
    var cur = sh.traits.curiosity != null ? sh.traits.curiosity : 0.8;
    var minDist = 60 - cur * 20; // 0.3→54px, 1.3→34px – neugierigere kommen näher
    var approach = .7 + cur * .25; // 0.3→0.78, 1.3→1.03 – neugierigere steuern schneller
    if (d > minDist) { sh.vx += (dx / d) * S * approach; sh.vy += (dy / d) * S * approach; sh.headTarget = Math.max(-30, Math.min(30, dx * .2)); }
    else { sh.vx *= HOVER_DAMP; sh.vy *= HOVER_DAMP; sh.headTarget = Math.max(-40, Math.min(40, dx * .35)); }
  }

  function behaveSocial(sh, dt, t, S) {
    if (!sh.socialTarget || flock.indexOf(sh.socialTarget) === -1 || sh.socialTarget.state === 'departing') {
      /* Neues Social-Target suchen statt sofort aufzugeben */
      var others = flock.filter(function (o) { return o !== sh && o.state !== 'departing'; });
      if (others.length) { sh.socialTarget = others[Math.random() * others.length | 0]; }
      else { pickNext(sh); return; }
    }
    var dx = sh.socialTarget.x - sh.x, dy = sh.socialTarget.y - sh.y, d = Math.hypot(dx, dy);
    if (sh.stTimer > sh.stDur) { pickNext(sh); return; }
    if (d > 35) {
      sh.vx += (dx / d) * S * .8; sh.vy += (dy / d) * S * .8;
    } else {
      sh.vx += (sh.socialTarget.vx - sh.vx) * .03;
      sh.vy += (sh.socialTarget.vy - sh.vy) * .03;
      sh.vx *= .95; sh.vy *= .95;
    }
    sh.headTarget = Math.max(-35, Math.min(35, dx * .25));
  }

  function behaveScared(sh, dt, t, S) {
    sh.wideEyes = Math.max(sh.wideEyes, 500);
    sh.propSpeed = Math.min(sh.propSpeed + 1.5, PROP_MAX);
    if (sh.stTimer > sh.stDur) { sh.wideEyes = 0; sh.state = 'hover'; pickNext(sh); return; }
    var cmx = cursorX - sh.x, cmy = cursorY - sh.y, cmd = Math.hypot(cmx, cmy);
    if (cmd < 150) {
      /* Panik: schnelle Flucht weg vom Cursor */
      if (cmd > 1) { sh.vx -= (cmx / cmd) * S * 2.8; sh.vy -= (cmy / cmd) * S * 2.8; }
      sh.propSpeed = PROP_MAX;
      sh.scareCorner = nearestCorner(sh.x + (sh.x - cursorX), sh.y + (sh.y - cursorY));
    } else {
      /* In Ecke fluechten, dort zittern */
      if (!sh.scareCorner) sh.scareCorner = nearestCorner(sh.x, sh.y);
      var dcx = sh.scareCorner.x - sh.x, dcy = sh.scareCorner.y - sh.y, dc = Math.hypot(dcx, dcy);
      if (dc > 20) {
        sh.vx += (dcx / dc) * S * 1.5; sh.vy += (dcy / dc) * S * 1.5;
      } else {
        /* In der Ecke: zittern */
        sh.vx *= .85; sh.vy *= .85;
        sh.vx += (Math.random() - .5) * .3; sh.vy += (Math.random() - .5) * .3;
        sh.wobbleV += (Math.random() - .5) * 4;
      }
    }
    sh.headTarget = Math.max(-45, Math.min(45, cmx * .2 + Math.sin(sh.stTimer * .015) * 8));
  }

  function behaveHeadbutt(sh, dt, t, S) {
    if (!sh.headbuttPartner || flock.indexOf(sh.headbuttPartner) === -1 || sh.headbuttPartner.state !== 'headbutt') { endGroupAction(sh); return; }
    var partner = sh.headbuttPartner;
    var dx = partner.x - sh.x, dy = partner.y - sh.y, d = Math.hypot(dx, dy);
    if (sh.headbuttPhase === 0) {
      if (d > 15) {
        sh.vx += (dx / d) * S * 1.3; sh.vy += (dy / d) * S * 1.3;
        sh.headTarget = Math.max(-30, Math.min(30, Math.atan2(dy, dx) * 180 / Math.PI));
      } else {
        sh.headbuttPhase = 1;
        spawnStars((sh.x + partner.x) / 2, (sh.y + partner.y) / 2, 4 + (Math.random() * 3 | 0));
        sh.wobbleV += (Math.random() > 0.5 ? 1 : -1) * 14;
        sh.wideEyes = 1500;
        var rx = sh.x - partner.x, ry = sh.y - partner.y, rd = Math.hypot(rx, ry) || 1;
        sh.vx = (rx / rd) * 3; sh.vy = (ry / rd) * 3;
        sh.propSpeed = Math.min(sh.propSpeed + 20, PROP_MAX);
        sh.stDur = sh.stTimer + 800;
      }
    } else {
      sh.vx *= 0.92; sh.vy *= 0.92;
      if (sh.stTimer > sh.stDur) endGroupAction(sh);
    }
  }

  function behaveFollowLeader(sh, dt, t, S) {
    var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
    if (d < 40) sh.target = newTarget();
    d = Math.hypot(sh.target.x - sh.x, sh.target.y - sh.y);
    var nx = (sh.target.x - sh.x) / (d || 1), ny = (sh.target.y - sh.y) / (d || 1);
    /* Leader fliegt in sanften Kurven: leichte Sinuswelle senkrecht zur Flugrichtung */
    var curve = Math.sin(sh.stTimer * .0015) * 0.6;
    var cnx = nx * Math.cos(curve) - ny * Math.sin(curve);
    var cny = nx * Math.sin(curve) + ny * Math.cos(curve);
    sh.vx += cnx * S * 1.3; sh.vy += cny * S * 1.3;
    sh.propSpeed = Math.min(sh.propSpeed + 0.5, PROP_MAX * 0.6);
    sh.headTarget = Math.max(-25, Math.min(25, sh.vx * 6));
    if (sh.stTimer > sh.stDur) {
      if (sh.groupData && sh.groupData.followers) {
        for (var gi = 0; gi < sh.groupData.followers.length; gi++) endGroupAction(sh.groupData.followers[gi]);
      }
      endGroupAction(sh);
    }
  }

  function behaveFollowLine(sh, dt, t, S) {
    if (!sh.followTarget || flock.indexOf(sh.followTarget) === -1 || (sh.followTarget.state !== 'followLeader' && sh.followTarget.state !== 'followLine')) { endGroupAction(sh); return; }
    var ft = sh.followTarget;
    var ftSpd = Math.hypot(ft.vx, ft.vy);
    var gap = 18; /* enger dran als vorher (25) */
    var behindX, behindY;
    if (ftSpd > 0.3) { behindX = ft.x - (ft.vx / ftSpd) * gap; behindY = ft.y - (ft.vy / ftSpd) * gap; }
    else { behindX = ft.x; behindY = ft.y + gap; }
    var dx = behindX - sh.x, dy = behindY - sh.y, d = Math.hypot(dx, dy);
    /* Proportionale Kraft: je weiter weg desto staerker nachjagen */
    var urgency = Math.min(2.5, 1.0 + d / 40);
    if (d > 3) { sh.vx += (dx / d) * S * urgency; sh.vy += (dy / d) * S * urgency; }
    else { sh.vx += ft.vx * 0.1; sh.vy += ft.vy * 0.1; sh.vx *= 0.96; sh.vy *= 0.96; }
    sh.propSpeed = Math.min(sh.propSpeed + 0.3, PROP_MAX * 0.55);
    sh.headTarget = Math.max(-25, Math.min(25, (ft.x - sh.x) * 0.4));
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  function behaveCircleDance(sh, dt, t, S) {
    if (!sh.groupData) { endGroupAction(sh); return; }
    sh.orbitAngle += dt * 0.002 * sh.orbitDir;
    var center = sh.groupData.center;
    steerTo(sh, center.x + Math.cos(sh.orbitAngle) * sh.orbitRadius, center.y + Math.sin(sh.orbitAngle) * sh.orbitRadius, S * 1.4);
    sh.headTarget = Math.max(-40, Math.min(40, (center.x - sh.x) * 0.4));
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  function behaveFenceJump(sh, dt, t, S) {
    if (!sh.groupData) { endGroupAction(sh); return; }
    var gd = sh.groupData;
    var myIdx = gd.participants.indexOf(sh);
    if (sh.fenceJumpPhase === 'wait') {
      var waitX = Math.max(MARGIN + 20, gd.fenceX - 80 - Math.max(0, myIdx - gd.activeIdx) * 30);
      sh.vx += (waitX - sh.x) * 0.003; sh.vy *= 0.92; sh.vx *= 0.95;
      sh.headTarget = Math.sin(sh.stTimer * 0.005) * 15;
      if (myIdx === gd.activeIdx) sh.fenceJumpPhase = 'jump';
    } else if (sh.fenceJumpPhase === 'jump') {
      var jumpTarget = gd.fenceX + 80;
      sh.vx += (jumpTarget - sh.x) * 0.005;
      if (sh.x < gd.fenceX) sh.vy -= 0.08;
      else sh.vy += 0.04;
      sh.propSpeed = Math.min(sh.propSpeed + 2, PROP_MAX);
      sh.headTarget = Math.max(-20, Math.min(20, sh.vx * 4));
      if (sh.x > gd.fenceX + 60) {
        sh.fenceJumpPhase = 'done';
        gd.activeIdx++;
        if (gd.activeIdx < gd.participants.length) gd.participants[gd.activeIdx].fenceJumpPhase = 'jump';
      }
    } else {
      sh.vx *= 0.92; sh.vy *= 0.92;
      sh.headTarget = Math.sin(sh.stTimer * 0.004) * 20;
    }
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  function behaveDance(sh, dt, t, S) {
    if (!sh.groupData) { endGroupAction(sh); return; }
    var partner = sh.groupData.partner[0] === sh ? sh.groupData.partner[1] : sh.groupData.partner[0];
    if (flock.indexOf(partner) === -1 || partner.state !== 'dance') { endGroupAction(sh); return; }
    sh.orbitAngle += dt * 0.003 * sh.orbitDir;
    var center = sh.groupData.center;
    steerTo(sh, center.x + Math.cos(sh.orbitAngle) * sh.orbitRadius, center.y + Math.sin(sh.orbitAngle) * sh.orbitRadius, S * 1.3);
    sh.headTarget = Math.max(-35, Math.min(35, (partner.x - sh.x) * 0.35));
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  function behaveBully(sh, dt, t, S) {
    if (!sh.bullyTarget || flock.indexOf(sh.bullyTarget) === -1) { endGroupAction(sh); return; }
    var target = sh.bullyTarget;
    var dx = target.x - sh.x, dy = target.y - sh.y, d = Math.hypot(dx, dy);
    if (!sh.bullyPhase) sh.bullyPhase = 'charge';
    if (sh.bullyPhase === 'charge') {
      /* Anlauf: schnell und aggressiv auf Ziel zu */
      sh.vx += (dx / (d || 1)) * S * 2.5; sh.vy += (dy / (d || 1)) * S * 2.5;
      sh.propSpeed = Math.min(sh.propSpeed + 2, PROP_MAX);
      sh.headTarget = Math.max(-35, Math.min(35, dx * 0.3));
      if (d < 18) {
        /* Treffer! Ziel wegschleudern */
        var nd = d || 1;
        var pushForce = 6 + Math.random() * 3;
        target.vx += (target.x - sh.x) / nd * pushForce;
        target.vy += (target.y - sh.y) / nd * pushForce;
        target.wobbleV += (Math.random() - 0.5) * 22;
        target.wideEyes = 2500;
        target.propSpeed = Math.min(target.propSpeed + 30, PROP_MAX);
        spawnStars((sh.x + target.x) / 2, (sh.y + target.y) / 2, 4 + (Math.random() * 3 | 0));
        /* Bully prallt kurz zurueck */
        sh.vx = -(target.x - sh.x) / nd * 2; sh.vy = -(target.y - sh.y) / nd * 2;
        sh.wobbleV += (Math.random() - 0.5) * 8;
        sh.bullyPhase = 'retreat';
        sh.bullyPauseTimer = 800 + Math.random() * 600;
        if (!sh.bullyHits) sh.bullyHits = 0;
        sh.bullyHits++;
      }
    } else if (sh.bullyPhase === 'retreat') {
      /* Kurze Pause nach Treffer, dann wieder angreifen */
      sh.vx *= 0.92; sh.vy *= 0.92;
      sh.bullyPauseTimer -= dt;
      sh.headTarget = Math.max(-30, Math.min(30, dx * 0.2));
      if (sh.bullyPauseTimer <= 0) {
        /* Nach 3-5 Treffern aufhoeren */
        if (sh.bullyHits >= 3 + (Math.random() * 3 | 0)) {
          sh.bullyHits = 0; sh.bullyPhase = null;
          endGroupAction(sh);
          return;
        }
        sh.bullyPhase = 'charge';
      }
    }
    if (sh.state === 'bully' && sh.stTimer > sh.stDur) {
      sh.bullyHits = 0; sh.bullyPhase = null;
      endGroupAction(sh);
    }
  }

  function behaveDizzy(sh, dt) {
    sh.wideEyes = Math.max(sh.wideEyes, 300);
    if (sh.dizzyPhase === 0) {
      sh.propSpeed = Math.max(PROP_BASE, sh.propSpeed * 0.92);
      if (Math.random() < 0.1) sh.propSpeed = Math.min(sh.propSpeed + 15, PROP_MAX * 0.4);
      sh.vy += 0.15;
      sh.vx *= 0.95;
      sh.wobbleV += (Math.random() - 0.5) * 5;
      sh.headTarget = Math.sin(sh.stTimer * 0.015) * 35;
      if (sh.y >= H - MARGIN - 5 || sh.stTimer > 1500) {
        sh.dizzyPhase = 1;
        sh.stTimer = 0; sh.stDur = 2000 + Math.random() * 2000;
        sh.vy = -1.5;
        sh.wobbleV += (Math.random() > 0.5 ? 1 : -1) * 15;
        spawnStars(sh.x, sh.y, 3 + (Math.random() * 2 | 0));
      }
    } else {
      sh.wobbleV += (Math.random() - 0.5) * 3;
      sh.headTarget = Math.sin(sh.stTimer * 0.007) * 45;
      sh.vx += Math.sin(sh.stTimer * 0.004 + sh.bobPhase) * 0.08;
      sh.vy += Math.cos(sh.stTimer * 0.003) * 0.04;
      sh.vx *= 0.96; sh.vy *= 0.96;
      if (Math.random() < 0.02) spawnStars(sh.x, sh.y - 10, 1);
      if (sh.stTimer > sh.stDur) { sh.wideEyes = 0; sh.state = 'hover'; pickNext(sh); }
    }
  }

  function behaveDeparting(sh, dt, t, S) {
    steerTo(sh, sh.target.x, sh.target.y, S * 1.5);
    sh.headTarget = Math.max(-22, Math.min(22, sh.vx * 5));
  }

  function behaveGreet(sh, dt, t, S) {
    if (!sh.greetTarget || flock.indexOf(sh.greetTarget) === -1) { sh.greetTarget = null; sh.state = 'hover'; pickNext(sh); return; }
    var gt = sh.greetTarget;
    var dx = gt.x - sh.x, dy = gt.y - sh.y, d = Math.hypot(dx, dy);
    if (sh.stTimer > sh.stDur) { sh.greetTarget = null; sh.state = 'hover'; pickNext(sh); return; }
    /* Greet ignoriert Age — volle Kraft, sofort los */
    var greetSteer = BASE_STEER * (sh.traits.energy != null ? sh.traits.energy : 1) / Math.sqrt(sh.sizeMultiplier);
    if (sh.greetPhase === 0) {
      /* Phase 0: Sprint zum neuen Schaf — schnell und direkt */
      sh.propSpeed = PROP_MAX;
      if (d > 30) {
        steerTo(sh, gt.x, gt.y, greetSteer * 3.5);
      } else {
        /* Angekommen → Phase 1: Umkreisen */
        sh.greetPhase = 1;
        sh.orbitCenter = { x: gt.x, y: gt.y };
        sh.orbitAngle = Math.atan2(sh.y - gt.y, sh.x - gt.x);
        sh.orbitRadius = 25 + Math.random() * 20;
        sh.orbitDir = Math.random() > 0.5 ? 1 : -1;
      }
    } else {
      /* Phase 1: Um das neue Schaf kreisen, Blick auf es */
      sh.orbitCenter.x = gt.x; sh.orbitCenter.y = gt.y;
      sh.orbitAngle += dt * 0.005 * sh.orbitDir;
      var tx = sh.orbitCenter.x + Math.cos(sh.orbitAngle) * sh.orbitRadius;
      var ty = sh.orbitCenter.y + Math.sin(sh.orbitAngle) * sh.orbitRadius;
      steerTo(sh, tx, ty, greetSteer * 2.5);
      sh.propSpeed = Math.min(sh.propSpeed + 0.5, PROP_MAX * 0.7);
    }
    sh.headTarget = Math.max(-35, Math.min(35, dx * 0.3));
  }

  function behaveRetreat(sh, dt, t, S) {
    /* Zum Rand fliegen und dort ruhig bleiben */
    var d = steerTo(sh, sh.target.x, sh.target.y, S * 1.0);
    sh.headTarget = Math.max(-15, Math.min(15, sh.vx * 3));
    if (d < 30) { sh.vx *= 0.92; sh.vy *= 0.92; }
    if (sh.stTimer > sh.stDur || annoyance < 15) pickNext(sh);
  }

  var behaveHandlers = {
    hover: behaveHover, dart: behaveDart, explore: behaveExplore,
    circle: behaveCircle, zigzag: behaveZigzag, curious: behaveCurious,
    social: behaveSocial, scared: behaveScared, headbutt: behaveHeadbutt,
    followLeader: behaveFollowLeader, followLine: behaveFollowLine,
    circleDance: behaveCircleDance, fenceJump: behaveFenceJump,
    dance: behaveDance, bully: behaveBully, dizzy: behaveDizzy,
    departing: behaveDeparting, retreat: behaveRetreat, greet: behaveGreet
  };

  function behave(sh, dt, t) {
    if (sh === dragSheep) {
      sh.headTarget = Math.max(-30, Math.min(30, sh.vx * 5));
      sh.wideEyes = Math.max(sh.wideEyes, 100);
      return;
    }
    if (sh.resumeDelay > 0) {
      sh.resumeDelay -= dt;
      if (sh.resumeDelay <= 0 && !isGroupState(sh.state)) { pickNext(sh); }
      return;
    }
    sh.stTimer += dt;
    var handler = behaveHandlers[sh.state];
    if (handler) handler(sh, dt, t, getSteer(sh));
  }

  /* ═══ Herdenverhalten (Boids) ═══ */
  function flockForces(sh) {
    if (flock.length < 2 || sh === dragSheep || sh.state === 'departing' || sh.solo || isGroupState(sh.state)) return;
    var sepX = 0, sepY = 0;
    var aliVX = 0, aliVY = 0, aliN = 0;
    var cohX = 0, cohY = 0, cohN = 0;
    var desyncX = 0, desyncY = 0;
    for (var fi = 0; fi < flock.length; fi++) {
      var o = flock[fi];
      if (o === sh || o.state === 'departing') continue;
      var dx = sh.x - o.x, dy = sh.y - o.y, d = Math.hypot(dx, dy);
      if (d < SEPARATION_R && d > 0) { sepX += (dx / d) / d; sepY += (dy / d) / d; }
      if (d < ALIGNMENT_R) { aliVX += o.vx; aliVY += o.vy; aliN++; }
      if (d < COHESION_R) { cohX += o.x; cohY += o.y; cohN++; }
      /* Desync: wenn nah + gleiche Richtung → senkrecht ausweichen */
      if (d < DESYNC_R && d > 0) {
        var spdA = Math.hypot(sh.vx, sh.vy), spdB = Math.hypot(o.vx, o.vy);
        if (spdA > 0.3 && spdB > 0.3) {
          var dot = (sh.vx * o.vx + sh.vy * o.vy) / (spdA * spdB);
          if (dot > 0.7) {
            var closeness = 1 - d / DESYNC_R;
            var perpX = -dy / d, perpY = dx / d;
            desyncX += perpX * closeness * (dot - 0.7) * 3;
            desyncY += perpY * closeness * (dot - 0.7) * 3;
          }
        }
      }
    }
    sh.vx += sepX * SEP_FORCE; sh.vy += sepY * SEP_FORCE;
    sh.vx += desyncX * DESYNC_FORCE; sh.vy += desyncY * DESYNC_FORCE;
    if (aliN) { sh.vx += (aliVX / aliN - sh.vx) * ALI_FORCE; sh.vy += (aliVY / aliN - sh.vy) * ALI_FORCE; }
    if (cohN) { var cx = cohX / cohN - sh.x, cy = cohY / cohN - sh.y; sh.vx += cx * COH_FORCE; sh.vy += cy * COH_FORCE; }
  }

  /* ═══ Physik ═══ */
  function physics(sh, dt) {
    /* Aging + Namens-Timer */
    sh.age += dt;
    if (sh.showNameTimer > 0) sh.showNameTimer = Math.max(0, sh.showNameTimer - dt);

    if (sh !== dragSheep) {
      sh.throwBoost = Math.max(0, sh.throwBoost - dt);
      var maxSpd = getMaxSpeed(sh);
      var curMax = sh.throwBoost > 0 ? maxSpd + (sh.throwBoost / 500) * 4
                 : sh.state === 'greet' ? maxSpd * 1.8
                 : maxSpd;
      var spd = Math.hypot(sh.vx, sh.vy);
      if (spd > curMax) { sh.vx *= curMax / spd; sh.vy *= curMax / spd; }
      sh.vx *= (sh.throwBoost > 0 ? .996 : FRICTION);
      sh.vy *= (sh.throwBoost > 0 ? .996 : FRICTION);

      sh.x += sh.vx * dt * DT_SCALE; sh.y += sh.vy * dt * DT_SCALE;

      /* Wandkollision */
      if (sh.state !== 'departing') {
        var preHitSpd = Math.hypot(sh.vx, sh.vy);
        var hit = false;

        /* Oben: OFFEN — Schwerkraft zieht zurück */
        if (sh.y < MARGIN) {
          sh.vy += 0.006 * dt;
        }
        /* Seiten: IMMER prüfen (auch wenn Schaf oben ist) */
        if (sh.x < MARGIN)     { sh.x = MARGIN;     sh.vx = Math.abs(sh.vx) * .5; hit = true; }
        if (sh.x > W - MARGIN) { sh.x = W - MARGIN; sh.vx = -Math.abs(sh.vx) * .5; hit = true; }
        if (sh.y > H - MARGIN) { sh.y = H - MARGIN; sh.vy = -Math.abs(sh.vy) * .5; hit = true; }

        if (hit && preHitSpd > 1.0) {
          spawnStars(sh.x, sh.y, 2 + (Math.random() * 2 | 0));
          sh.propSpeed = Math.min(sh.propSpeed + 15, PROP_MAX); sh.wobbleV += (Math.random() - .5) * 16;
          if (sh.state !== 'scared') {
            /* Harter Aufprall (geworfen ODER schnell genug) → Angst */
            if (sh.throwBoost > 500 || preHitSpd > 1.6) {
              makeSheepScared(sh, true);
            }
          }
        }
      }
    }

    sh.bank += ((-sh.vx * 6) - sh.bank) * BANK_LERP;
    sh.wobbleV -= sh.wobble * WOBBLE_SPRING; sh.wobbleV *= WOBBLE_DAMP; sh.wobble += sh.wobbleV * dt * DT_SCALE;
    sh.headAngle += (sh.headTarget - sh.headAngle) * HEAD_LERP;

    sh.legDragX += (sh.vx - sh.legDragX) * LEG_DRAG_LERP;
    sh.legDragY += (sh.vy - sh.legDragY) * LEG_DRAG_LERP;

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
          /* Abstoßung auch bei gleicher Geschwindigkeit (Anti-Kleben) */
          var push = 0.3 + overlap * 0.05;
          a.vx -= nx * push; a.vy -= ny * push;
          b.vx += nx * push; b.vy += ny * push;
          /* Parallel-Lock brechen: wenn beide in ähnliche Richtung → senkrechter Kick + neue Ziele */
          var spdA = Math.hypot(a.vx, a.vy), spdB = Math.hypot(b.vx, b.vy);
          if (spdA > 0.3 && spdB > 0.3) {
            var dotNorm = (a.vx * b.vx + a.vy * b.vy) / (spdA * spdB);
            if (dotNorm > 0.4) {
              var perpX = -ny, perpY = nx;
              a.vx += perpX * 1.2; a.vy += perpY * 1.2;
              b.vx -= perpX * 1.2; b.vy -= perpY * 1.2;
              a.target = newTarget(); b.target = newTarget();
              if (a.state !== 'scared' && a.state !== 'departing' && !isGroupState(a.state)) { a.state = 'dart'; a.stTimer = 0; a.stDur = 600 + Math.random() * 400; }
              if (b.state !== 'scared' && b.state !== 'departing' && !isGroupState(b.state)) { b.state = 'dart'; b.stTimer = 0; b.stDur = 600 + Math.random() * 400; }
            }
          }
          if (rv > 1.5 && a.collisionCD <= 0 && b.collisionCD <= 0) {
            spawnStars((a.x + b.x) / 2, (a.y + b.y) / 2, 2 + (Math.random() * 2 | 0));
            a.wobbleV += (Math.random() - .5) * 8; b.wobbleV += (Math.random() - .5) * 8;
            a.propSpeed = Math.min(a.propSpeed + 10, PROP_MAX); b.propSpeed = Math.min(b.propSpeed + 10, PROP_MAX);
            a.collisionCD = 500; b.collisionCD = 500;
            /* Heftige Kollision → beide erschrecken sich */
            if (rv > 2.5) {
              if (a.state !== 'scared') makeSheepScared(a, false);
              if (b.state !== 'scared') makeSheepScared(b, false);
            }
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
    if (d.bodySprite) {
      var bsOY = parseFloat(d.bodySprite.dataset.offsetY) || 0;
      var bsOX = parseFloat(d.bodySprite.dataset.offsetX) || 0;
      var bsS = d.bodySprite.dataset.spriteScale || '1';
      d.bodySprite.style.transform = 'translate(' + (tx - sh.tw / 2) + 'px,' + (ty - sh.th / 2) + 'px) rotate(' + bankRad + 'rad) translate(' + bsOX + 'px,' + bsOY + 'px)' + (bsS !== '1' ? ' scale(' + bsS + ')' : '');
    }

    var labelRotY = sh.tailSide * 65;
    var labelShiftX = -sh.tailSide * sh.tw * 0.3;
    d.label.style.transform = 'translate(calc(-50% + ' + labelShiftX + 'px),-50%) rotateY(' + labelRotY + 'deg)';

    var ts = tr.tailSize;
    var tailWag = Math.sin(sh.bobPhase * .008) * 0.15;
    var tailLocalX = sh.tailSide * (sh.tw / 2 + ts * .3);
    var tailLocalY = 1;
    var tailPos = rot(tailLocalX, tailLocalY, bankRad);
    var tailX = tx + tailPos.x, tailY = ty + tailPos.y;
    var tailFlip = (tr.spriteTail >= 0 && sh.tailSide < 0) ? ' scaleX(-1)' : '';
    d.tail.style.transform = 'translate(' + (tailX - ts / 2) + 'px,' + (tailY - ts / 2) + 'px) rotate(' + ((tailWag + sh.tailSide * .4) * Math.PI) + 'rad)' + tailFlip;

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
    else if (sh.state === 'headbutt' && sh.headbuttPartner) { etx = (sh.headbuttPartner.x - headVX) * .04; ety = (sh.headbuttPartner.y - headVY) * .04; }
    else if (sh.state === 'bully' && sh.bullyTarget) { etx = (sh.bullyTarget.x - headVX) * .04; ety = (sh.bullyTarget.y - headVY) * .04; }
    else if (sh.state === 'followLine' && sh.followTarget) { etx = (sh.followTarget.x - headVX) * .04; ety = (sh.followTarget.y - headVY) * .04; }
    else if (sh.state === 'greet' && sh.greetTarget) { etx = (sh.greetTarget.x - headVX) * .04; ety = (sh.greetTarget.y - headVY) * .04; }
    else if (sh.state === 'dance' && sh.groupData) { var dp = sh.groupData.partner[0] === sh ? sh.groupData.partner[1] : sh.groupData.partner[0]; etx = (dp.x - headVX) * .04; ety = (dp.y - headVY) * .04; }
    else if (sh.state === 'hover') {
      var looked = false;
      for (var fi = 0; fi < flock.length; fi++) { var o = flock[fi]; if (o !== sh && Math.hypot(o.x - sh.x, o.y - sh.y) < 50) { etx = (o.x - headVX) * .04; ety = (o.y - headVY) * .04; looked = true; break; } }
      if (!looked) { etx = Math.sin(sh.headAngle * Math.PI / 180) * 1.5; ety = 0; }
    }
    else { etx = sh.vx * 3; ety = sh.vy * 2; }
    etx = Math.max(-2, Math.min(2, etx));
    var eyeYLimit = tr.spriteStache >= 0 ? 0.5 : 1.5;
    ety = Math.max(-1.5, Math.min(eyeYLimit, ety));
    sh.eyeX += (etx - sh.eyeX) * EYE_LERP; sh.eyeY += (ety - sh.eyeY) * EYE_LERP;
    var ee = sh.isBlinking ? ' scaleY(0.1)' : sh.wideEyes > 0 ? ' scale(1.5)' : '';
    d.eyeL.style.transform = 'translate(' + sh.eyeX + 'px,' + sh.eyeY + 'px)' + ee;
    d.eyeR.style.transform = 'translate(' + sh.eyeX + 'px,' + sh.eyeY + 'px)' + ee;

    /* Propeller (am Rücken/Torso fixiert) — rein transform-basiert */
    var pSz = d.propSize || 1.0;
    var poleH = POLE_H * pSz, hubSz = HUB_SZ * pSz, halfBw = 14 * pSz;
    var backTop = rot(0, -sh.th / 2 - 1, bankRad);
    var topX = tx + backTop.x, topY = ty + backTop.y;
    var backHub = rot(0, -sh.th / 2 - poleH - 2, bankRad);
    var hubX = tx + backHub.x, hubY = ty + backHub.y;
    var pdx = hubX - topX, pdy = hubY - topY, pL = Math.hypot(pdx, pdy);
    d.pole.style.height = pL + 'px';
    d.pole.style.transform = 'translate(' + (topX - 0.75) + 'px,' + topY + 'px) rotate(' + Math.atan2(pdx, -pdy) + 'rad)';
    d.hub.style.transform = 'translate(' + (hubX - hubSz / 2) + 'px,' + (hubY - hubSz / 2) + 'px)';
    d.bwrap.style.transform = 'translate(' + (hubX - halfBw) + 'px,' + (hubY - halfBw) + 'px)';
    d.blades.style.transform = 'rotateX(55deg) rotate(' + sh.propAngle + 'deg)';
    /* Opacity nur updaten wenn sich der gerundete Wert aendert (spart Repaints) */
    var bOp = Math.max(.25, 1 - (sh.propSpeed - PROP_BASE) / (PROP_MAX - PROP_BASE) * .75);
    var bOpR = (bOp * 10 + .5 | 0) / 10;
    if (d.blades._lastOp !== bOpR) { d.blades.style.opacity = bOpR; d.blades._lastOp = bOpR; }

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
      legEls[i].style.transform = 'translate(' + (hpX - LEG_W / 2) + 'px,' + hpY + 'px) rotate(' + (angle * Math.PI / 180 + bankRad) + 'rad)';
      if (d.shinEls[i]) {
        var hipSwing = angle - tr.legRestAngles[i];
        var kneeAngle = Math.max(-75, Math.min(75, -hipSwing * 2.5));
        d.shinEls[i].style.transform = 'rotate(' + (kneeAngle * Math.PI / 180) + 'rad)';
      }
    }

    /* Namens-Bubble: frisch gespawnt (showNameTimer > 0) oder beim Draggen */
    if (d.nameEl) {
      var showName = sh.ownerName && (sh.showNameTimer > 0 || sh === dragSheep);
      if (showName) {
        var sc = sh.scoreCounts || { alle9: 0, kranz: 0 };
        var badge = '';
        if (sc.alle9 > 0) badge += ' \u2B50' + sc.alle9;
        if (sc.kranz > 0) badge += ' \uD83C\uDF40' + sc.kranz;
        var nameText = sh.ownerName + badge;
        if (d.nameEl.style.display === 'none' || d.nameEl.textContent !== nameText) {
          d.nameEl.textContent = nameText;
          d.nameEl.style.display = '';
          d.nameEl.style.opacity = '1';
        }
        var wrapScale = tr.scale * sh.sizeMultiplier;
        var invScale = 1 / wrapScale;
        d.nameEl.style.top = (-28 - 6 / wrapScale) + 'px';
        d.nameEl.style.transform = 'translateX(-50%) scale(' + invScale + ')';
        /* Sanftes Ausblenden in den letzten 2s */
        if (sh.showNameTimer < 2000 && sh !== dragSheep) d.nameEl.style.opacity = Math.max(0, sh.showNameTimer / 2000);
      } else if (d.nameEl.style.display !== 'none') {
        d.nameEl.style.display = 'none';
      }
    }

    /* Debug: State + Solo + Timer unter dem Schaf (Konsole: SHEEP_DEBUG=true) */
    if (d.debugEl) {
      if (window.SHEEP_DEBUG) {
        d.debugEl.style.display = '';
        var soloTag = sh.solo ? 'S' : 'H';
        var sec = (sh.stDur > 0 ? Math.round((sh.stDur - sh.stTimer) / 1000) : 0);
        d.debugEl.textContent = sh.state + ' ' + soloTag + ' ' + sec + 's';
      } else if (d.debugEl.style.display !== 'none') {
        d.debugEl.style.display = 'none';
        d.debugEl.textContent = '';
      }
    }
  }

  /* ═══ Stars ═══ */
  /* Star-Pool: wiederverwendbare Elemente statt DOM-Create/Remove */
  var STAR_POOL_SIZE = 24;
  var starPool = [];
  var starIdx = 0;
  (function initStarPool() {
    for (var i = 0; i < STAR_POOL_SIZE; i++) {
      var el = document.createElement('div'); el.className = 'star'; el.textContent = '\u2B50';
      el.style.display = 'none';
      overlay.appendChild(el);
      starPool.push(el);
    }
  })();

  function spawnStars(x, y, n) {
    for (var i = 0; i < n; i++) {
      var el = starPool[starIdx]; starIdx = (starIdx + 1) % STAR_POOL_SIZE;
      var a = (Math.PI * 2 / n) * i + (Math.random() - .5), dd = 14 + Math.random() * 22;
      el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;font-size:' + (6 + Math.random() * 4) + 'px;';
      el.style.setProperty('--dx', Math.cos(a) * dd + 'px'); el.style.setProperty('--dy', Math.sin(a) * dd + 'px');
      /* Animation neu starten */
      el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
      el.style.display = '';
      setTimeout(function (e) { e.style.display = 'none'; }, STAR_DURATION, el);
    }
  }

  /* ═══ PUFF Particles (Epic Items) ═══ */
  var PUFF_POOL_SIZE = 40;
  var puffPool = [];
  var puffIdx = 0;
  var PUFF_COLORS = [
    'rgba(252,178,96,.9)',
    'rgba(253,238,152,.9)',
    'rgba(255,215,64,.9)',
    'rgba(218,119,242,.8)',
    'rgba(255,107,107,.7)',
    'rgba(255,255,255,.8)',
  ];
  (function initPuffPool() {
    for (var i = 0; i < PUFF_POOL_SIZE; i++) {
      var el = document.createElement('div');
      el.style.cssText = 'position:absolute;pointer-events:none;z-index:31;border-radius:50%;display:none;';
      overlay.appendChild(el);
      puffPool.push(el);
    }
  })();

  function spawnPuff(x, y, n) {
    n = n || 25;
    for (var i = 0; i < n; i++) {
      var el = puffPool[puffIdx]; puffIdx = (puffIdx + 1) % PUFF_POOL_SIZE;
      var angle = (Math.PI * 2 / n) * i + (Math.random() - .5) * 0.5;
      var dist = 20 + Math.random() * 40;
      var size = 2 + Math.random() * 5;
      var color = PUFF_COLORS[Math.random() * PUFF_COLORS.length | 0];
      var dur = 500 + Math.random() * 400;
      el.style.display = 'block';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.background = color;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%,-50%) scale(1)';
      el.style.transition = 'none';
      el.offsetHeight;
      el.style.transition = 'all ' + dur + 'ms ease-out';
      el.style.left = (x + Math.cos(angle) * dist) + 'px';
      el.style.top = (y + Math.sin(angle) * dist) + 'px';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(0.1)';
      (function(e, d) { setTimeout(function() { e.style.display = 'none'; }, d + 50); })(el, dur);
    }
  }

  /* ═══ Drag ═══ */
  var dragSheep = null, dragOX = 0, dragOY = 0, dragLX = 0, dragLY = 0, dragLT = 0;
  var velBuf = [];
  var dragPrevVX = 0, dragPrevVY = 0, dragShakeScore = 0;
  /* Drag-Bubble entfernt — nameEl im wrap uebernimmt die Anzeige (render-Loop) */

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
    dragShakeScore = 0; dragPrevVX = 0; dragPrevVY = 0;
    /* Herde aufscheuchen — nahe Schafe erschrecken sich richtig */
    for (var fi = 0; fi < flock.length; fi++) {
      var o = flock[fi];
      if (o === sh) continue;
      var dx = o.x - sh.x, dy = o.y - sh.y, d = Math.hypot(dx, dy) || 1;
      if (d < 100 && o.state !== 'scared') {
        makeSheepScared(o, true);
      } else {
        o.vx += (dx / d) * 2.5; o.vy += (dy / d) * 2.5;
        o.propSpeed = Math.min(o.propSpeed + 15, PROP_MAX);
        o.wideEyes = Math.max(o.wideEyes, 600);
        o.state = 'dart'; o.target = { x: o.x + (dx / d) * 120, y: o.y + (dy / d) * 120 };
        o.stTimer = 0; o.stDur = 3000 + Math.random() * 3000;
      }
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
    /* Shake-Erkennung: nur echte Richtungsumkehr zählen (vor dragLX-Update!) */
    if (dtt > 1) {
      var curVX = (e.clientX - dragLX) / dtt * 12, curVY = (e.clientY - dragLY) / dtt * 12;
      var dot = curVX * dragPrevVX + curVY * dragPrevVY;
      if (dot < 0 && Math.hypot(dragPrevVX, dragPrevVY) > 1.5) dragShakeScore = Math.min(dragShakeScore + Math.hypot(curVX - dragPrevVX, curVY - dragPrevVY) * 0.2, 40);
      dragPrevVX = curVX; dragPrevVY = curVY;
      dragSheep.vx += (curVX - dragSheep.vx) * .3;
      dragSheep.vy += (curVY - dragSheep.vy) * .3;
    }
    dragShakeScore *= 0.993;
    dragLX = e.clientX; dragLY = e.clientY; dragLT = now;
    dragSheep.propSpeed = Math.min(dragSheep.propSpeed + .5, PROP_MAX);
  });

  document.addEventListener('pointerup', function () {
    if (!dragSheep) return;
    var ax = 0, ay = 0;
    if (velBuf.length) { for (var vi = 0; vi < velBuf.length; vi++) { ax += velBuf[vi].vx; ay += velBuf[vi].vy; } ax /= velBuf.length; ay /= velBuf.length; }
    dragSheep.vx = ax * .8; dragSheep.vy = ay * .8;
    dragSheep.wobbleV += (Math.random() - .5) * 12;
    /* Drag = Aufmerksamkeit → Schaf wird wieder munter (age nicht resetten wegen Ahnengalerie) */
    dragSheep.age = Math.min(dragSheep.age, AGE_START);
    /* Heftig geschüttelt? → Absturz + Torkeln */
    if (dragShakeScore > 15) {
      dragSheep.state = 'dizzy'; dragSheep.dizzyPhase = 0;
      dragSheep.stTimer = 0; dragSheep.resumeDelay = 0;
      dragSheep.throwBoost = 0;
    } else {
      dragSheep.throwBoost = 2500; dragSheep.resumeDelay = 1200;
    }
    velBuf.length = 0; dragShakeScore = 0; dragSheep = null;
  });

  /* ═══ Persistence ═══ */
  function serializeFlock() {
    var sheep = [];
    for (var i = 0; i < flock.length; i++) {
      var sh = flock[i];
      sheep.push({
        x: sh.x, y: sh.y, vx: sh.vx, vy: sh.vy,
        traits: sh.traits,
        ownerId: sh.ownerId, ownerName: sh.ownerName, letter: sh.letter,
        sizeMultiplier: sh.sizeMultiplier, age: sh.age, scoreCounts: sh.scoreCounts || { alle9: 0, kranz: 0 },
        state: (isGroupState(sh.state) || sh.state === 'dizzy' || sh.state === 'scared' || sh.state === 'retreat') ? 'explore' : sh.state, tailSide: sh.tailSide,
        solo: sh.solo, bank: sh.bank, propSpeed: sh.propSpeed,
      });
    }
    return { version: 1, timestamp: Date.now(), sheep: sheep };
  }

  function saveFlock(force) {
    if (dismissed) return;
    if (!force && !flockDirty) return;
    flockDirty = false;
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
    /* Alle Schafe offscreen bauen, dann gesammelt einfuegen (1x Reflow) */
    var frag = document.createDocumentFragment();
    for (var i = 0; i < data.sheep.length; i++) {
      var s = data.sheep[i];
      /* Skip stuck sheep near top-left corner */
      if (s.x < 2 && s.y < 2) continue;
      /* Clamp position to current viewport */
      var x = Math.max(MARGIN, Math.min(W - MARGIN, s.x || W / 2));
      var y = Math.max(MARGIN, Math.min(H - MARGIN, s.y || H / 2));
      var sh = createSheep(x, y, s.ownerId, s.letter, {
        ownerName: s.ownerName || '',
        traits: s.traits,
        sizeMultiplier: s.sizeMultiplier || 1,
        age: (s.age || 0) + elapsed,
        vx: s.vx || 0, vy: s.vy || 0,
        state: s.state || 'explore',
        tailSide: s.tailSide || 0,
        solo: s.solo,
        bank: s.bank || 0,
        propSpeed: s.propSpeed || 15,
        scoreCounts: s.scoreCounts || { alle9: 0, kranz: 0 },
        _skipMount: true,
      });
      frag.appendChild(sh.dom.wrap);
    }
    overlay.appendChild(frag);
  }

  /* Auto-save every 3s */
  setInterval(saveFlock, SAVE_INTERVAL);
  window.addEventListener('beforeunload', function () { saveFlock(true); });

  /* ═══ Haupt-Loop ═══ */
  var lastT = 0;
  function frame(t) {
    var dt = lastT ? Math.min(t - lastT, 40) : 16;
    lastT = t;
    /* Annoyance langsam abbauen */
    annoyance = Math.max(0, annoyance - dt * 0.008);
    /* Bei hoher Annoyance: Schafe zum Rand scheuchen */
    if (annoyance > 50) {
      for (var ai = 0; ai < flock.length; ai++) {
        var ash = flock[ai];
        if (ash === dragSheep || ash.state === 'departing' || ash.state === 'scared' || isGroupState(ash.state)) continue;
        /* Schaf ist nahe Cursor → aktiv wegschicken */
        var cdist = Math.hypot(ash.x - cursorX, ash.y - cursorY);
        if (cdist < 150) {
          if (ash.state !== 'retreat') {
            ash.state = 'retreat'; ash.stTimer = 0; ash.stDur = 8000 + Math.random() * 6000;
            ash.target = edgeTarget();
          }
        }
      }
    }
    if (flock.length) markDirty();
    for (var fi = 0; fi < flock.length; fi++) {
      var sh = flock[fi];
      try { behave(sh, dt, t); } catch (e) { pickNext(sh); }
      flockForces(sh); physics(sh, dt); render(sh);
      /* Stuck-Detection: Schaf bewegt sich kaum
         lastCheckX/Y nur bei Reset aktualisieren — misst Gesamtdistanz seit letzter Bewegung,
         nicht Per-Frame-Distanz. Gruppen-/Greet-States ausgeschlossen (haben eigene Timer). */
      if (sh !== dragSheep && sh.state !== 'departing' && sh.state !== 'hover'
          && sh.state !== 'scared' && sh.state !== 'dizzy' && !isGroupState(sh.state)) {
        var moved = Math.hypot(sh.x - sh.lastCheckX, sh.y - sh.lastCheckY);
        if (moved < 15) {
          sh.stuckTimer += dt;
          if (sh.stuckTimer > 5000) {
            sh.state = 'dart'; sh.target = newTarget(); sh.stTimer = 0; sh.stDur = 800 + Math.random() * 1200;
            sh.propSpeed = Math.min(sh.propSpeed + 15, PROP_MAX);
            sh.vx += (Math.random() - 0.5) * 2; sh.vy += (Math.random() - 0.5) * 2;
            sh.stuckTimer = 0;
            sh.lastCheckX = sh.x; sh.lastCheckY = sh.y;
          }
        } else {
          sh.stuckTimer = 0;
          sh.lastCheckX = sh.x; sh.lastCheckY = sh.y;
        }
      }
      /* Solo-Timer: Sociability bestimmt Phasendauer (Minutenskala) */
      if (sh.state !== 'scared' && sh.state !== 'departing' && !isGroupState(sh.state)) {
        sh.soloTimer -= dt;
        if (sh.soloTimer <= 0) {
          sh.solo = !sh.solo;
          var soc = sh.traits.sociability != null ? sh.traits.sociability : 0.5;
          if (sh.solo) {
            /* Solo-Phase: Einzelgaenger 1–5min, Gesellige 15–45s */
            sh.soloTimer = (15000 + Math.random() * 30000) + (1 - soc) * 240000;
          } else {
            /* Herden-Phase: Gesellige 1–5min, Einzelgaenger 20–50s */
            sh.soloTimer = (20000 + Math.random() * 30000) + soc * 240000;
          }
        }
      }
    }
    /* Gruppenaktionen */
    groupCooldown -= dt;
    if (groupCooldown <= 0) {
      tryGroupAction();
      groupCooldown = 15000 + Math.random() * 30000;
    }
    sheepCollisions();
    /* ── Critter-Loop: Physik, Kicks, Render, Cleanup ── */
    for (var ci = critters.length - 1; ci >= 0; ci--) {
      var cr = critters[ci];
      /* Launched + off-screen → entfernen */
      if (cr.launched) {
        if (cr.x < -80 || cr.x > W + 80 || cr.y < -80 || cr.y > H + 80) {
          cr.dom.wrap.remove(); critters.splice(ci, 1); continue;
        }
        critterPhysics(cr, dt); critterRender(cr); continue;
      }
      /* Schafe kicken Critters */
      for (var si = 0; si < flock.length; si++) {
        var sh = flock[si];
        if (sh.state === 'departing' || sh.state === 'scared') continue;
        if (cr.kickCD[si] > 0) continue;
        var dxc = cr.x - sh.x, dyc = cr.y - sh.y;
        var dc = Math.hypot(dxc, dyc);
        if (dc < 20 * sh.sizeMultiplier && dc > 0) {
          cr.kicksLeft--;
          var nx = dxc / dc, ny = dyc / dc;
          if (cr.kicksLeft <= 0) {
            /* ══ DEATH KICK — ab geht die Post! ══ */
            cr.launched = true;
            var launchForce = 8 + Math.hypot(sh.vx, sh.vy) * 2;
            cr.vx = nx * launchForce * 0.4;
            cr.vy = -Math.abs(launchForce);  // immer nach oben raus
            cr.wobbleV = (Math.random() - .5) * 60;
            /* Konfetti-Kanone in Abflugrichtung */
            spawnStars(cr.x, cr.y, 6);
            spawnPuff(cr.x, cr.y, 20);
            /* Kicker-Schaf: extra Kick-Anim */
            sh.kickLeg = Math.random() * 4 | 0; sh.kickTimer = 400;
            sh.wobbleV += (Math.random() > .5 ? 1 : -1) * 12;
            /* Alle Schafe applaudieren */
            for (var ai = 0; ai < flock.length; ai++) {
              var applSh = flock[ai];
              if (applSh.state === 'departing' || applSh.state === 'scared') continue;
              applSh.wideEyes = 1500;
              applSh.wobbleV += (Math.random() - .5) * 8;
              applSh.kickLeg = Math.random() * 4 | 0;
              applSh.kickTimer = 300 + Math.random() * 200;
              applSh.propSpeed = Math.min(applSh.propSpeed + 15, PROP_MAX);
            }
          } else {
            /* Normaler Kick */
            var kickForce = 2.5 + Math.hypot(sh.vx, sh.vy) * 1.2;
            cr.vx = nx * kickForce; cr.vy = ny * kickForce;
            cr.wobbleV += (Math.random() - .5) * 25;
            sh.kickLeg = Math.random() * 4 | 0; sh.kickTimer = 250;
            spawnStars(cr.x, cr.y, 2);
          }
          cr.kickCD[si] = CRITTER_KICK_CD;
          break; // max 1 Kick pro Frame
        }
      }
      critterPhysics(cr, dt);
      critterRender(cr);
    }
    /* Cleanup: Schafe die den Screen verlassen haben oder stuck sind */
    for (var i = flock.length - 1; i >= 0; i--) {
      var sh = flock[i];
      if (sh === dragSheep) continue;
      /* Stuck at origin (serialization bug fallback) */
      if (sh.x < 2 && sh.y < 2) {
        removeSheep(sh, 'stuck'); continue;
      }
      /* Departing: off-screen */
      if (sh.state === 'departing' && (sh.x < -60 || sh.x > W + 60 || sh.y < -60 || sh.y > H + 60)) {
        removeSheep(sh, 'departed'); continue;
      }
      /* Rausgeworfen: weit genug oben → weg */
      if (sh.y < -80) {
        removeSheep(sh, 'thrown');
      }
    }
    requestAnimationFrame(frame);
  }

  /* ═══ Critter-System (Triclops Mini-Schwarzschaf) ═══ */
  var critters = [];
  var MAX_CRITTERS = 5;
  var CRITTER_FRICTION = 0.995;
  var CRITTER_BOUNCE = 0.5;
  var CRITTER_SPEED = 0.3;
  var CRITTER_KICK_CD = 10000;
  var CRITTER_MIN_KICKS = 8;
  var CRITTER_MAX_KICKS = 25;

  function createCritterDOM() {
    var wrap = document.createElement('div'); wrap.className = 'critter-wrap';
    var body = document.createElement('div'); body.className = 'critter-body';
    var earL = document.createElement('div'); earL.className = 'critter-ear l';
    var earR = document.createElement('div'); earR.className = 'critter-ear r';
    var eyeL = document.createElement('div'); eyeL.className = 'critter-eye l';
    var pupilL = document.createElement('div'); pupilL.className = 'critter-pupil';
    eyeL.appendChild(pupilL);
    var eyeR = document.createElement('div'); eyeR.className = 'critter-eye r';
    var pupilR = document.createElement('div'); pupilR.className = 'critter-pupil';
    eyeR.appendChild(pupilR);
    var feet = document.createElement('div'); feet.className = 'critter-feet';
    var footL = document.createElement('div'); footL.className = 'critter-foot';
    var footR = document.createElement('div'); footR.className = 'critter-foot';
    feet.appendChild(footL); feet.appendChild(footR);
    body.appendChild(earL); body.appendChild(earR);
    body.appendChild(eyeL); body.appendChild(eyeR);
    body.appendChild(feet);
    wrap.appendChild(body);
    return { wrap: wrap, body: body, pupilL: pupilL, pupilR: pupilR };
  }

  function spawnCritter(x, y) {
    /* Bei MAX_CRITTERS: das mit wenigsten verbleibenden Kicks entfernen */
    if (critters.length >= MAX_CRITTERS) {
      var weakest = critters[0];
      for (var i = 1; i < critters.length; i++) {
        if (critters[i].kicksLeft < weakest.kicksLeft) weakest = critters[i];
      }
      weakest.dom.wrap.remove();
      critters.splice(critters.indexOf(weakest), 1);
    }
    var angle = Math.random() * Math.PI * 2;
    var dom = createCritterDOM();
    var cr = {
      dom: dom, x: x, y: y,
      vx: Math.cos(angle) * CRITTER_SPEED,
      vy: Math.sin(angle) * CRITTER_SPEED,
      wobble: 0, wobbleV: 0,
      scale: 0.9 + Math.random() * 0.2,
      kickCD: {},
      kicksLeft: CRITTER_MIN_KICKS + (Math.random() * (CRITTER_MAX_KICKS - CRITTER_MIN_KICKS) | 0),
      launched: false
    };
    overlay.appendChild(dom.wrap);
    critters.push(cr);
    return cr;
  }

  function critterPhysics(cr, dt) {
    if (cr.launched) {
      /* Launched: nur Position updaten, kein Bouncing, kein Drift-Reset */
      cr.x += cr.vx * dt * DT_SCALE; cr.y += cr.vy * dt * DT_SCALE;
      cr.wobbleV -= cr.wobble * 0.2; cr.wobbleV *= 0.9; cr.wobble += cr.wobbleV * dt * DT_SCALE;
      return;
    }
    cr.vx *= CRITTER_FRICTION; cr.vy *= CRITTER_FRICTION;
    /* Geschwindigkeit zu niedrig → neue zufällige Drift-Richtung */
    if (Math.hypot(cr.vx, cr.vy) < 0.1) {
      var a = Math.random() * Math.PI * 2;
      cr.vx = Math.cos(a) * CRITTER_SPEED;
      cr.vy = Math.sin(a) * CRITTER_SPEED;
    }
    cr.x += cr.vx * dt * DT_SCALE; cr.y += cr.vy * dt * DT_SCALE;
    /* Wand-Bouncing */
    if (cr.x < 10) { cr.x = 10; cr.vx = Math.abs(cr.vx) * CRITTER_BOUNCE; }
    if (cr.x > W - 10) { cr.x = W - 10; cr.vx = -Math.abs(cr.vx) * CRITTER_BOUNCE; }
    if (cr.y < 10) { cr.y = 10; cr.vy = Math.abs(cr.vy) * CRITTER_BOUNCE; }
    if (cr.y > H - 10) { cr.y = H - 10; cr.vy = -Math.abs(cr.vy) * CRITTER_BOUNCE; }
    /* Wobble-Spring */
    cr.wobbleV -= cr.wobble * 0.2; cr.wobbleV *= 0.9; cr.wobble += cr.wobbleV * dt * DT_SCALE;
    /* Kick-Cooldowns runterzählen */
    for (var k in cr.kickCD) {
      if (cr.kickCD[k] > 0) { cr.kickCD[k] -= dt; if (cr.kickCD[k] <= 0) delete cr.kickCD[k]; }
    }
  }

  function critterRender(cr) {
    cr.dom.wrap.style.transform = 'translate(' + cr.x + 'px,' + cr.y + 'px) scale(' + cr.scale + ') rotate(' + (cr.wobble * 3) + 'deg)';
    /* Pupillen-Tracking: zum nächsten Schaf schauen */
    var lookX = cursorX, lookY = cursorY, bestD = 200;
    for (var fi = 0; fi < flock.length; fi++) {
      var sh = flock[fi];
      var d = Math.hypot(sh.x - cr.x, sh.y - cr.y);
      if (d < bestD) { bestD = d; lookX = sh.x; lookY = sh.y; }
    }
    var dx = lookX - cr.x, dy = lookY - cr.y;
    var dd = Math.hypot(dx, dy) || 1;
    var px = (dx / dd) * 1.2, py = (dy / dd) * 1.2;
    cr.dom.pupilL.style.transform = 'translate(' + px + 'px,' + py + 'px)';
    cr.dom.pupilR.style.transform = 'translate(' + px + 'px,' + py + 'px)';
  }

  /* ═══ Public API ═══ */
  window.flyingSheep = {
    spawn: function (x, y, ownerId, letter, ownerName, opts) {
      opts = opts || {};
      /* Ungültige Koordinaten → zufällige sichere Position */
      if (x == null || x < MARGIN || x > W - MARGIN) x = MARGIN + Math.random() * (W - MARGIN * 2);
      if (y == null || y < MARGIN || y > H - MARGIN) y = MARGIN + Math.random() * (H - MARGIN * 2);
      /* Existiert schon ein Schaf mit dieser ownerId? → wachsen + Herde begruessen */
      if (ownerId) {
        for (var i = 0; i < flock.length; i++) {
          if (flock[i].ownerId === String(ownerId)) {
            var sh = flock[i];
            sh.sizeMultiplier = Math.min(2.5, sh.sizeMultiplier + 0.25);
            if (!sh.scoreCounts) sh.scoreCounts = { alle9: 0, kranz: 0 };
            if (opts.scoreType === 'kranz') sh.scoreCounts.kranz++;
            else sh.scoreCounts.alle9++;
            sh.wobbleV += (Math.random() > .5 ? 1 : -1) * 14;
            sh.wideEyes = 600;
            sh.propSpeed = Math.min(sh.propSpeed + 20, PROP_MAX);
            if (ownerName && !sh.ownerName) sh.ownerName = ownerName;
            sh.showNameTimer = 10000;
            /* Andere Schafe kommen begruessen */
            for (var gi = 0; gi < flock.length; gi++) {
              var o = flock[gi];
              if (o === sh || o === dragSheep || o.state === 'departing' || o.state === 'scared') continue;
              if (o.resumeDelay > 0 || o.throwBoost > 0) continue;
              o.state = 'greet'; o.stTimer = 0;
              o.stDur = 15000 + Math.random() * 10000;
              o.greetTarget = sh; o.greetPhase = 0;
              /* age nicht resetten (Ahnengalerie!) — greet ignoriert age via eigene Steer-Berechnung */
              o.propSpeed = PROP_MAX;
            }
            saveFlock(true);
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
        removeSheep(oldest, 'eviction');
      }
      var initCounts = { alle9: 0, kranz: 0 };
      if (opts.scoreType === 'kranz') initCounts.kranz = 1;
      else initCounts.alle9 = 1;
      var createOpts = { ownerName: ownerName || '', scoreCounts: initCounts };
      /* Vanilla-Modus: Schaf ohne jedes Accessoire, Standard-Propeller */
      if (opts.vanilla) {
        var tr = generateTraits();
        tr.accessory = null;
        tr.spriteHat = -1;
        tr.spriteGlasses = -1;
        tr.spriteStache = -1;
        tr.headMul = 1.0;
        tr.propBladeCount = 2;
        tr.propBladeColor = '#ffd740';
        tr.propHubColor = '#666';
        tr.propSize = 1.0;
        tr.propShape = 'standard';
        createOpts.traits = tr;
      }
      var sh = createSheep(x, y, String(ownerId || ''), letter, createOpts);
      sh.propSpeed = PROP_MAX * 0.7;
      sh.state = 'dart';
      sh.target = newTarget();
      sh.stTimer = 0;
      sh.stDur = 3000 + Math.random() * 2000;
      sh.showNameTimer = 10000;
      /* Alle anderen Schafe kommen begruessen */
      for (var gi = 0; gi < flock.length; gi++) {
        var o = flock[gi];
        if (o === sh || o === dragSheep || o.state === 'departing' || o.state === 'scared') continue;
        if (o.resumeDelay > 0 || o.throwBoost > 0) continue;
        o.state = 'greet'; o.stTimer = 0;
        o.stDur = 15000 + Math.random() * 10000;
        o.greetTarget = sh; o.greetPhase = 0;
        o.age = 0; /* Aufwachen — volles Tempo */
        o.propSpeed = PROP_MAX;
      }
      saveFlock(true);
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
        logSheepDeath(sh, 'dismissed');
        sh.state = 'departing';
        sh.target = { x: tx !== undefined ? tx : sh.x, y: ty !== undefined ? ty : -100 };
        sh.stTimer = 0;
        sh.propSpeed = PROP_MAX;
      }
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    },
    epicUpgrade: function (event) {
      var memberId = String(event.memberId);
      var targetSheep = null;
      for (var i = 0; i < flock.length; i++) {
        if (flock[i].ownerId === memberId) { targetSheep = flock[i]; break; }
      }
      if (!targetSheep) return;

      var cfg = sheepCfg();

      if (event.reward === 'body') {
        targetSheep.traits.spriteBody = event.slotIndex;
        var bodyCfg = cfg.spriteBody || {};
        var bodySlots = bodyCfg.customSlots || [];
        var bodyCs = bodySlots[event.slotIndex];
        if (bodyCs) {
          var bdEl = document.createElement('div');
          bdEl.className = 's-sprite-body epic-shimmer';
          bdEl.style.width = targetSheep.dom.torso.style.width;
          bdEl.style.height = targetSheep.dom.torso.style.height;
          bdEl.style.borderRadius = '50%';
          if (bodyCs.image) {
            bdEl.style.backgroundImage = 'url(' + bodyCs.image + ')';
            bdEl.style.backgroundSize = 'contain';
            bdEl.style.backgroundPosition = 'center';
          }
          var ebY = (bodyCfg.offsetY || 0) + (bodyCs.dY || 0);
          var ebX = (bodyCfg.offsetX || 0) + (bodyCs.dX || 0);
          var ebS = (bodyCfg.scale != null ? bodyCfg.scale : 1) * (bodyCs.dS || 1);
          bdEl.dataset.offsetY = String(ebY);
          bdEl.dataset.offsetX = String(ebX);
          bdEl.dataset.spriteScale = String(ebS);
          targetSheep.dom.wrap.appendChild(bdEl);
          targetSheep.dom.bodySprite = bdEl;
        }
      } else {
        targetSheep.traits.spriteTail = event.slotIndex;
        var tlEl = document.createElement('div');
        tlEl.className = 's-sprite-tail epic-shimmer';
        applyCustomSpriteOverlay(targetSheep.dom.tail, tlEl, event.slotIndex, cfg.spriteTail || {});
        targetSheep.dom.tail.style.background = 'none';
        targetSheep.dom.tail.style.border = 'none';
      }

      spawnPuff(targetSheep.x, targetSheep.y, 30);
      spawnStars(targetSheep.x, targetSheep.y, 6);

      targetSheep.wobbleV += (Math.random() > .5 ? 1 : -1) * 18;
      targetSheep.wideEyes = 2000;
      targetSheep.propSpeed = PROP_MAX;
      targetSheep.showNameTimer = 8000;

      saveFlock(true);
    },
    spawnCritter: function (x, y) {
      if (x == null || x < 10 || x > W - 10) x = 10 + Math.random() * (W - 20);
      if (y == null || y < 10 || y > H - 10) y = 10 + Math.random() * (H - 20);
      return spawnCritter(x, y);
    },
  };

  /* ═══ Start ═══ */
  try { restoreFlock(); } catch (e) { console.warn('restoreFlock failed, clearing stale data:', e); try { sessionStorage.removeItem(STORAGE_KEY); } catch (e2) {} }
  /* Animation erst starten wenn Browser idle ist (Spritesheets geladen, Layout fertig) */
  function startLoop() { lastT = 0; requestAnimationFrame(frame); }
  if (window.requestIdleCallback) {
    requestIdleCallback(startLoop, { timeout: 300 });
  } else {
    setTimeout(startLoop, 150);
  }
  window.addEventListener('resize', function () { W = innerWidth; H = innerHeight; });

})();
