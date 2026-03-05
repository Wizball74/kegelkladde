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

  /* ═══ Schaf-Gatter (Pen) ═══ */
  var penEl = document.getElementById('sheep-pen');
  var penned = [];  // Schafe im Gatter
  function initPen() {
    if (!penEl) return;
    var label = document.createElement('span');
    label.className = 'pen-label';
    label.textContent = 'Gatter';
    penEl.appendChild(label);
  }
  initPen();
  function updatePenVisibility() {
    if (!penEl) return;
    var hasSheep = penned.length > 0;
    penEl.classList.toggle('pen-has-sheep', hasSheep);
    penEl.classList.toggle('pen-visible', hasSheep || !!dragSheep);
  }
  function renderPenPose(sh) {
    /* Neutrale Ruhepose: kein Bank, kein Bob, kein Wobble */
    var saved = { bank: sh.bank, wobble: sh.wobble, bobPhase: sh.bobPhase, headAngle: sh.headAngle, wideEyes: sh.wideEyes, tailSide: sh.tailSide, showNameTimer: sh.showNameTimer };
    sh.bank = 0; sh.wobble = 0; sh.bobPhase = 0; sh.headAngle = 0;
    sh.wideEyes = 0; sh.tailSide = 0; sh.showNameTimer = 0;
    render(sh);
    /* Werte wiederherstellen (für unpen) */
    sh.bank = saved.bank; sh.wobble = saved.wobble; sh.bobPhase = saved.bobPhase;
    sh.headAngle = saved.headAngle; sh.wideEyes = saved.wideEyes;
    sh.tailSide = saved.tailSide; sh.showNameTimer = saved.showNameTimer;
  }
  function penSheep(sh) {
    if (penned.indexOf(sh) !== -1) return;
    var fi = flock.indexOf(sh);
    if (fi !== -1) flock.splice(fi, 1);
    penned.push(sh);
    sh.state = 'penned';
    sh.vx = 0; sh.vy = 0;
    sh.propSpeed = 0;
    sh.wideEyes = 0;
    /* Neutrale Pose rendern, dann DOM ins Gatter verschieben */
    if (sh.dom && sh.dom.wrap && penEl) {
      renderPenPose(sh);
      var penScale = 0.75 * Math.min(sh.sizeMultiplier, 1.5);
      sh.dom.wrap.style.transform = 'translate(16px, 18px) scale(' + penScale + ')';
      penEl.appendChild(sh.dom.wrap);
    }
    /* Name-Bubble ausblenden */
    if (sh.dom && sh.dom.nameEl) sh.dom.nameEl.style.display = 'none';
    updatePenVisibility();
    markDirty();
  }
  function unpenSheep(sh, x, y) {
    var pi = penned.indexOf(sh);
    if (pi !== -1) penned.splice(pi, 1);
    flock.push(sh);
    sh.state = 'hover';
    sh.x = x; sh.y = y;
    sh.propSpeed = PROP_MAX * 0.5;
    sh.age = 0;
    sh.throwBoost = 2000; sh.resumeDelay = 800;
    /* DOM zurück ins Overlay */
    if (sh.dom && sh.dom.wrap && overlay) {
      sh.dom.wrap.style.transform = '';
      overlay.appendChild(sh.dom.wrap);
    }
    updatePenVisibility();
    markDirty();
  }

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
    var scale = (Math.random() < 0.7 ? 0.9 : Math.random() < 0.7 ? 0.7 : 0.6) + Math.random() * 0.8;
    var chub = 0.7 + Math.random() * 0.7;
    var legMul = 0.9 + Math.random() * 0.8;
    var headMul = 0.75 + Math.random() * 0.5;
    var woolColors = ['white', 'white', 'white', '#f5f0e0', '#eee', '#f0e6d3',
                      '#e8ddd0', '#f5e6f0', '#e0f0e8', '#f0f0d8', '#ffe8d6'];
    var woolColor = isBlack ? '#3a3a3a' : woolColors[Math.random() * woolColors.length | 0];
    var borderColor = isBlack ? '#1a1a1a' : '#444';
    var skinColor = isBlack ? '#2a2a2a' : '#444';
    var sCfg = sheepCfg();
    var hatCount = 25 + ((sCfg.spriteHat && sCfg.spriteHat.customSlots) || []).length;
    var glCount = 32 + ((sCfg.spriteGlasses && sCfg.spriteGlasses.customSlots) || []).length;
    var stCount = 12 + ((sCfg.spriteStache && sCfg.spriteStache.customSlots) || []).length;
    var spriteHat = Math.random() < 0.55 ? (Math.random() * hatCount | 0) : -1;
    var spriteGlasses = Math.random() < 0.40 ? (Math.random() * glCount | 0) : -1;
    var spriteStache = Math.random() < 0.35 ? (Math.random() * stCount | 0) : -1;
    var spriteBody = -1;  // nur via Epic-Meilenstein
    var spriteTail = -1;  // nur via Epic-Meilenstein
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
    return { scale: scale, chub: chub, legMul: legMul, headMul: headMul, woolColor: woolColor, borderColor: borderColor, skinColor: skinColor, isBlack: isBlack, legs: legs, legPhases: legPhases, legRestAngles: legRestAngles, tailSize: tailSize, spriteHat: spriteHat, spriteGlasses: spriteGlasses, spriteStache: spriteStache, spriteBody: spriteBody, spriteTail: spriteTail, energy: energy, curiosity: curiosity, sociability: sociability, hasKnees: hasKnees, propBladeCount: propBladeCount, propBladeColor: propBladeColor, propHubColor: propHubColor, propSize: propSize, propShape: propShape };
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
      /* Scale vom Kind → Parent verschieben (einheitlicher transform-origin) */
      tail.dataset.spriteScale = tlEl.style.transform || '';
      tlEl.style.transform = '';
      tail.style.background = 'none';
      tail.style.border = 'none';
      tail.style.borderRadius = '0';
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

    /* Sprite-Overlays */
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
      wideEyes: 0, kickLeg: -1, kickTimer: 0, kickCD: (1500 + Math.random() * 2500) / (traits.energy || 1), critterPause: 0, chasingCritter: null,
      socialTarget: null, collisionCD: 0,
      scareCorner: null, canSpreadFear: false,
      solo: opts.solo != null ? opts.solo : Math.random() < (1 - (traits.sociability != null ? traits.sociability : 0.5)),
      soloTimer: (15000 + Math.random() * 30000) + (Math.random() < (1 - (traits.sociability != null ? traits.sociability : 0.5)) ? (1 - (traits.sociability || 0.5)) * 240000 : (traits.sociability || 0.5) * 240000),
      tailSide: opts.tailSide || 0,
      legDragX: 0, legDragY: 0,
      groupData: null, headbuttPartner: null, headbuttPhase: 0,
      followTarget: null, bullyTarget: null, fenceJumpPhase: 'wait',
      cuddlePartner: null, piggybackRider: null, piggybackMount: null,
      napPhase: 0, napSleeping: false, raceTarget: null,
      argumentPhase: 0, argumentPartner: null, argumentTimer: 0, argumentWinner: false,
      keepawayRole: null, keepawayImmunity: 0, keepawayTags: 0,
      leapfrogPhase: 'wait', leapfrogLineX: 0, wakeUpTarget: null,
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
      if (en < 1.0) opts.push({ id: 'nap', w: 0.5 + (1 - en) * 1.5 });
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
      if (en < 1.0) opts.push({ id: 'nap', w: 0.5 + (1 - en) * 1.5 });
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
        /* Nahe kreisendes Schaf suchen → Orbit beitreten */
        var joined = false;
        for (var ci = 0; ci < flock.length; ci++) {
          var other = flock[ci];
          if (other === sh || other.state !== 'circle') continue;
          var cdist = Math.hypot(other.x - sh.x, other.y - sh.y);
          if (cdist < 200) {
            sh.orbitCenter = other.orbitCenter; // selbe Referenz!
            sh.orbitRadius = other.orbitRadius + (Math.random() - 0.5) * 10;
            sh.orbitDir = other.orbitDir;
            sh.orbitAngle = Math.atan2(sh.y - sh.orbitCenter.y, sh.x - sh.orbitCenter.x);
            sh.stDur = Math.max(10000, other.stDur - other.stTimer + Math.random() * 5000);
            joined = true;
            break;
          }
        }
        if (!joined) {
          sh.orbitRadius = (sh.solo ? 80 : 60) + Math.random() * (sh.solo ? 120 : 90);
          sh.orbitDir = Math.random() > .5 ? 1 : -1;
          /* Zentrum versetzt: nicht auf dem Schaf, sondern Radius-weit daneben */
          var cOffAngle = Math.random() * Math.PI * 2;
          sh.orbitCenter = { x: sh.x + Math.cos(cOffAngle) * sh.orbitRadius, y: sh.y + Math.sin(cOffAngle) * sh.orbitRadius };
          /* Startwinkel: Schaf ist schon am Rand des Kreises */
          sh.orbitAngle = cOffAngle + Math.PI;
          /* 20–60s */
          sh.stDur = 20000 + Math.random() * 40000;
        }
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
      case 'nap':
        sh.state = 'nap';
        sh.napPhase = 0;
        sh.napSleeping = true;
        sh.stDur = 8000 + Math.random() * 12000;
        break;
    }
  }

  /* ═══ Gruppenaktionen ═══ */
  var GROUP_STATES = ['headbutt', 'followLeader', 'followLine', 'circleDance', 'fenceJump', 'bully', 'dance', 'greet', 'nap', 'wakeUp', 'race', 'cuddle', 'leapfrog', 'argument', 'keepaway', 'huckepack'];
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
    sh.headbuttTimer = 0;
    sh.followTarget = null;
    sh.bullyTarget = null;
    sh.fenceJumpPhase = 'wait';
    sh.napSleeping = false; sh.napPhase = 0; sh.wakeUpTarget = null;
    sh.cuddlePartner = null; sh.raceTarget = null;
    sh.argumentPartner = null; sh.argumentPhase = 0; sh.argumentTimer = 0; sh.argumentWinner = false;
    sh.leapfrogPhase = 'wait'; sh.leapfrogLineX = 0;
    sh.keepawayRole = null; sh.keepawayImmunity = 0;
    sh.piggybackRider = null; sh.piggybackMount = null;
    if (sh.dom) {
      sh.dom.lfl.style.display = ''; sh.dom.lfr.style.display = '';
      sh.dom.lbl.style.display = ''; sh.dom.lbr.style.display = '';
      sh.dom.wrap.style.zIndex = '';
    }
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
    if (available.length >= 2) { possible.push('headbutt'); possible.push('bully'); possible.push('dance'); possible.push('cuddle'); possible.push('race'); possible.push('argument'); possible.push('leapfrog'); possible.push('huckepack'); }
    if (available.length >= 3) { possible.push('followLeader'); possible.push('keepaway'); }
    if (available.length >= 4) possible.push('circleDance');
    if (available.length >= 3) possible.push('fenceJump');
    var action = possible[Math.random() * possible.length | 0];
    switch (action) {
      case 'headbutt': startHeadbutt(available); break;
      case 'bully': startBully(available); break;
      case 'dance': startDance(available); break;
      case 'followLeader': startFollowLeader(available); break;
      case 'circleDance': startCircleDance(available); break;
      case 'fenceJump': startFenceJump(available); break;
      case 'cuddle': startCuddle(available); break;
      case 'race': startRace(available); break;
      case 'argument': startArgument(available); break;
      case 'leapfrog': startLeapfrog(available); break;
      case 'keepaway': startKeepaway(available); break;
      case 'huckepack': startHuckepack(available); break;
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
    a.groupData = { type: 'headbutt' }; a.headbuttPartner = b; a.headbuttPhase = 0; a.headbuttTimer = 0;
    b.state = 'headbutt'; b.stTimer = 0; b.stDur = dur;
    b.groupData = { type: 'headbutt' }; b.headbuttPartner = a; b.headbuttPhase = 0; b.headbuttTimer = 0;
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
    var dur = 6000 + Math.random() * 8000;
    var dir = Math.random() > 0.5 ? 1 : -1;
    var center = { x: cx, y: cy };
    var data = { type: 'dance', center: center, partner: [a, b] };
    a.state = 'dance'; a.stTimer = 0; a.stDur = dur; a.danceWindDown = 0;
    a.groupData = data; a.orbitCenter = center;
    a.orbitAngle = 0; a.orbitRadius = radius; a.orbitDir = dir;
    b.state = 'dance'; b.stTimer = 0; b.stDur = dur + 1000 + Math.random() * 2000; b.danceWindDown = 0;
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

  function startCuddle(available) {
    /* 2 Schafe mit höchster sociability */
    available.sort(function (a, b) {
      return (b.traits.sociability || 0.5) - (a.traits.sociability || 0.5);
    });
    var a = available[0], b = available[1];
    if (!a || !b) return;
    var dur = 10000 + Math.random() * 10000;
    var data = { type: 'cuddle', pair: [a, b] };
    a.state = 'cuddle'; a.stTimer = 0; a.stDur = dur; a.groupData = data; a.cuddlePartner = b;
    b.state = 'cuddle'; b.stTimer = 0; b.stDur = dur; b.groupData = data; b.cuddlePartner = a;
  }

  function startRace(available) {
    var n = Math.min(available.length, 3);
    var participants = available.slice(0, n);
    /* Ziel: zufälliger Critter (wenn vorhanden), sonst Zufallspunkt */
    var target = null;
    if (critters.length) {
      var liveCritters = [];
      for (var ci = 0; ci < critters.length; ci++) { if (!critters[ci].launched) liveCritters.push(critters[ci]); }
      if (liveCritters.length) target = liveCritters[Math.random() * liveCritters.length | 0];
    }
    var fixedTarget = target ? null : { x: MARGIN + Math.random() * (W - MARGIN * 2), y: MARGIN + Math.random() * (H - MARGIN * 2) };
    var dur = 15000;
    var data = { type: 'race', critterTarget: target, fixedTarget: fixedTarget, participants: participants, winner: null, endTimer: 0 };
    for (var i = 0; i < participants.length; i++) {
      var sh = participants[i];
      sh.state = 'race'; sh.stTimer = 0; sh.stDur = dur;
      sh.groupData = data; sh.raceTarget = target || fixedTarget;
    }
  }

  function startArgument(available) {
    /* 2 Schafe mit höchster energy */
    available.sort(function (a, b) {
      return (b.traits.energy || 1) - (a.traits.energy || 1);
    });
    var a = available[0], b = available[1];
    if (!a || !b) return;
    var dur = 12000 + Math.random() * 8000;
    var data = { type: 'argument', pair: [a, b] };
    a.state = 'argument'; a.stTimer = 0; a.stDur = dur; a.groupData = data;
    a.argumentPartner = b; a.argumentPhase = 0; a.argumentTimer = 0; a.argumentWinner = false;
    b.state = 'argument'; b.stTimer = 0; b.stDur = dur; b.groupData = data;
    b.argumentPartner = a; b.argumentPhase = 0; b.argumentTimer = 0; b.argumentWinner = false;
  }

  function startLeapfrog(available) {
    var n = Math.min(available.length, 4);
    available.sort(function (a, b) { return a.x - b.x; });
    var participants = available.slice(0, n);
    var startX = participants[0].x;
    var dur = n * 5000 + 8000;
    var data = { type: 'leapfrog', activeIdx: 0, participants: participants };
    for (var i = 0; i < participants.length; i++) {
      var sh = participants[i];
      sh.state = 'leapfrog'; sh.stTimer = 0; sh.stDur = dur;
      sh.groupData = data;
      sh.leapfrogPhase = i === 0 ? 'jump' : 'wait';
      sh.leapfrogLineX = startX + i * 40;
    }
  }

  function startKeepaway(available) {
    var n = Math.min(available.length, 5);
    var participants = available.slice(0, n);
    var chaserIdx = Math.random() * n | 0;
    var dur = 20000 + Math.random() * 10000;
    var data = { type: 'keepaway', participants: participants, chaser: participants[chaserIdx], maxTags: 4 + (Math.random() * 3 | 0), totalTags: 0 };
    for (var i = 0; i < participants.length; i++) {
      var sh = participants[i];
      sh.state = 'keepaway'; sh.stTimer = 0; sh.stDur = dur;
      sh.groupData = data;
      sh.keepawayRole = (i === chaserIdx) ? 'chaser' : 'runner';
      sh.keepawayImmunity = 0; sh.keepawayTags = 0;
    }
  }

  function startHuckepack(available) {
    /* Paar mit ≥1.3× Größenunterschied finden */
    var bestPair = null, bestRatio = 0;
    for (var i = 0; i < available.length; i++) {
      for (var j = i + 1; j < available.length; j++) {
        var sA = available[i].traits.scale * available[i].sizeMultiplier;
        var sB = available[j].traits.scale * available[j].sizeMultiplier;
        var ratio = Math.max(sA, sB) / Math.min(sA, sB);
        if (ratio >= 1.3 && ratio > bestRatio) {
          bestRatio = ratio;
          bestPair = sA >= sB ? [available[i], available[j]] : [available[j], available[i]];
        }
      }
    }
    if (!bestPair) return;
    var mount = bestPair[0], rider = bestPair[1];
    var dur = 15000 + Math.random() * 15000;
    var data = { type: 'huckepack', mount: mount, rider: rider, phase: 0 };
    mount.state = 'huckepack'; mount.stTimer = 0; mount.stDur = dur;
    mount.groupData = data; mount.piggybackRider = rider;
    rider.state = 'huckepack'; rider.stTimer = 0; rider.stDur = dur;
    rider.groupData = data; rider.piggybackMount = mount;
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

  /* Critter-Jagd: Schaf lenkt auf nahen Critter zu */
  function chaseCritter(sh, S) {
    if (!critters.length) return false;
    if (sh.critterPause > 0) return false;   // nach Kick kurz Abstand halten
    /* Gezieltes Target (nach eigenem Kick oder vorbeifliegender Ball) */
    if (sh.chasingCritter) {
      var cc = sh.chasingCritter;
      if (cc.launched || critters.indexOf(cc) === -1) { sh.chasingCritter = null; }
      else {
        var cd = Math.hypot(cc.x - sh.x, cc.y - sh.y);
        if (cd > 500 * sh.sizeMultiplier) { sh.chasingCritter = null; } // sehr weit, aufgeben
        /* Nah dran aber Kick-CD aktiv → 90 % loslassen, 10 % "Kuschelkick" */
        else if (cd < 25 * sh.sizeMultiplier && cc.kickCD[flock.indexOf(sh)] > 0) {
          if (Math.random() < 0.9) { sh.chasingCritter = null; sh.critterPause = 600; }
          else return true;  // Bug-Feature: ineinander kleben bleiben
        }
        else {
          var cdx = cc.x - sh.x, cdy = cc.y - sh.y, cdd = cd || 1;
          /* Stärker beschleunigen je weiter weg (Spurt-Effekt) */
          var urgency = Math.min(cd / 80, 2.5);
          sh.vx += (cdx / cdd) * S * (3 + urgency); sh.vy += (cdy / cdd) * S * (3 + urgency);
          sh.headTarget = Math.max(-30, Math.min(30, cdx * 0.4));
          sh.propSpeed = Math.min(sh.propSpeed + 2, PROP_MAX);
          return true;
        }
      }
    }
    /* Opportunistisch: nächsten Critter in Reichweite jagen */
    var best = null, bestD = 150 * sh.sizeMultiplier;
    for (var ci = 0; ci < critters.length; ci++) {
      var cr = critters[ci];
      if (cr.launched) continue;
      var d = Math.hypot(cr.x - sh.x, cr.y - sh.y);
      if (d < bestD) { bestD = d; best = cr; }
    }
    if (!best) return false;
    var dx = best.x - sh.x, dy = best.y - sh.y, d = bestD || 1;
    sh.vx += (dx / d) * S * 3; sh.vy += (dy / d) * S * 3;
    sh.headTarget = Math.max(-30, Math.min(30, dx * 0.4));
    sh.propSpeed = Math.min(sh.propSpeed + 1, PROP_MAX * 0.8);
    return true;
  }

  function behaveDart(sh, dt, t, S) {
    var d = Math.hypot(sh.target.x - sh.x, sh.target.y - sh.y);
    if (sh.stTimer > sh.stDur) { pickNext(sh); return; }
    if (chaseCritter(sh, S)) return;
    if (d < 20) { sh.target = sh.solo ? newTarget() : nearTarget(sh, 200); }
    steerTo(sh, sh.target.x, sh.target.y, S * 1.4);
    sh.headTarget = Math.max(-22, Math.min(22, sh.vx * 5));
  }

  function behaveExplore(sh, dt, t, S) {
    var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
    if (sh.stTimer > sh.stDur) { pickNext(sh); return; }
    if (chaseCritter(sh, S)) return;
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
    /* Nahe idle-Schafe anlocken: ~1% Chance/Frame, max 1 Rekrut */
    if (Math.random() < 0.0003) {
      for (var ri = 0; ri < flock.length; ri++) {
        var recruit = flock[ri];
        if (recruit === sh || recruit === dragSheep) continue;
        if (recruit.state !== 'explore' && recruit.state !== 'hover' && recruit.state !== 'dart') continue;
        if (recruit.resumeDelay > 0 || recruit.throwBoost > 0) continue;
        var rd = Math.hypot(recruit.x - sh.orbitCenter.x, recruit.y - sh.orbitCenter.y);
        if (rd < sh.orbitRadius + 120) {
          recruit.state = 'circle'; recruit.stTimer = 0;
          recruit.stDur = Math.max(10000, sh.stDur - sh.stTimer + Math.random() * 5000);
          recruit.orbitCenter = sh.orbitCenter;
          recruit.orbitRadius = sh.orbitRadius + (Math.random() - 0.5) * 10;
          recruit.orbitDir = sh.orbitDir;
          recruit.orbitAngle = Math.atan2(recruit.y - sh.orbitCenter.y, recruit.x - sh.orbitCenter.x);
          break;
        }
      }
    }
    if (sh.stTimer > sh.stDur) pickNext(sh);
  }

  function behaveZigzag(sh, dt, t, S) {
    var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
    if (sh.stTimer > sh.stDur) { pickNext(sh); return; }
    if (chaseCritter(sh, S)) return;
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
    /* Phase 0: Anlauf — rückwärts voneinander entfernen */
    if (sh.headbuttPhase === 0) {
      sh.headTarget = Math.max(-30, Math.min(30, Math.atan2(dy, dx) * 180 / Math.PI));
      if (d < 80) {
        var awayX = -dx / (d || 1), awayY = -dy / (d || 1);
        sh.vx += awayX * S * 1.5; sh.vy += awayY * S * 1.5;
      } else {
        sh.vx *= 0.85; sh.vy *= 0.85;
      }
      if (!sh.headbuttTimer) sh.headbuttTimer = 0;
      sh.headbuttTimer += dt;
      if (sh.headbuttTimer > 1200 && d >= 60) {
        sh.headbuttPhase = 1; sh.headbuttTimer = 0;
        sh.vx *= 0.3; sh.vy *= 0.3;
      }
    }
    /* Phase 1: Kurze Pause — Schafe schauen sich an */
    else if (sh.headbuttPhase === 1) {
      sh.vx *= 0.88; sh.vy *= 0.88;
      sh.headTarget = Math.max(-30, Math.min(30, Math.atan2(dy, dx) * 180 / Math.PI));
      if (!sh.headbuttTimer) sh.headbuttTimer = 0;
      sh.headbuttTimer += dt;
      if (sh.headbuttTimer > 600) {
        sh.headbuttPhase = 2; sh.headbuttTimer = 0;
      }
    }
    /* Phase 2: Vollgas aufeinander zu */
    else if (sh.headbuttPhase === 2) {
      sh.headTarget = Math.max(-30, Math.min(30, Math.atan2(dy, dx) * 180 / Math.PI));
      /* Velocity direkt auf Partner setzen statt aufaddieren (verhindert Orbit) */
      var chargeSpeed = 4 + S * 2;
      sh.vx = (dx / (d || 1)) * chargeSpeed; sh.vy = (dy / (d || 1)) * chargeSpeed;
      sh.propSpeed = Math.min(sh.propSpeed + 2, PROP_MAX);
      if (!sh.headbuttTimer) sh.headbuttTimer = 0;
      sh.headbuttTimer += dt;
      /* Timeout: nach 3s Aufprall erzwingen falls sie sich verfehlen */
      if (sh.headbuttTimer > 3000) d = 0;
      if (d < 15) {
        sh.headbuttPhase = 3;
        spawnStars((sh.x + partner.x) / 2, (sh.y + partner.y) / 2, 5 + (Math.random() * 4 | 0));
        sh.wobbleV += (Math.random() > 0.5 ? 1 : -1) * 18;
        sh.wideEyes = 2000;
        var rx = sh.x - partner.x, ry = sh.y - partner.y, rd = Math.hypot(rx, ry) || 1;
        sh.vx = (rx / rd) * 4.5; sh.vy = (ry / rd) * 4.5;
        sh.propSpeed = Math.min(sh.propSpeed + 25, PROP_MAX);
        sh.stDur = sh.stTimer + 1000;
      }
    }
    /* Phase 3: Rückstoß + Abklingen */
    else {
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
    var partners = sh.groupData.partner;
    /* Tote Partner entfernen */
    for (var pi = partners.length - 1; pi >= 0; pi--) {
      if (partners[pi] !== sh && (flock.indexOf(partners[pi]) === -1 || partners[pi].state !== 'dance')) partners.splice(pi, 1);
    }
    /* Allein übrig → noch kurz weitertanzen, dann aufhören */
    if (partners.length < 2) {
      if (!sh.danceWindDown) sh.danceWindDown = 800 + Math.random() * 1500;
      sh.danceWindDown -= dt;
      if (sh.danceWindDown <= 0) { sh.danceWindDown = 0; endGroupAction(sh); return; }
    }
    sh.orbitAngle += dt * 0.003 * sh.orbitDir;
    var center = sh.groupData.center;
    var tx = center.x + Math.cos(sh.orbitAngle) * sh.orbitRadius;
    var ty = center.y + Math.sin(sh.orbitAngle) * sh.orbitRadius;
    /* Position sanft auf Kreisbahn ziehen statt nur beschleunigen */
    sh.x += (tx - sh.x) * 0.08;
    sh.y += (ty - sh.y) * 0.08;
    sh.vx = (tx - sh.x) * 0.5;
    sh.vy = (ty - sh.y) * 0.5;
    /* Kopf zum nächsten Partner drehen */
    var nearest = null, nearD = Infinity;
    for (var ni = 0; ni < partners.length; ni++) {
      if (partners[ni] === sh) continue;
      var nd = Math.hypot(partners[ni].x - sh.x, partners[ni].y - sh.y);
      if (nd < nearD) { nearD = nd; nearest = partners[ni]; }
    }
    if (nearest) sh.headTarget = Math.max(-35, Math.min(35, (nearest.x - sh.x) * 0.35));
    /* Vorbeifliegende Schafe zum Mittanzen einladen (nur erster Partner prüft) */
    if (sh === partners[0]) {
      for (var ri = 0; ri < flock.length; ri++) {
        var recruit = flock[ri];
        if (recruit.state !== 'explore' && recruit.state !== 'dart') continue;
        var rd = Math.hypot(recruit.x - center.x, recruit.y - center.y);
        if (rd < sh.orbitRadius + 40) {
          var angle = Math.atan2(recruit.y - center.y, recruit.x - center.x);
          var remaining = sh.stDur - sh.stTimer;
          recruit.state = 'dance'; recruit.stTimer = 0;
          recruit.stDur = remaining + Math.random() * 2000;
          recruit.groupData = sh.groupData; recruit.orbitCenter = center;
          recruit.orbitAngle = angle; recruit.orbitRadius = sh.orbitRadius; recruit.orbitDir = sh.orbitDir;
          partners.push(recruit);
        }
      }
    }
    if (sh.stTimer > sh.stDur) { sh.danceWindDown = 0; endGroupAction(sh); }
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

  /* ═══ Nap ═══ */
  function behaveNap(sh, dt, t, S) {
    sh.napSleeping = true;
    /* Drift nach unten, decelerate */
    sh.vy += 0.02;
    sh.vx *= 0.94; sh.vy *= 0.96;
    sh.propSpeed = Math.max(PROP_BASE, sh.propSpeed * 0.98);
    sh.headTarget += (-25 - sh.headTarget) * 0.05;
    if (sh.stTimer > sh.stDur) {
      /* Natürlich aufwachen */
      sh.napSleeping = false;
      spawnStars(sh.x, sh.y - 5, 2);
      sh.wobbleV += (Math.random() - 0.5) * 8;
      endGroupAction(sh);
    }
  }

  /* ═══ WakeUp (Waker steuert zum Napper) ═══ */
  function behaveWakeUp(sh, dt, t, S) {
    if (!sh.wakeUpTarget || flock.indexOf(sh.wakeUpTarget) === -1 || sh.wakeUpTarget.state !== 'nap') {
      endGroupAction(sh); return;
    }
    var napper = sh.wakeUpTarget;
    var dx = napper.x - sh.x, dy = napper.y - sh.y, d = Math.hypot(dx, dy);
    steerTo(sh, napper.x, napper.y, S * 2.0);
    sh.propSpeed = Math.min(sh.propSpeed + 1, PROP_MAX * 0.7);
    sh.headTarget = Math.max(-30, Math.min(30, dx * 0.3));
    if (d < 20) {
      /* Bump! Weck-Stoß */
      var nx = dx / (d || 1), ny = dy / (d || 1);
      napper.vx += nx * 3; napper.vy += ny * 3 - 1;
      napper.wobbleV += (Math.random() - 0.5) * 14;
      napper.napSleeping = false;
      napper.wideEyes = 1500;
      spawnStars((sh.x + napper.x) / 2, (sh.y + napper.y) / 2, 4);
      sh.vx -= nx * 2; sh.vy -= ny * 2;
      sh.wobbleV += (Math.random() - 0.5) * 8;
      endGroupAction(napper);
      endGroupAction(sh);
    }
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  /* ═══ Cuddle ═══ */
  function behaveCuddle(sh, dt, t, S) {
    if (!sh.cuddlePartner || flock.indexOf(sh.cuddlePartner) === -1 || sh.cuddlePartner.state !== 'cuddle') {
      endGroupAction(sh); return;
    }
    var partner = sh.cuddlePartner;
    var mx = (sh.x + partner.x) / 2, my = (sh.y + partner.y) / 2;
    var d = steerTo(sh, mx, my, S * 0.8);
    if (d < 8) {
      /* Gentle bob, Augen zu */
      sh.napSleeping = true;
      sh.vx *= 0.9; sh.vy *= 0.9;
      sh.vy += Math.sin(t * 0.002 + sh.bobPhase) * 0.01;
      sh.propSpeed = Math.max(PROP_BASE + 3, sh.propSpeed * 0.99);
    } else {
      sh.napSleeping = false;
      sh.propSpeed = Math.min(sh.propSpeed + 0.5, PROP_MAX * 0.5);
    }
    sh.headTarget = Math.max(-20, Math.min(20, (partner.x - sh.x) * 0.3));
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  /* ═══ Race ═══ */
  function behaveRace(sh, dt, t, S) {
    if (!sh.groupData) { endGroupAction(sh); return; }
    var gd = sh.groupData;
    /* Zielposition bestimmen (Critter wird live getracked) */
    var tx, ty;
    if (gd.critterTarget && !gd.critterTarget.launched && critters.indexOf(gd.critterTarget) !== -1) {
      tx = gd.critterTarget.x; ty = gd.critterTarget.y;
    } else if (gd.fixedTarget) {
      tx = gd.fixedTarget.x; ty = gd.fixedTarget.y;
    } else {
      /* Critter verschwunden → festes Ziel setzen */
      gd.fixedTarget = { x: MARGIN + Math.random() * (W - MARGIN * 2), y: MARGIN + Math.random() * (H - MARGIN * 2) };
      gd.critterTarget = null;
      tx = gd.fixedTarget.x; ty = gd.fixedTarget.y;
    }
    if (gd.winner) {
      /* Nachspiel */
      gd.endTimer += dt;
      if (gd.winner === sh) {
        sh.vx *= 0.92; sh.vy *= 0.92;
        sh.headTarget = Math.sin(t * 0.01) * 30;
      } else {
        sh.headTarget = -20;
        sh.propSpeed = Math.max(PROP_BASE, sh.propSpeed * 0.97);
        sh.vx *= 0.95; sh.vy *= 0.95;
      }
      if (gd.endTimer > 2000) endGroupAction(sh);
      return;
    }
    /* Vollgas zum Ziel */
    var d = steerTo(sh, tx, ty, S * 2.5);
    sh.propSpeed = Math.min(sh.propSpeed + 2, PROP_MAX);
    sh.headTarget = Math.max(-25, Math.min(25, (tx - sh.x) * 0.2));
    if (d < 25) {
      /* Gewonnen! */
      gd.winner = sh;
      gd.endTimer = 0;
      spawnStars(sh.x, sh.y, 5 + (Math.random() * 3 | 0));
      sh.wobbleV += (Math.random() - 0.5) * 15;
      sh.showNameTimer = 3000;
      /* Critter-Ziel → Critter wird getreten */
      if (gd.critterTarget && !gd.critterTarget.launched && critters.indexOf(gd.critterTarget) !== -1) {
        var cr = gd.critterTarget;
        var nx = (cr.x - sh.x) / (d || 1), ny = (cr.y - sh.y) / (d || 1);
        cr.vx += nx * 5; cr.vy += ny * 5 - 3;
        cr.wobbleV += (Math.random() - 0.5) * 20;
        sh.kickLeg = Math.random() * 4 | 0; sh.kickTimer = 300;
      }
    }
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  /* ═══ Argument ═══ */
  function behaveArgument(sh, dt, t, S) {
    if (!sh.argumentPartner || flock.indexOf(sh.argumentPartner) === -1 || sh.argumentPartner.state !== 'argument') {
      endGroupAction(sh); return;
    }
    var partner = sh.argumentPartner;
    var dx = partner.x - sh.x, dy = partner.y - sh.y, d = Math.hypot(dx, dy);
    sh.argumentTimer += dt;

    if (sh.argumentPhase === 0) {
      /* Phase 0: face-off — 40px Abstand, schnelles Kopfwackeln */
      if (d < 35) {
        var awayX = -dx / (d || 1), awayY = -dy / (d || 1);
        sh.vx += awayX * S * 1.2; sh.vy += awayY * S * 1.2;
      } else if (d > 50) {
        steerTo(sh, partner.x, partner.y, S * 0.8);
      } else {
        sh.vx *= 0.9; sh.vy *= 0.9;
      }
      sh.headTarget = Math.sin(t * 0.02) * 35;
      if (sh.argumentTimer > 2000 + Math.random() * 2000) {
        sh.argumentPhase = 1; sh.argumentTimer = 0;
      }
    } else if (sh.argumentPhase === 1) {
      /* Phase 1: Eskalation — kurze Vorstöße */
      var surge = Math.sin(sh.argumentTimer * 0.005) > 0.6;
      if (surge) {
        steerTo(sh, partner.x, partner.y, S * 1.5);
      } else {
        if (d < 30) { sh.vx -= (dx / (d || 1)) * S * 0.8; sh.vy -= (dy / (d || 1)) * S * 0.8; }
        sh.vx *= 0.92; sh.vy *= 0.92;
      }
      sh.headTarget = Math.sin(t * 0.015) * 40;
      /* Gelegentlich mini-Sterne */
      if (Math.random() < 0.005) spawnStars((sh.x + partner.x) / 2, (sh.y + partner.y) / 2, 1);
      if (sh.argumentTimer > 2000 + Math.random() * 2000) {
        sh.argumentPhase = 2; sh.argumentTimer = 0;
      }
    } else if (sh.argumentPhase === 2) {
      /* Phase 2: Clash — Vollgas aufeinander */
      var chargeSpeed = 3 + S * 2;
      sh.vx = (dx / (d || 1)) * chargeSpeed; sh.vy = (dy / (d || 1)) * chargeSpeed;
      sh.propSpeed = Math.min(sh.propSpeed + 2, PROP_MAX);
      sh.headTarget = Math.max(-30, Math.min(30, Math.atan2(dy, dx) * 180 / Math.PI));
      if (d < 15 || sh.argumentTimer > 3000) {
        /* Clash! */
        spawnStars((sh.x + partner.x) / 2, (sh.y + partner.y) / 2, 8 + (Math.random() * 4 | 0));
        sh.wobbleV += (Math.random() > 0.5 ? 1 : -1) * 20;
        sh.wideEyes = 2000;
        /* Gewinner zufällig bestimmen (nur einmal) */
        if (!sh.argumentWinner && !partner.argumentWinner) {
          if (Math.random() < 0.5) { sh.argumentWinner = true; } else { partner.argumentWinner = true; }
        }
        var rx = sh.x - partner.x, ry = sh.y - partner.y, rd = Math.hypot(rx, ry) || 1;
        sh.vx = (rx / rd) * 4; sh.vy = (ry / rd) * 4;
        sh.argumentPhase = 3; sh.argumentTimer = 0;
      }
    } else {
      /* Phase 3: Aftermath */
      if (sh.argumentWinner) {
        sh.vx *= 0.92; sh.vy *= 0.92;
        sh.kickLeg = Math.random() * 4 | 0; sh.kickTimer = Math.max(sh.kickTimer, 200);
        sh.headTarget = Math.sin(t * 0.008) * 25;
      } else {
        /* Verlierer flieht */
        sh.headTarget = -20;
        if (d < 80) {
          sh.vx -= (dx / (d || 1)) * S * 1.5; sh.vy -= (dy / (d || 1)) * S * 1.5;
        }
        sh.vx *= 0.96; sh.vy *= 0.96;
      }
      if (sh.argumentTimer > 1500) endGroupAction(sh);
    }
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  /* ═══ Leapfrog ═══ */
  function behaveLeapfrog(sh, dt, t, S) {
    if (!sh.groupData) { endGroupAction(sh); return; }
    var gd = sh.groupData;
    var myIdx = gd.participants.indexOf(sh);
    if (sh.leapfrogPhase === 'wait') {
      /* In Linie warten */
      var waitX = sh.leapfrogLineX;
      sh.vx += (waitX - sh.x) * 0.004; sh.vy *= 0.92; sh.vx *= 0.95;
      sh.headTarget = Math.sin(sh.stTimer * 0.005) * 15;
      if (myIdx === gd.activeIdx) sh.leapfrogPhase = 'jump';
    } else if (sh.leapfrogPhase === 'jump') {
      /* Bocksprung: Bogen über nächstes Schaf */
      var targetIdx = myIdx + 1;
      if (targetIdx >= gd.participants.length) targetIdx = 0;
      var targetSh = gd.participants[targetIdx];
      var jumpTargetX = targetSh.leapfrogLineX + 40;
      var progress = Math.min(1, sh.leapfrogTimer ? sh.leapfrogTimer / 800 : 0);
      if (!sh.leapfrogTimer) sh.leapfrogTimer = 0;
      sh.leapfrogTimer += dt;
      progress = Math.min(1, sh.leapfrogTimer / 800);
      /* Horizontale Bewegung zum Ziel */
      sh.vx += (jumpTargetX - sh.x) * 0.008;
      /* Vertikaler Bogen */
      sh.vy = -Math.sin(progress * Math.PI) * 3;
      sh.propSpeed = Math.min(sh.propSpeed + 2, PROP_MAX);
      sh.headTarget = Math.max(-20, Math.min(20, sh.vx * 4));
      if (progress >= 1 || sh.leapfrogTimer > 1200) {
        /* Landung */
        sh.leapfrogPhase = 'done';
        sh.leapfrogTimer = 0;
        sh.leapfrogLineX = jumpTargetX;
        spawnStars(sh.x, sh.y, 3);
        sh.wobbleV += (Math.random() - 0.5) * 10;
        /* Nächstes Schaf aktivieren */
        gd.activeIdx++;
        if (gd.activeIdx < gd.participants.length) {
          gd.participants[gd.activeIdx].leapfrogPhase = 'jump';
          gd.participants[gd.activeIdx].leapfrogTimer = 0;
        }
      }
    } else {
      /* Done: warten */
      sh.vx *= 0.92; sh.vy *= 0.92;
      sh.headTarget = Math.sin(sh.stTimer * 0.004) * 20;
    }
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  /* ═══ Keepaway ═══ */
  function behaveKeepaway(sh, dt, t, S) {
    if (!sh.groupData) { endGroupAction(sh); return; }
    var gd = sh.groupData;
    sh.keepawayImmunity = Math.max(0, sh.keepawayImmunity - dt);

    if (sh.keepawayRole === 'chaser') {
      /* Jäger: nächstes nicht-immunes Schaf jagen */
      var bestTarget = null, bestD = Infinity;
      for (var i = 0; i < gd.participants.length; i++) {
        var r = gd.participants[i];
        if (r === sh || r.keepawayRole !== 'runner' || r.keepawayImmunity > 0) continue;
        if (flock.indexOf(r) === -1) continue;
        var d = Math.hypot(r.x - sh.x, r.y - sh.y);
        if (d < bestD) { bestD = d; bestTarget = r; }
      }
      if (bestTarget) {
        steerTo(sh, bestTarget.x, bestTarget.y, S * 2.5);
        sh.headTarget = Math.max(-30, Math.min(30, (bestTarget.x - sh.x) * 0.3));
        /* Tag-Check */
        if (bestD < 20 && bestTarget.keepawayImmunity <= 0) {
          spawnStars((sh.x + bestTarget.x) / 2, (sh.y + bestTarget.y) / 2, 4);
          sh.wobbleV += (Math.random() - 0.5) * 8;
          bestTarget.wobbleV += (Math.random() - 0.5) * 12;
          bestTarget.wideEyes = 1000;
          /* Rollentausch */
          sh.keepawayRole = 'runner';
          sh.keepawayImmunity = 2000;
          bestTarget.keepawayRole = 'chaser';
          gd.chaser = bestTarget;
          gd.totalTags++;
          if (gd.totalTags >= gd.maxTags) {
            for (var ei = 0; ei < gd.participants.length; ei++) {
              if (flock.indexOf(gd.participants[ei]) !== -1) endGroupAction(gd.participants[ei]);
            }
            return;
          }
        }
      } else {
        sh.vx *= 0.92; sh.vy *= 0.92;
      }
      sh.propSpeed = Math.min(sh.propSpeed + 1.5, PROP_MAX);
    } else {
      /* Runner: weg vom Jäger */
      var chaser = gd.chaser;
      if (chaser && flock.indexOf(chaser) !== -1) {
        var cdx = chaser.x - sh.x, cdy = chaser.y - sh.y, cd = Math.hypot(cdx, cdy);
        if (cd < 150 && cd > 0) {
          sh.vx -= (cdx / cd) * S * 1.8; sh.vy -= (cdy / cd) * S * 1.8;
        }
        sh.headTarget = Math.max(-30, Math.min(30, -cdx * 0.2));
      }
      sh.propSpeed = Math.min(sh.propSpeed + 0.8, PROP_MAX * 0.8);
    }
    if (sh.stTimer > sh.stDur) endGroupAction(sh);
  }

  /* ═══ Huckepack ═══ */
  function behaveHuckepack(sh, dt, t, S) {
    if (!sh.groupData) { endGroupAction(sh); return; }
    var gd = sh.groupData;
    var mount = gd.mount, rider = gd.rider;
    if (flock.indexOf(mount) === -1 || flock.indexOf(rider) === -1) {
      endGroupAction(sh); return;
    }

    if (gd.phase === 0) {
      /* Approach: Kleines steuert zum Großen */
      if (sh === rider) {
        var d = steerTo(sh, mount.x, mount.y - 15, S * 1.5);
        sh.propSpeed = Math.min(sh.propSpeed + 1, PROP_MAX * 0.7);
        sh.headTarget = Math.max(-25, Math.min(25, (mount.x - sh.x) * 0.3));
        if (d < 15) {
          gd.phase = 1;
          /* Beine verstecken, Propeller aus für Reiter */
          rider.dom.lfl.style.display = 'none'; rider.dom.lfr.style.display = 'none';
          rider.dom.lbl.style.display = 'none'; rider.dom.lbr.style.display = 'none';
          rider.dom.wrap.style.zIndex = '35';
        }
      } else {
        /* Mount hovert */
        sh.vx *= 0.92; sh.vy *= 0.92;
        sh.headTarget = Math.max(-20, Math.min(20, (rider.x - sh.x) * 0.2));
      }
    } else if (gd.phase === 1) {
      /* Mounted: Reiter auf dem Großen */
      if (sh === mount) {
        /* Explore-artig aber langsamer */
        var dx = sh.target.x - sh.x, dy = sh.target.y - sh.y, d = Math.hypot(dx, dy);
        if (d < 30) sh.target = newTarget();
        steerTo(sh, sh.target.x, sh.target.y, S * 0.7);
        sh.headTarget = Math.max(-20, Math.min(20, sh.vx * 4));
        sh.propSpeed = Math.min(sh.propSpeed + 0.3, PROP_MAX * 0.5);
      } else {
        /* Rider: Propeller aus, Position gelockt */
        sh.propSpeed = Math.max(PROP_BASE, sh.propSpeed * 0.95);
        sh.headTarget = Math.max(-15, Math.min(15, mount.vx * 3));
      }
      /* Dismount-Check: am Ende der Dauer */
      if (sh.stTimer > sh.stDur - 1500 && gd.phase === 1) {
        gd.phase = 2;
        /* Beine zurück */
        rider.dom.lfl.style.display = ''; rider.dom.lfr.style.display = '';
        rider.dom.lbl.style.display = ''; rider.dom.lbr.style.display = '';
        rider.dom.wrap.style.zIndex = '';
        /* Abspringen */
        rider.vx = mount.vx + (Math.random() - 0.5) * 4;
        rider.vy = mount.vy - 2.5;
        rider.wobbleV += (Math.random() - 0.5) * 12;
        spawnStars(rider.x, rider.y, 3);
      }
    } else {
      /* Phase 2: Dismount — beide frei */
      sh.vx *= 0.95; sh.vy *= 0.95;
      if (sh.stTimer > sh.stDur) endGroupAction(sh);
    }
    if (sh.stTimer > sh.stDur + 500) endGroupAction(sh);
  }

  var behaveHandlers = {
    hover: behaveHover, dart: behaveDart, explore: behaveExplore,
    circle: behaveCircle, zigzag: behaveZigzag, curious: behaveCurious,
    social: behaveSocial, scared: behaveScared, headbutt: behaveHeadbutt,
    followLeader: behaveFollowLeader, followLine: behaveFollowLine,
    circleDance: behaveCircleDance, fenceJump: behaveFenceJump,
    dance: behaveDance, bully: behaveBully, dizzy: behaveDizzy,
    departing: behaveDeparting, retreat: behaveRetreat, greet: behaveGreet,
    nap: behaveNap, wakeUp: behaveWakeUp, cuddle: behaveCuddle,
    race: behaveRace, argument: behaveArgument, leapfrog: behaveLeapfrog,
    keepaway: behaveKeepaway, huckepack: behaveHuckepack
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

    if (sh.napSleeping) { sh.isBlinking = true; sh.blinkDur = 999; }
    else if (sh.isBlinking) { sh.blinkDur -= dt; if (sh.blinkDur <= 0) { sh.isBlinking = false; sh.blinkTimer = 1500 + Math.random() * 3500; } }
    else { sh.blinkTimer -= dt; if (sh.blinkTimer <= 0) { sh.isBlinking = true; sh.blinkDur = 80 + Math.random() * 50; } }
    if (sh.wideEyes > 0) sh.wideEyes -= dt;

    if (sh.state === 'hover' || sh.state === 'curious') {
      sh.kickCD -= dt;
      if (sh.kickCD <= 0 && sh.kickLeg === -1) { sh.kickLeg = Math.random() * 4 | 0; sh.kickTimer = 250; sh.kickCD = 1500 + Math.random() * 3000; }
    }
    if (sh.kickTimer > 0) { sh.kickTimer -= dt; if (sh.kickTimer <= 0) sh.kickLeg = -1; }
    if (sh.critterPause > 0) sh.critterPause -= dt;
    sh.collisionCD = Math.max(0, sh.collisionCD - dt);
  }

  /* ═══ Sheep-Kollisionen ═══ */
  function sheepCollisions() {
    for (var i = 0; i < flock.length; i++) {
      for (var j = i + 1; j < flock.length; j++) {
        var a = flock[i], b = flock[j];
        if (a.state === 'departing' || b.state === 'departing') continue;
        if (a.cuddlePartner === b && b.cuddlePartner === a) continue;
        if (a.piggybackRider === b || b.piggybackRider === a) continue;
        /* Schafe im selben Orbit: sanfte Abstoßung, kein State-Wechsel */
        var sameOrbit = (a.state === 'circle' || a.state === 'circleDance' || a.state === 'dance')
          && a.state === b.state && a.orbitCenter === b.orbitCenter;
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        var minD = COLLISION_R * (a.sizeMultiplier + b.sizeMultiplier);
        if (d < minD && d > 0) {
          var nx = dx / d, ny = dy / d, overlap = minD - d;
          /* Masse = visuelle Größe² (Fläche) */
          var sA = a.traits.scale * a.sizeMultiplier, sB = b.traits.scale * b.sizeMultiplier;
          var mA = sA * sA, mB = sB * sB;
          var mT = mA + mB;
          var rA = mB / mT, rB = mA / mT;  // leichteres Schaf bekommt mehr ab
          if (sameOrbit) {
            /* Orbit-Genossen: nur sanft auseinanderdrücken, kein Rammen */
            a.x -= nx * overlap * rA * 0.5; a.y -= ny * overlap * rA * 0.5;
            b.x += nx * overlap * rB * 0.5; b.y += ny * overlap * rB * 0.5;
            continue;
          }
          /* Überlappung auflösen: gewichtet nach Masse */
          a.x -= nx * overlap * rA; a.y -= ny * overlap * rA;
          b.x += nx * overlap * rB; b.y += ny * overlap * rB;
          var rv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rv > 0) { a.vx -= nx * rv * rA * .8; a.vy -= ny * rv * rA * .8; b.vx += nx * rv * rB * .8; b.vy += ny * rv * rB * .8; }
          /* Abstoßung (Anti-Kleben): massegewichtet */
          var push = 0.3 + overlap * 0.05;
          a.vx -= nx * push * rA; a.vy -= ny * push * rA;
          b.vx += nx * push * rB; b.vy += ny * push * rB;
          /* Parallel-Lock brechen */
          var spdA = Math.hypot(a.vx, a.vy), spdB = Math.hypot(b.vx, b.vy);
          if (spdA > 0.3 && spdB > 0.3) {
            var dotNorm = (a.vx * b.vx + a.vy * b.vy) / (spdA * spdB);
            if (dotNorm > 0.4) {
              var perpX = -ny, perpY = nx;
              a.vx += perpX * 1.2 * rA; a.vy += perpY * 1.2 * rA;
              b.vx -= perpX * 1.2 * rB; b.vy -= perpY * 1.2 * rB;
              a.target = newTarget(); b.target = newTarget();
              if (a.state !== 'scared' && a.state !== 'departing' && !isGroupState(a.state)) { a.state = 'dart'; a.stTimer = 0; a.stDur = 600 + Math.random() * 400; }
              if (b.state !== 'scared' && b.state !== 'departing' && !isGroupState(b.state)) { b.state = 'dart'; b.stTimer = 0; b.stDur = 600 + Math.random() * 400; }
            }
          }
          if (rv > 1.5 && a.collisionCD <= 0 && b.collisionCD <= 0) {
            spawnStars((a.x + b.x) / 2, (a.y + b.y) / 2, 2 + (Math.random() * 2 | 0));
            /* Leichteres Schaf wackelt mehr */
            a.wobbleV += (Math.random() - .5) * 8 * (rA * 2); b.wobbleV += (Math.random() - .5) * 8 * (rB * 2);
            a.propSpeed = Math.min(a.propSpeed + 10, PROP_MAX); b.propSpeed = Math.min(b.propSpeed + 10, PROP_MAX);
            a.collisionCD = 500; b.collisionCD = 500;
            /* Schlafendes Schaf grummelig aufwecken */
            if (a.state === 'nap' && a.napSleeping) { napGrumpy(a); }
            if (b.state === 'nap' && b.napSleeping) { napGrumpy(b); }
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
      /* Body-Decal: frontal (tailSide≈0) = breit, seitlich (tailSide≈±1) = schmal */
      var bsFront = 1 - Math.abs(sh.tailSide) * 0.5;
      var bsShiftX = -sh.tailSide * sh.tw * 0.3;
      d.bodySprite.style.transform = 'translate(' + (tx - sh.tw / 2) + 'px,' + (ty - sh.th / 2) + 'px) rotate(' + bankRad + 'rad) translate(' + (bsOX + bsShiftX) + 'px,' + bsOY + 'px) scaleX(' + (bsFront || 0.01) + ')' + (bsS !== '1' ? ' scale(' + bsS + ')' : '');
    }

    var labelRotY = sh.tailSide * 65;
    var labelShiftX = -sh.tailSide * sh.tw * 0.3;
    d.label.style.transform = 'translate(calc(-50% + ' + labelShiftX + 'px),-50%) rotateY(' + labelRotY + 'deg)';

    var ts = tr.tailSize;
    var tailWag = Math.sin(sh.bobPhase * .004) * 0.07;
    var tailLocalX = sh.tailSide * (sh.tw / 2 + ts * .3);
    var tailLocalY = 1;
    var tailPos = rot(tailLocalX, tailLocalY, bankRad);
    var tailX = tx + tailPos.x, tailY = ty + tailPos.y;
    if (tr.spriteTail >= 0) {
      /* Sprite-Schwanz: Ansatzpunkt gleitet kontinuierlich mit tailSide
         über den Rücken (kein Snap bei Seitenwechsel) */
      var stLocalX = sh.tailSide * (sh.tw / 2);
      var stPos = rot(stLocalX, 1, bankRad);
      var stX = tx + stPos.x, stY = ty + stPos.y;
      var spriteRot = tailWag * Math.PI;
      var flipX = sh.tailSide;   // ±1→voll sichtbar, 0→Kante (edge-on)
      d.tail.style.transformOrigin = '50% 50%';
      /* Scale aus data-Attribut (vom Kind hierher verschoben) */
      var sprScale = d.tail.dataset.spriteScale || '';
      d.tail.style.transform = 'translate(' + (stX - ts / 2) + 'px,' + (stY - ts / 2) + 'px) rotate(' + spriteRot + 'rad) scaleX(' + flipX + ')' + (sprScale ? ' ' + sprScale : '');
    } else {
      /* Standard-Kreisschwanz: Drehpunkt in der Mitte */
      var tailRot = (tailWag + sh.tailSide * .4) * Math.PI;
      d.tail.style.transformOrigin = '50% 50%';
      d.tail.style.transform = 'translate(' + (tailX - ts / 2) + 'px,' + (tailY - ts / 2) + 'px) rotate(' + tailRot + 'rad)';
    }

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
    else if (sh.state === 'dance' && sh.groupData) { var dps = sh.groupData.partner, dp = null, dpD = Infinity; for (var di = 0; di < dps.length; di++) { if (dps[di] !== sh) { var dd = Math.hypot(dps[di].x - sh.x, dps[di].y - sh.y); if (dd < dpD) { dpD = dd; dp = dps[di]; } } } if (dp) { etx = (dp.x - headVX) * .04; ety = (dp.y - headVY) * .04; } else { etx = 0; ety = 0; } }
    else if (sh.state === 'wakeUp' && sh.wakeUpTarget) { etx = (sh.wakeUpTarget.x - headVX) * .04; ety = (sh.wakeUpTarget.y - headVY) * .04; }
    else if (sh.state === 'race' && sh.groupData) { var rt = sh.groupData.critterTarget || sh.groupData.fixedTarget; if (rt) { var rtx = rt.x != null ? rt.x : rt.x; var rty = rt.y != null ? rt.y : rt.y; etx = (rtx - headVX) * .03; ety = (rty - headVY) * .03; } else { etx = sh.vx * 3; ety = sh.vy * 2; } }
    else if (sh.state === 'cuddle' && sh.cuddlePartner) { etx = (sh.cuddlePartner.x - headVX) * .04; ety = (sh.cuddlePartner.y - headVY) * .04; }
    else if (sh.state === 'argument' && sh.argumentPartner) { etx = (sh.argumentPartner.x - headVX) * .04; ety = (sh.argumentPartner.y - headVY) * .04; }
    else if (sh.state === 'keepaway' && sh.groupData) { var ka = sh.groupData; if (sh.keepawayRole === 'chaser') { var kbt = null, kbd = Infinity; for (var ki = 0; ki < ka.participants.length; ki++) { var kr = ka.participants[ki]; if (kr !== sh && kr.keepawayRole === 'runner') { var kd = Math.hypot(kr.x - sh.x, kr.y - sh.y); if (kd < kbd) { kbd = kd; kbt = kr; } } } if (kbt) { etx = (kbt.x - headVX) * .04; ety = (kbt.y - headVY) * .04; } else { etx = sh.vx * 3; ety = sh.vy * 2; } } else { var kch = ka.chaser; if (kch) { etx = (kch.x - headVX) * .03; ety = (kch.y - headVY) * .03; } else { etx = sh.vx * 3; ety = sh.vy * 2; } } }
    else if (sh.state === 'huckepack') { if (sh.piggybackMount) { etx = sh.vx * 3; ety = sh.vy * 2; } else if (sh.piggybackRider) { etx = (sh.piggybackRider.x - headVX) * .04; ety = (sh.piggybackRider.y - headVY) * .04; } else { etx = sh.vx * 3; ety = sh.vy * 2; } }
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
    /* Auf halbe Pixel runden — verhindert Subpixel-Blur bei kleinen Augen (2×2.5px) */
    var exR = (sh.eyeX * 2 + 0.5 | 0) / 2, eyR = (sh.eyeY * 2 + 0.5 | 0) / 2;
    var ee = sh.isBlinking ? ' scaleY(0.1)' : sh.wideEyes > 0 ? ' scale(1.5)' : '';
    d.eyeL.style.transform = 'translate(' + exR + 'px,' + eyR + 'px)' + ee;
    d.eyeR.style.transform = 'translate(' + exR + 'px,' + eyR + 'px)' + ee;

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
        var dbgScale = 1 / (tr.scale * sh.sizeMultiplier);
        d.debugEl.style.transform = 'translateX(-50%) scale(' + dbgScale + ')';
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

  /* ═══ Grumpy-Emoji (Nap-Grab) ═══ */
  var GRUMPY_EMOJIS = ['😤', '💢', '😾', '🫠'];
  function spawnGrumpy(x, y) {
    var em = GRUMPY_EMOJIS[Math.random() * GRUMPY_EMOJIS.length | 0];
    var el = document.createElement('div');
    el.textContent = em;
    el.style.cssText = 'position:absolute;pointer-events:none;z-index:31;font-size:14px;left:' + x + 'px;top:' + (y - 12) + 'px;opacity:1;transition:all 800ms ease-out;';
    overlay.appendChild(el);
    el.offsetHeight;
    el.style.top = (y - 40) + 'px';
    el.style.opacity = '0';
    setTimeout(function() { el.remove(); }, 850);
  }

  /* ═══ Nap-Grumpy: kurz Augen auf, schimpfen, weiterschlafen ═══ */
  function napGrumpy(sh) {
    sh.napSleeping = false;
    sh.wideEyes = 1200;
    sh.headTarget = 15 * (Math.random() > 0.5 ? 1 : -1);
    spawnGrumpy(sh.x, sh.y);
    setTimeout(function() {
      if (sh.state === 'nap' && flock.indexOf(sh) !== -1) {
        sh.napSleeping = true;
        sh.wideEyes = 0;
      }
    }, 1200);
  }

  /* ═══ Trail-Partikel (Keepaway) ═══ */
  var TRAIL_POOL_SIZE = 80;
  var trailPool = [];
  var trailIdx = 0;
  var trailActive = [];
  var TRAIL_COLORS = ['rgba(255,180,60,.9)', 'rgba(255,215,80,.85)', 'rgba(255,160,30,.8)', 'rgba(255,200,50,.75)'];
  (function initTrailPool() {
    for (var i = 0; i < TRAIL_POOL_SIZE; i++) {
      var el = document.createElement('div');
      el.style.cssText = 'position:absolute;pointer-events:none;z-index:30;border-radius:50%;display:none;width:4px;height:4px;';
      overlay.appendChild(el);
      trailPool.push({ el: el, x: 0, y: 0, vx: 0, vy: 0, life: 0, alpha: 0 });
    }
  })();

  function spawnTrailParticle(x, y, sheepVx, sheepVy) {
    var p = trailPool[trailIdx]; trailIdx = (trailIdx + 1) % TRAIL_POOL_SIZE;
    p.x = x + (Math.random() - 0.5) * 6;
    p.y = y + (Math.random() - 0.5) * 6;
    p.vx = -sheepVx * 0.3 + (Math.random() - 0.5) * 0.8;
    p.vy = -sheepVy * 0.3 + (Math.random() - 0.5) * 0.8;
    p.life = 600 + Math.random() * 400;
    p.alpha = 0.9;
    p.el.style.display = 'block';
    p.el.style.background = TRAIL_COLORS[Math.random() * TRAIL_COLORS.length | 0];
    if (trailActive.indexOf(p) === -1) trailActive.push(p);
  }

  function updateTrailParticles() {
    for (var i = trailActive.length - 1; i >= 0; i--) {
      var p = trailActive[i];
      p.life -= 16;
      if (p.life <= 0) {
        p.el.style.display = 'none'; p.alpha = 0;
        trailActive.splice(i, 1); continue;
      }
      p.alpha *= 0.95;
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.96; p.vy *= 0.96;
      p.el.style.left = p.x + 'px';
      p.el.style.top = p.y + 'px';
      p.el.style.opacity = p.alpha;
    }
  }

  function clearTrailParticles() {
    for (var i = 0; i < trailActive.length; i++) {
      trailActive[i].el.style.display = 'none';
      trailActive[i].alpha = 0;
    }
    trailActive.length = 0;
  }

  /* ═══ Upgrade-Explosion (Canvas-Partikel, inspiriert von particles-in-space) ═══ */
  function spawnUpgradeExplosion(x, y) {
    var cvs = document.createElement('canvas');
    var sz = 400;
    cvs.width = sz; cvs.height = sz;
    cvs.style.cssText = 'position:fixed;left:' + (x - sz / 2) + 'px;top:' + (y - sz / 2) + 'px;width:' + sz + 'px;height:' + sz + 'px;pointer-events:none;z-index:99999;';
    overlay.appendChild(cvs);
    var ctx = cvs.getContext('2d');
    var cx = sz / 2, cy = sz / 2;
    var palette = [
      { r: 252, g: 178, b: 96 },   // solarFlare
      { r: 253, g: 238, b: 152 },   // totesASun
      { r: 255, g: 215, b: 64 },    // gold
      { r: 218, g: 119, b: 242 },   // purple
      { r: 255, g: 107, b: 107 },   // coral
      { r: 255, g: 255, b: 255 },   // white
    ];
    var NUM = 300;
    var parts = [];
    for (var i = 0; i < NUM; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.pow(Math.random(), 0.5) * 8 + 1;
      var c = palette[Math.random() * palette.length | 0];
      var cv = 30;
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 1 + Math.random() * 4,
        cr: Math.min(255, Math.max(0, c.r + (Math.random() * cv - cv / 2) | 0)),
        cg: Math.min(255, Math.max(0, c.g + (Math.random() * cv - cv / 2) | 0)),
        cb: Math.min(255, Math.max(0, c.b + (Math.random() * cv - cv / 2) | 0)),
        alpha: 0.7 + Math.random() * 0.3,
        decay: 0.015 + Math.random() * 0.015
      });
    }
    var start = performance.now();
    var maxDur = 2200;
    function tick() {
      var elapsed = performance.now() - start;
      if (elapsed > maxDur) { cvs.remove(); return; }
      ctx.clearRect(0, 0, sz, sz);
      var alive = false;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.alpha <= 0.01) continue;
        alive = true;
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.97; p.vy *= 0.97;
        p.alpha -= p.decay;
        if (p.alpha <= 0) { p.alpha = 0; continue; }
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + p.cr + ',' + p.cg + ',' + p.cb + ',' + p.alpha.toFixed(2) + ')';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (alive) requestAnimationFrame(tick);
      else cvs.remove();
    }
    requestAnimationFrame(tick);
  }

  /* ═══ Drag ═══ */
  var dragSheep = null, dragCritter = null, dragOX = 0, dragOY = 0, dragLX = 0, dragLY = 0, dragLT = 0, dragWasNapping = false;
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

  function findNearestCritter(x, y) {
    var best = null, bestD = 20;
    for (var ci = 0; ci < critters.length; ci++) {
      var cr = critters[ci];
      if (cr.launched) continue;
      var d = Math.hypot(cr.x - x, cr.y - y);
      if (d < bestD) { bestD = d; best = cr; }
    }
    return best;
  }

  /* Penned sheep: click auf wrap im Gatter erkennen */
  function findPennedSheep(e) {
    for (var i = 0; i < penned.length; i++) {
      var sh = penned[i];
      if (sh.dom && sh.dom.wrap && sh.dom.wrap.contains(e.target)) return sh;
    }
    return null;
  }

  /* Capture-phase: intercept clicks near sheep/critters before page elements get them */
  document.addEventListener('pointerdown', function (e) {
    /* Penned sheep zuerst prüfen */
    var pSh = findPennedSheep(e);
    if (pSh) {
      e.preventDefault(); e.stopPropagation();
      unpenSheep(pSh, e.clientX, e.clientY);
      dragSheep = pSh;
      dragOX = 0; dragOY = 0;
      dragLX = e.clientX; dragLY = e.clientY; dragLT = performance.now();
      velBuf.length = 0; dragShakeScore = 0; dragPrevVX = 0; dragPrevVY = 0;
      dragWasNapping = false;
      updatePenVisibility();
      return;
    }
    /* Critter zuerst prüfen (kleiner, sonst nie greifbar) */
    var cr = findNearestCritter(e.clientX, e.clientY);
    if (cr) {
      e.preventDefault(); e.stopPropagation();
      dragCritter = cr;
      dragOX = cr.x - e.clientX; dragOY = cr.y - e.clientY;
      dragLX = e.clientX; dragLY = e.clientY; dragLT = performance.now();
      velBuf.length = 0;
      return;
    }
    if (flock.length === 0) return;
    var sh = findNearest(e.clientX, e.clientY);
    if (!sh) return;
    e.preventDefault(); e.stopPropagation();
    dragSheep = sh;
    dragWasNapping = (sh.state === 'nap' && sh.napSleeping);
    if (dragWasNapping) {
      /* Grummelig aufwachen: Augen auf + Schimpf-Emoji */
      sh.napSleeping = false;
      sh.wideEyes = 2000;
      spawnGrumpy(sh.x, sh.y);
    }
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
    updatePenVisibility();
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (dragCritter) {
      e.preventDefault();
      var now = performance.now(), dtt = now - dragLT;
      if (dtt > 1) {
        velBuf.push({ vx: (e.clientX - dragLX) / dtt * 16, vy: (e.clientY - dragLY) / dtt * 16, t: now });
        while (velBuf.length && now - velBuf[0].t > 80) velBuf.shift();
      }
      dragCritter.x = e.clientX + dragOX; dragCritter.y = e.clientY + dragOY;
      dragLX = e.clientX; dragLY = e.clientY; dragLT = now;
      return;
    }
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
    /* Pen-Hover Highlight */
    if (penEl) {
      var penR = penEl.getBoundingClientRect();
      var overPen = e.clientX >= penR.left && e.clientX <= penR.right && e.clientY >= penR.top && e.clientY <= penR.bottom;
      penEl.classList.toggle('pen-hover', overPen);
    }
  });

  document.addEventListener('pointerup', function () {
    if (dragCritter) {
      var ax = 0, ay = 0;
      if (velBuf.length) { for (var vi = 0; vi < velBuf.length; vi++) { ax += velBuf[vi].vx; ay += velBuf[vi].vy; } ax /= velBuf.length; ay /= velBuf.length; }
      dragCritter.vx = ax * .6; dragCritter.vy = ay * .6;
      dragCritter.wobbleV += (Math.random() - .5) * 15;
      velBuf.length = 0; dragCritter = null;
      return;
    }
    if (!dragSheep) return;
    /* Ins Gatter fallen gelassen? */
    if (penEl) {
      penEl.classList.remove('pen-hover');
      var penR = penEl.getBoundingClientRect();
      var sx = dragSheep.x, sy = dragSheep.y;
      if (sx >= penR.left && sx <= penR.right && sy >= penR.top && sy <= penR.bottom) {
        penSheep(dragSheep);
        velBuf.length = 0; dragShakeScore = 0; dragWasNapping = false; dragSheep = null;
        updatePenVisibility();
        saveFlock(true);
        return;
      }
    }
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
      dragWasNapping = false;
    } else if (dragWasNapping) {
      /* War am Schlafen → grummelig weiterschlafen */
      dragSheep.throwBoost = 800; dragSheep.resumeDelay = 600;
      dragSheep.napSleeping = true;
      dragSheep.wideEyes = 0;
    } else {
      dragSheep.throwBoost = 2500; dragSheep.resumeDelay = 1200;
    }
    velBuf.length = 0; dragShakeScore = 0; dragWasNapping = false; dragSheep = null;
    updatePenVisibility();
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
    var crs = [];
    for (var ci = 0; ci < critters.length; ci++) {
      var cr = critters[ci];
      if (cr.launched) continue;  // fliegende Critter nicht speichern
      crs.push({
        x: cr.x, y: cr.y, vx: cr.vx, vy: cr.vy,
        scale: cr.scale, kicksLeft: cr.kicksLeft,
        traits: cr.traits
      });
    }
    var pen = [];
    for (var pi = 0; pi < penned.length; pi++) {
      var psh = penned[pi];
      pen.push({
        traits: psh.traits,
        ownerId: psh.ownerId, ownerName: psh.ownerName, letter: psh.letter,
        sizeMultiplier: psh.sizeMultiplier, age: psh.age, scoreCounts: psh.scoreCounts || { alle9: 0, kranz: 0 },
        tailSide: psh.tailSide, solo: psh.solo,
      });
    }
    return { version: 1, timestamp: Date.now(), sheep: sheep, critters: crs, penned: pen };
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
    /* Critter wiederherstellen */
    if (Array.isArray(data.critters)) {
      for (var ci = 0; ci < data.critters.length; ci++) {
        var sc = data.critters[ci];
        var ct = sc.traits || generateCritterTraits();
        var cdom = createCritterDOM(ct);
        cdom.traits = ct;
        var cx = Math.max(10, Math.min(W - 10, sc.x || W / 2));
        var cy = Math.max(10, Math.min(H - 10, sc.y || H / 2));
        var cr = {
          dom: cdom, x: cx, y: cy,
          vx: sc.vx || 0, vy: sc.vy || 0,
          wobble: 0, wobbleV: 0,
          scale: sc.scale || 1,
          kickCD: {},
          kicksLeft: sc.kicksLeft || CRITTER_MIN_KICKS,
          launched: false,
          dizzyTime: 0, dizzySpeed: 0, dizzyAngle: 0,
          traits: ct
        };
        overlay.appendChild(cdom.wrap);
        critters.push(cr);
      }
    }
    /* Penned sheep wiederherstellen */
    if (Array.isArray(data.penned)) {
      for (var pi = 0; pi < data.penned.length; pi++) {
        var ps = data.penned[pi];
        var psh = createSheep(W / 2, H / 2, ps.ownerId, ps.letter, {
          ownerName: ps.ownerName || '',
          traits: ps.traits,
          sizeMultiplier: ps.sizeMultiplier || 1,
          age: ps.age || 0,
          scoreCounts: ps.scoreCounts || { alle9: 0, kranz: 0 },
          tailSide: ps.tailSide || 0,
          solo: ps.solo,
          _skipMount: true,
        });
        penSheep(psh);
      }
    }
    updatePenVisibility();
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
      flockForces(sh); physics(sh, dt);
      /* Piggyback-Fixup VOR Render: Reiter-Position, Bob + Propeller synchronisieren */
      if (sh.piggybackMount && sh.groupData && sh.groupData.phase === 1) {
        var mnt = sh.piggybackMount;
        if (flock.indexOf(mnt) !== -1) {
          sh.x = mnt.x;
          sh.y = mnt.y - mnt.sizeMultiplier * mnt.traits.scale * 14;
          sh.vx = mnt.vx; sh.vy = mnt.vy;
          sh.bobPhase = mnt.bobPhase;
          sh.propSpeed = 0;
        }
      }
      render(sh);
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
    /* Nap-Detection: schlafendes Schaf → Waker spawnen */
    for (var ni = 0; ni < flock.length; ni++) {
      var nsh = flock[ni];
      if (nsh.state === 'nap' && nsh.napSleeping && nsh.stTimer > 4000 && Math.random() < 0.001) {
        var waker = null;
        for (var wi = 0; wi < flock.length; wi++) {
          var wsh = flock[wi];
          if (wsh === nsh || wsh === dragSheep) continue;
          if (wsh.state === 'departing' || wsh.state === 'scared' || isGroupState(wsh.state)) continue;
          if (wsh.resumeDelay > 0 || wsh.throwBoost > 0) continue;
          waker = wsh; break;
        }
        if (waker) {
          waker.state = 'wakeUp'; waker.stTimer = 0; waker.stDur = 12000;
          waker.wakeUpTarget = nsh;
          waker.groupData = { type: 'wakeUp' };
        }
      }
    }
    /* Keepaway Trail-Partikel spawnen */
    for (var ki = 0; ki < flock.length; ki++) {
      var ksh = flock[ki];
      if (ksh.state === 'keepaway' && ksh.keepawayRole === 'chaser' && Math.random() < 0.3) {
        spawnTrailParticle(ksh.x, ksh.y, ksh.vx, ksh.vy);
      }
    }
    /* Gruppenaktionen */
    groupCooldown -= dt;
    if (groupCooldown <= 0) {
      tryGroupAction();
      groupCooldown = 15000 + Math.random() * 30000;
    }
    sheepCollisions();
    updateTrailParticles();
    /* ── Critter-Loop: Physik, Kicks, Render, Cleanup ── */
    for (var ci = critters.length - 1; ci >= 0; ci--) {
      var cr = critters[ci];
      /* Off-screen → entfernen (launched ODER nach oben rausgeschleudert) */
      if (cr.x < -80 || cr.x > W + 80 || cr.y < -80 || cr.y > H + 80) {
        cr.dom.wrap.remove(); critters.splice(ci, 1); continue;
      }
      if (cr.launched) {
        critterPhysics(cr, dt); critterRender(cr); continue;
      }
      if (cr === dragCritter) { critterRender(cr); continue; }
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
            /* Kicker-Schaf: extra Kick-Anim + Pause */
            sh.kickLeg = Math.random() * 4 | 0; sh.kickTimer = 400;
            sh.critterPause = 1200;
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
            /* Normaler Kick — Critter wegschleudern */
            var kickForce = 5 + Math.hypot(sh.vx, sh.vy) * 1.5;
            cr.vx = nx * kickForce; cr.vy = ny * kickForce;
            cr.wobbleV += (Math.random() - .5) * 25;
            sh.kickLeg = Math.random() * 4 | 0; sh.kickTimer = 250;
            /* 50 % Chance: dem Ball hinterherjagen, sonst Pause */
            if (Math.random() < 0.5) {
              sh.chasingCritter = cr;
              sh.critterPause = 250;   // nur Kick-Anim abwarten
            } else {
              sh.critterPause = 800 + Math.random() * 400;
            }
            spawnStars(cr.x, cr.y, 2);
          }
          cr.kickCD[si] = CRITTER_KICK_CD;
          /* Schlafendes Schaf grummelig aufwecken */
          if (sh.state === 'nap' && sh.napSleeping) { napGrumpy(sh); }
          break; // max 1 Kick pro Frame
        }
      }
      /* Vorbeifliegender Ball: 20 % Chance, dass Schafe hinterherjagen */
      var crSpd = Math.hypot(cr.vx, cr.vy);
      if (crSpd > 2) {
        for (var bi = 0; bi < flock.length; bi++) {
          var bsh = flock[bi];
          if (bsh.chasingCritter) continue;                 // jagt schon
          if (bsh.critterPause > 0) continue;               // Kick-Pause
          if (bsh.state !== 'explore' && bsh.state !== 'dart' && bsh.state !== 'zigzag') continue;
          var bd = Math.hypot(cr.x - bsh.x, cr.y - bsh.y);
          if (bd < 120 * bsh.sizeMultiplier && Math.random() < 0.005) {  // ~20 % über Durchflug
            bsh.chasingCritter = cr;
          }
        }
      }
      critterPhysics(cr, dt);
      critterRender(cr);
    }
    /* Critter-Fusion: zwei Critter treffen sich → verschmelzen zum größeren */
    for (var fi = 0; fi < critters.length; fi++) {
      var ca = critters[fi];
      if (ca.launched || ca === dragCritter) continue;
      for (var fj = fi + 1; fj < critters.length; fj++) {
        var cb = critters[fj];
        if (cb.launched || cb === dragCritter) continue;
        var fd = Math.hypot(ca.x - cb.x, ca.y - cb.y);
        var touchD = (ca.scale + cb.scale) * 8;
        if (fd < touchD && fd > 0) {
          /* Fusion! Größerer schluckt kleineren */
          var big = ca.scale >= cb.scale ? ca : cb;
          var small = ca.scale >= cb.scale ? cb : ca;
          /* Masse-gewichtete Position + Velocity */
          var mBig = big.scale * big.scale, mSmall = small.scale * small.scale;
          var mT = mBig + mSmall;
          big.x = (big.x * mBig + small.x * mSmall) / mT;
          big.y = (big.y * mBig + small.y * mSmall) / mT;
          big.vx = (big.vx * mBig + small.vx * mSmall) / mT;
          big.vy = (big.vy * mBig + small.vy * mSmall) / mT;
          /* Wachsen: Fläche addieren → neuer Scale (via CSS transform) */
          big.scale = Math.sqrt(big.scale * big.scale + small.scale * small.scale);
          big.kicksLeft = big.kicksLeft + small.kicksLeft;
          big.wobbleV += (Math.random() - .5) * 20;
          /* Effekte */
          spawnPuff((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, 20);
          spawnStars((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, 4);
          /* Kleinen entfernen */
          small.dom.wrap.remove();
          critters.splice(critters.indexOf(small), 1);
          /* Schafe die den Kleinen jagten → auf den Großen umlenken */
          for (var si = 0; si < flock.length; si++) {
            if (flock[si].chasingCritter === small) flock[si].chasingCritter = big;
          }
          break;  // max 1 Fusion pro Frame
        }
      }
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

  var CRITTER_COLORS = ['#2a2a2a', '#3a3a3a', '#4a3a2e', '#2e3a4a', '#3a2a3a', '#3e3e2e', '#1e2e3e'];
  var CRITTER_EAR_COLORS = ['#2a2a2a', '#3a2020', '#20302a', '#2a2040', '#403020'];

  function createCritterDOM(traits) {
    var wrap = document.createElement('div'); wrap.className = 'critter-wrap';
    var body = document.createElement('div'); body.className = 'critter-body';
    body.style.background = traits.bodyColor;
    body.style.width = traits.bodyW + 'px'; body.style.height = traits.bodyH + 'px';
    var earL = document.createElement('div'); earL.className = 'critter-ear l';
    var earR = document.createElement('div'); earR.className = 'critter-ear r';
    earL.style.background = earR.style.background = traits.earColor;
    /* Ein großes Zyklopenauge (zentriert) */
    var eye = document.createElement('div'); eye.className = 'critter-eye critter-eye-c';
    var es = traits.eyeSize * 1.4;
    eye.style.width = eye.style.height = es + 'px';
    var pupil = document.createElement('div'); pupil.className = 'critter-pupil';
    pupil.style.width = pupil.style.height = (es * 0.5) + 'px';
    pupil.style.top = pupil.style.left = (es * 0.25) + 'px';
    eye.appendChild(pupil);
    /* Drei Beinchen */
    var feet = document.createElement('div'); feet.className = 'critter-feet critter-feet-tri';
    var footL = document.createElement('div'); footL.className = 'critter-foot';
    var footM = document.createElement('div'); footM.className = 'critter-foot';
    var footR = document.createElement('div'); footR.className = 'critter-foot';
    feet.appendChild(footL); feet.appendChild(footM); feet.appendChild(footR);
    body.appendChild(earL); body.appendChild(earR);
    body.appendChild(eye);
    body.appendChild(feet);
    wrap.appendChild(body);
    return { wrap: wrap, body: body, pupil: pupil };
  }

  function mixHex(c1, c2, t) {
    var r1 = parseInt(c1.slice(1,3),16), g1 = parseInt(c1.slice(3,5),16), b1 = parseInt(c1.slice(5,7),16);
    var r2 = parseInt(c2.slice(1,3),16), g2 = parseInt(c2.slice(3,5),16), b2 = parseInt(c2.slice(5,7),16);
    var r = Math.round(r1+(r2-r1)*t), g = Math.round(g1+(g2-g1)*t), b = Math.round(b1+(b2-b1)*t);
    return '#'+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
  }
  function generateCritterTraits() {
    var bw = 12 + Math.random() * 5, bh = 11 + Math.random() * 5;
    var area = bw * bh;
    var c1 = CRITTER_COLORS[Math.random() * CRITTER_COLORS.length | 0];
    var bodyColor = area > 200
      ? mixHex(c1, CRITTER_COLORS[Math.random() * CRITTER_COLORS.length | 0], 0.3 + Math.random() * 0.4)
      : c1;
    return {
      bodyColor: bodyColor,
      earColor: CRITTER_EAR_COLORS[Math.random() * CRITTER_EAR_COLORS.length | 0],
      bodyW: bw,
      bodyH: bh,
      eyeSize: 5 + Math.random() * 2.5
    };
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
    var traits = generateCritterTraits();
    var dom = createCritterDOM(traits);
    dom.traits = traits;  // für Serialisierung
    var cr = {
      dom: dom, x: x, y: y,
      vx: Math.cos(angle) * CRITTER_SPEED,
      vy: Math.sin(angle) * CRITTER_SPEED,
      wobble: 0, wobbleV: 0,
      scale: 0.9 + Math.random() * 0.2,
      kickCD: {},
      kicksLeft: CRITTER_MIN_KICKS + (Math.random() * (CRITTER_MAX_KICKS - CRITTER_MIN_KICKS) | 0),
      launched: false,
      dizzyTime: 0, dizzySpeed: 0, dizzyAngle: 0,
      traits: traits
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
    /* Wand-Bouncing — bei hartem Aufprall: Pupille dreht sich */
    var preSpd = Math.hypot(cr.vx, cr.vy);
    if (cr.x < 10) { cr.x = 10; cr.vx = Math.abs(cr.vx) * CRITTER_BOUNCE; }
    if (cr.x > W - 10) { cr.x = W - 10; cr.vx = -Math.abs(cr.vx) * CRITTER_BOUNCE; }
    /* Decke offen — Schwerkraft zieht zurück (wie Schafe) */
    if (cr.y < 10) { cr.vy += 0.006 * dt; }
    if (cr.y > H - 10) { cr.y = H - 10; cr.vy = -Math.abs(cr.vy) * CRITTER_BOUNCE; }
    var postSpd = Math.hypot(cr.vx, cr.vy);
    if (preSpd - postSpd > 1.5) {
      cr.dizzyTime = 1500 + preSpd * 400;
      cr.dizzySpeed = 0.015 + preSpd * 0.004;
      cr.dizzyAngle = cr.dizzyAngle || 0;
    }
    /* Dizzy-Decay */
    if (cr.dizzyTime > 0) {
      cr.dizzyAngle += cr.dizzySpeed * dt * DT_SCALE;
      cr.dizzyTime -= dt;
      /* Speed fällt exponentiell ab → Pupille pendelt ein */
      cr.dizzySpeed *= Math.pow(0.997, dt * DT_SCALE);
    }
    /* Wobble-Spring */
    cr.wobbleV -= cr.wobble * 0.2; cr.wobbleV *= 0.9; cr.wobble += cr.wobbleV * dt * DT_SCALE;
    /* Kick-Cooldowns runterzählen */
    for (var k in cr.kickCD) {
      if (cr.kickCD[k] > 0) { cr.kickCD[k] -= dt; if (cr.kickCD[k] <= 0) delete cr.kickCD[k]; }
    }
  }

  function critterRender(cr) {
    cr.dom.wrap.style.transform = 'translate(' + cr.x + 'px,' + cr.y + 'px) scale(' + cr.scale + ') rotate(' + (cr.wobble * 3) + 'deg)';
    var px, py;
    if (cr.dizzyTime > 0) {
      /* Dizzy: Pupille kreist — Radius schrumpft mit dizzySpeed */
      var radius = Math.min(1.5, cr.dizzySpeed * 100);
      px = Math.cos(cr.dizzyAngle) * radius;
      py = Math.sin(cr.dizzyAngle) * radius;
    } else {
      /* Normal: Pupillen-Tracking zum nächsten Schaf */
      var lookX = cursorX, lookY = cursorY, bestD = 200;
      for (var fi = 0; fi < flock.length; fi++) {
        var sh = flock[fi];
        var d = Math.hypot(sh.x - cr.x, sh.y - cr.y);
        if (d < bestD) { bestD = d; lookX = sh.x; lookY = sh.y; }
      }
      var dx = lookX - cr.x, dy = lookY - cr.y;
      var dd = Math.hypot(dx, dy) || 1;
      px = (dx / dd) * 1.5; py = (dy / dd) * 1.5;
    }
    cr.dom.pupil.style.transform = 'translate(' + px + 'px,' + py + 'px)';
  }

  /* ═══ Public API ═══ */
  window.flyingSheep = {
    spawn: function (x, y, ownerId, letter, ownerName, opts) {
      opts = opts || {};
      /* Ungültige Koordinaten → zufällige sichere Position */
      if (x == null || x < MARGIN || x > W - MARGIN) x = MARGIN + Math.random() * (W - MARGIN * 2);
      if (y == null || y < MARGIN || y > H - MARGIN) y = MARGIN + Math.random() * (H - MARGIN * 2);
      /* Existiert schon ein Schaf mit dieser ownerId (auch im Gatter)? → wachsen */
      if (ownerId) {
        for (var pi = 0; pi < penned.length; pi++) {
          if (penned[pi].ownerId === String(ownerId)) {
            var psh = penned[pi];
            psh.sizeMultiplier = Math.min(2.5, psh.sizeMultiplier + 0.25);
            if (!psh.scoreCounts) psh.scoreCounts = { alle9: 0, kranz: 0 };
            if (opts.scoreType === 'kranz') psh.scoreCounts.kranz++;
            else psh.scoreCounts.alle9++;
            if (ownerName && !psh.ownerName) psh.ownerName = ownerName;
            saveFlock(true);
            return psh;
          }
        }
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
              o.stDur = 7000 + Math.random() * 5000;
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
        o.stDur = 7000 + Math.random() * 5000;
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
    count: function () { return flock.length + penned.length; },
    save: saveFlock,
    dismiss: function (tx, ty) {
      dismissed = true;
      /* Penned sheep entfernen */
      for (var pi = penned.length - 1; pi >= 0; pi--) {
        var psh = penned[pi];
        logSheepDeath(psh, 'dismissed');
        if (psh.dom && psh.dom.wrap) psh.dom.wrap.remove();
      }
      penned.length = 0;
      updatePenVisibility();
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
        /* Scale vom Kind → Parent verschieben (einheitlicher transform-origin) */
        targetSheep.dom.tail.dataset.spriteScale = tlEl.style.transform || '';
        tlEl.style.transform = '';
        targetSheep.dom.tail.style.background = 'none';
        targetSheep.dom.tail.style.border = 'none';
        targetSheep.dom.tail.style.borderRadius = '0';
      }

      spawnUpgradeExplosion(targetSheep.x, targetSheep.y);
      spawnStars(targetSheep.x, targetSheep.y, 8);

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

    /* ═══ Preview-API: echtes Schaf im Vorschau-Container ═══ */
    preview: function (container, inputTraits, opts) {
      opts = opts || {};
      var previewScale = opts.previewScale || 5;

      /* Traits mit Defaults auffüllen (Umkleide liefert nicht alles) */
      var traits = {};
      for (var k in inputTraits) traits[k] = inputTraits[k];
      if (!traits.legs) traits.legs = [
        { lx: -3, ly: 5.5 }, { lx: 3, ly: 5.5 },
        { lx: -2, ly: 6 },   { lx: 2, ly: 6 }
      ];
      if (!traits.legPhases) traits.legPhases = [0, Math.PI, 0.5, Math.PI + 0.5];
      if (!traits.legRestAngles) traits.legRestAngles = [0, 0, 0, 0];
      if (traits.hasKnees == null) traits.hasKnees = false;
      if (traits.propBladeCount == null) traits.propBladeCount = 2;
      if (traits.propBladeColor == null) traits.propBladeColor = '#ffd740';
      if (traits.propHubColor == null) traits.propHubColor = '#666';
      if (traits.propSize == null) traits.propSize = 1.0;
      if (traits.propShape == null) traits.propShape = 'standard';

      /* DOM erzeugen (skipMount=true → nicht ins Overlay hängen) */
      var dom = createSheepDOM(traits, '', true);
      container.innerHTML = '';

      /* Zentrierungs-Wrapper */
      var center = document.createElement('div');
      center.style.cssText = 'position:absolute;top:55%;left:50%;width:0;height:0;';
      container.appendChild(center);
      center.appendChild(dom.wrap);

      /* Propeller optional verstecken */
      if (opts.hidePropeller) {
        dom.pole.style.display = 'none';
        dom.hub.style.display = 'none';
        dom.bwrap.style.display = 'none';
      }

      /* Synthetisches Schaf-Objekt (ruhiger Hover-State) */
      var tailSideTarget = 1;          // +1 = rechts, -1 = links
      var sh = {
        dom: dom, traits: traits,
        tw: TORSO_W * traits.chub, th: TORSO_H,
        hw: HEAD_W * traits.headMul, hh: HEAD_H * traits.headMul,
        hr: HEAD_R * traits.headMul,
        x: 0, y: 0, vx: 0, vy: 0,
        bank: 0, headAngle: 0, headTarget: 0,
        propSpeed: PROP_BASE + 3,
        propAngle: Math.random() * 360,
        bobPhase: Math.random() * 9999,
        legPhase: Math.random() * 9999,
        eyeX: 0, eyeY: 0, wobble: 0, wobbleV: 0,
        state: 'hover', stTimer: 0, stDur: 999999,
        tailSide: 1,
        legDragX: 0, legDragY: 0,
        isBlinking: false, blinkTimer: 2000 + Math.random() * 3000,
        blinkDur: 0, wideEyes: 0,
        sizeMultiplier: previewScale,
        kickLeg: -1, kickTimer: 0,
        showNameTimer: 0, ownerName: '',
        scoreCounts: { alle9: 0, kranz: 0 },
      };

      /* Klick dreht das Schaf */
      function onClick() { tailSideTarget *= -1; }
      container.style.cursor = 'pointer';
      container.addEventListener('click', onClick);

      var animId = null, lastTp = 0;
      function tick(t) {
        if (!lastTp) { lastTp = t; animId = requestAnimationFrame(tick); return; }
        var dt = Math.min(t - lastTp, 50);
        lastTp = t;

        /* Sanftes Kopfpendeln (gedämpft: ±12° statt ±35°) */
        sh.headTarget = Math.sin(sh.stTimer * .003) * 12;
        sh.stTimer += dt;

        /* tailSide sanft zum Ziel interpolieren */
        sh.tailSide += (tailSideTarget - sh.tailSide) * 0.04;

        sh.headAngle += (sh.headTarget - sh.headAngle) * 0.06;

        sh.propSpeed = Math.max(PROP_BASE, sh.propSpeed * .995);
        sh.propAngle += sh.propSpeed * dt * .07;
        sh.bobPhase += dt * 0.4;   // Bob verlangsamt
        sh.legPhase += dt * 0.4;

        /* Blinzeln */
        if (sh.isBlinking) {
          sh.blinkDur -= dt;
          if (sh.blinkDur <= 0) { sh.isBlinking = false; sh.blinkTimer = 1500 + Math.random() * 3500; }
        } else {
          sh.blinkTimer -= dt;
          if (sh.blinkTimer <= 0) { sh.isBlinking = true; sh.blinkDur = 100 + Math.random() * 60; }
        }

        render(sh);
        animId = requestAnimationFrame(tick);
      }
      animId = requestAnimationFrame(tick);

      return {
        sheep: sh,
        destroy: function () {
          if (animId) { cancelAnimationFrame(animId); animId = null; }
          container.removeEventListener('click', onClick);
          container.style.cursor = '';
          if (center.parentNode) center.remove();
        }
      };
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
