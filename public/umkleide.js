(function () {
  'use strict';

  function darkenColor(hex) {
    var r, g, b;
    if (hex.length === 4) { r = parseInt(hex[1]+hex[1],16); g = parseInt(hex[2]+hex[2],16); b = parseInt(hex[3]+hex[3],16); }
    else { r = parseInt(hex.substr(1,2),16); g = parseInt(hex.substr(3,2),16); b = parseInt(hex.substr(5,2),16); }
    r = Math.round(r * 0.65); g = Math.round(g * 0.65); b = Math.round(b * 0.65);
    return '#' + ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
  }

  /* ═══ Defaults (Spiegel der Hardcodes aus flyingsheep.js/css) ═══ */
  var DEFAULTS = {
    spriteHat:     { offsetY: -8, offsetX: 0, scale: 1.0, slotW: 9.85, slotH: 8.85, items: {} },
    spriteGlasses: { offsetY: 1.5, offsetX: 0, scale: 0.65, slotW: 16.975, slotH: 8.3375, cols: 4, items: {} },
    spriteStache:  { offsetY: -1, offsetX: 0, scale: 0.25, slotW: 40, slotH: 30, cols: 3, items: {} },
    spriteBody:    { offsetY: 0, offsetX: 0, scale: 1, items: {} },
    spriteTail:    { offsetY: 0, offsetX: 0, scale: 1, items: {} },
    cssAccessories: {
      tophat:{offsetY:0,offsetX:0,scale:1},partyhat:{offsetY:0,offsetX:0,scale:1},
      crown:{offsetY:0,offsetX:0,scale:1},beanie:{offsetY:0,offsetX:0,scale:1},
      glasses:{offsetY:0,offsetX:0,scale:1},bowtie:{offsetY:0,offsetX:0,scale:1},
      bell:{offsetY:0,offsetX:0,scale:1},flower:{offsetY:0,offsetX:0,scale:1},
      scarf:{offsetY:0,offsetX:0,scale:1}
    },
    face: {
      eyeY: 3.5,       // CSS default: top 3.5px
      eyeLeftX: 2,      // CSS default: left 2px
      eyeRightX: 2,     // CSS default: right 2px
      earY: -1.5,       // CSS default: top -1.5px
      earLeftX: -2.5,    // CSS default: left -2.5px
      earRightX: -2.5,   // CSS default: right -2.5px
      mouthY: 2         // CSS default: bottom 2px
    }
  };

  var DEFAULT_SLOT_COUNTS = { spriteHat: 16, spriteGlasses: 32, spriteStache: 12, spriteBody: 0, spriteTail: 0 };

  var CSS_ACC_NAMES = {
    tophat:'Zylinder',partyhat:'Partyhut',crown:'Krone',beanie:'M\u00fctze',
    glasses:'Brille',bowtie:'Fliege',bell:'Glocke',flower:'Blume',scarf:'Schal'
  };
  var CSS_ACC_KEYS = Object.keys(CSS_ACC_NAMES);

  /* ═══ Body-Konstanten (aus flyingsheep.js) ═══ */
  var HEAD_W = 12, HEAD_H = 12, TORSO_W = 17, TORSO_H = 14, LEG_W = 2, LEG_H = 8;
  var POLE_H = 3, HUB_SZ = 4;

  /* ═══ State ═══ */
  var cfg = JSON.parse(JSON.stringify(DEFAULTS));
  var saved = window.__umkleideConfig || {};
  // Merge saved config
  function mergeSpriteCategory(key) {
    var s = saved[key];
    if (!s) return;
    if (s.offsetY != null) cfg[key].offsetY = s.offsetY;
    if (s.offsetX != null) cfg[key].offsetX = s.offsetX;
    if (s.scale != null) cfg[key].scale = s.scale;
    if (s.items) cfg[key].items = s.items;
    if (s.customSheet) cfg[key].customSheet = s.customSheet;
    if (s.customSlots) cfg[key].customSlots = s.customSlots;
  }
  mergeSpriteCategory('spriteHat');
  mergeSpriteCategory('spriteGlasses');
  mergeSpriteCategory('spriteStache');
  mergeSpriteCategory('spriteBody');
  mergeSpriteCategory('spriteTail');
  if (saved.cssAccessories) {
    for (var k in saved.cssAccessories) {
      if (cfg.cssAccessories[k]) Object.assign(cfg.cssAccessories[k], saved.cssAccessories[k]);
    }
  }
  if (saved.face) Object.assign(cfg.face, saved.face);

  var currentHat = 0;
  var currentGlasses = -1;
  var currentStache = -1;
  var currentBody = -1;
  var currentTail = -1;
  var currentCssAcc = null;
  var selectedCssKey = 'tophat';

  /* Body-Traits (nur Vorschau) */
  var body = { scale: 1.0, chub: 1.0, headMul: 1.0, legMul: 1.2, tailSize: 4, isBlack: false, woolColor: 'white', borderColor: '#444', skinColor: '#444', accColor: '#e44', showPropeller: true, propBladeCount: 2, propBladeColor: '#ffd740', propHubColor: '#666666', propSize: 1.0, propShape: 'standard' };

  /* ═══ DOM refs ═══ */
  var preview = document.getElementById('umkleidePreview');
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.content : '';

  /* ═══ Slider-Binding Helper ═══ */
  function bindSlider(id, valId, setter) {
    var el = document.getElementById(id);
    var vEl = document.getElementById(valId);
    if (!el) return;
    el.addEventListener('input', function () {
      var v = parseFloat(el.value);
      if (vEl) vEl.textContent = v;
      setter(v);
      rebuildPreview();
    });
  }

  function setSlider(id, valId, v) {
    var el = document.getElementById(id);
    var vEl = document.getElementById(valId);
    if (el) el.value = v;
    if (vEl) vEl.textContent = v;
  }

  /* ═══ Preview-Renderer ═══ */
  var PREVIEW_SCALE = 5;

  function rebuildPreview() {
    preview.innerHTML = '';

    var tr = {
      scale: body.scale, chub: body.chub, headMul: body.headMul, legMul: body.legMul,
      tailSize: body.tailSize, isBlack: body.isBlack,
      woolColor: body.isBlack ? '#3a3a3a' : body.woolColor,
      borderColor: body.isBlack ? '#1a1a1a' : body.borderColor,
      skinColor: body.isBlack ? '#2a2a2a' : body.skinColor,
      accColor: body.accColor,
      accessory: currentCssAcc,
      spriteHat: currentHat, spriteGlasses: currentGlasses, spriteStache: currentStache, spriteBody: currentBody, spriteTail: currentTail,
      legs: [
        {lx:-3,ly:5.5},{lx:3,ly:5.5},{lx:-2,ly:6},{lx:2,ly:6}
      ],
      legPhases:[0,Math.PI,0.5,Math.PI+0.5], legRestAngles:[0,0,0,0]
    };

    var tw = TORSO_W * tr.chub, th = TORSO_H;
    var hw = HEAD_W * tr.headMul, hh = HEAD_H * tr.headMul;
    var lh = LEG_H * tr.legMul;

    // Das echte Rendering nutzt ein Nullpunkt-System (0,0) = Torso-Mitte.
    // Kopf, Beine, Schwanz werden relativ dazu positioniert.
    // Wir berechnen alles relativ zum Ursprung und verschieben dann in die Preview-Mitte.

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:0;height:0;';

    var totalScale = PREVIEW_SCALE * body.scale;
    var container = document.createElement('div');
    container.style.cssText = 'position:absolute;top:55%;left:50%;transform:translate(-50%,-50%) scale(' + totalScale + ');';
    preview.appendChild(container);
    container.appendChild(wrap);

    function mk(cls) { var el = document.createElement('div'); el.className = cls; el.style.position = 'absolute'; wrap.appendChild(el); return el; }

    // Wie im echten render(): Torso bei (0,0), alles relativ dazu.
    // tx=0, ty=0 (kein bob im Preview)
    var tx = 0, ty = 0;
    var hr = HEAD_W / 2 * tr.headMul; // Kopfradius

    // Kopfposition: wie render() Zeile 1003-1006 (tailSide=1, kein bank)
    var headSideX = 0; // zentriert (kein tailSide-Offset)
    var hx = tx + headSideX, hy = ty - 5; // -5 = Kopf 5px über Torso-Mitte

    // Beine (hinter Torso zuerst, dann vorne)
    var legEls = [];
    var legDefs = [
      {cls:'s-leg bk',l:tr.legs[2]},{cls:'s-leg bk',l:tr.legs[3]},
      {cls:'s-leg fr',l:tr.legs[0]},{cls:'s-leg fr',l:tr.legs[1]}
    ];
    for (var li = 0; li < legDefs.length; li++) {
      var ld = legDefs[li];
      var leg = mk(ld.cls);
      // Bein-Hüfte relativ zu Torso-Mitte
      var hipX = tx + ld.l.lx, hipY = ty + ld.l.ly;
      leg.style.cssText += 'left:' + (hipX - LEG_W/2) + 'px;top:' + hipY + 'px;width:' + LEG_W + 'px;height:' + lh + 'px;background:' + tr.skinColor + ';border-radius:1px;transform-origin:1px 0;';
      legEls.push(leg);
    }

    // Schwanz (rechts vom Torso)
    var tail = mk('s-tail');
    var tailX = tx + tw/2 + tr.tailSize * 0.3, tailY = ty + 1;
    tail.style.cssText += 'width:' + tr.tailSize + 'px;height:' + tr.tailSize + 'px;background:' + tr.woolColor + ';border:1px solid ' + tr.borderColor + ';left:' + (tailX - tr.tailSize/2) + 'px;top:' + (tailY - tr.tailSize/2) + 'px;';

    // Torso (zentriert um 0,0 wie im echten render)
    var torso = mk('s-torso');
    torso.style.cssText += 'width:' + tw + 'px;height:' + th + 'px;background:' + tr.woolColor + ';border-color:' + tr.borderColor + ';left:' + (tx - tw/2) + 'px;top:' + (ty - th/2) + 'px;';

    // Kopf (zentriert um hx,hy)
    var head = mk('s-head');
    head.style.cssText += 'width:' + hw + 'px;height:' + hh + 'px;background:' + tr.woolColor + ';border-color:' + tr.borderColor + ';left:' + (hx - hw/2) + 'px;top:' + (hy - hh/2) + 'px;';
    head.style.setProperty('--wool', tr.woolColor);
    head.style.setProperty('--bdr', tr.borderColor);

    // Ohren (mit Config)
    var fc = cfg.face;
    var earColor = tr.isBlack ? '#2a2a2a' : '#f4c7b0';
    var earL = document.createElement('div'); earL.className = 's-ear l'; earL.style.background = earColor; earL.style.border = '.8px solid ' + tr.borderColor;
    earL.style.top = fc.earY + 'px'; earL.style.left = fc.earLeftX + 'px';
    head.appendChild(earL);
    var earR = document.createElement('div'); earR.className = 's-ear r'; earR.style.background = earColor; earR.style.border = '.8px solid ' + tr.borderColor;
    earR.style.top = fc.earY + 'px'; earR.style.right = fc.earRightX + 'px';
    head.appendChild(earR);

    // Augen + Mund (mit Config)
    var eyeL = document.createElement('div'); eyeL.className = 's-eye l';
    eyeL.style.top = fc.eyeY + 'px'; eyeL.style.left = fc.eyeLeftX + 'px';
    head.appendChild(eyeL);
    var eyeR = document.createElement('div'); eyeR.className = 's-eye r';
    eyeR.style.top = fc.eyeY + 'px'; eyeR.style.right = fc.eyeRightX + 'px';
    head.appendChild(eyeR);
    var mouth = document.createElement('div'); mouth.className = 's-mouth';
    mouth.style.bottom = fc.mouthY + 'px';
    head.appendChild(mouth);
    if (tr.isBlack) { eyeL.style.background = eyeR.style.background = '#eee'; mouth.style.borderColor = tr.borderColor; }

    // Propeller (statisch, ausblendbar)
    if (body.showPropeller) {
      var pSz = body.propSize, pColor = body.propBladeColor, pHubC = body.propHubColor;
      var pBC = body.propBladeCount, pShape = body.propShape;
      var scaledPoleH = POLE_H * pSz, scaledHubSz = HUB_SZ * pSz, halfBw = 14 * pSz;
      var topPX = hx, topPY = hy - hr - 1;
      var hubPY = topPY - scaledPoleH;
      var pole = mk('p s-pole');
      pole.style.cssText += 'height:' + scaledPoleH + 'px;left:' + (topPX - 0.75) + 'px;top:' + topPY + 'px;';
      var hub = mk('p s-hub');
      hub.style.cssText += 'width:' + scaledHubSz + 'px;height:' + scaledHubSz + 'px;left:' + (topPX - scaledHubSz/2) + 'px;top:' + (hubPY - scaledHubSz/2) + 'px;';
      hub.style.setProperty('--hub-color', pHubC);
      var bwrapSz = Math.round(28 * pSz);
      var bwrap = mk('p s-bwrap');
      bwrap.style.cssText += 'width:' + bwrapSz + 'px;height:' + bwrapSz + 'px;left:' + (topPX - halfBw) + 'px;top:' + (hubPY - halfBw) + 'px;';
      var blades = document.createElement('div'); blades.className = 's-blades';
      blades.style.transform = 'rotateX(60deg) rotate(25deg)';
      blades.style.setProperty('--bl-dark', darkenColor(pColor));
      blades.style.setProperty('--bl-light', pColor);
      bwrap.appendChild(blades);
      var shapeClass = pShape !== 'standard' ? ' s-bl--' + pShape : '';
      for (var bi = 0; bi < pBC; bi++) {
        var bl = document.createElement('div'); bl.className = 's-bl' + shapeClass;
        if (pSz !== 1 && bi > 0) bl.style.transform = 'rotate(' + (bi * (360 / pBC)) + 'deg) scale(' + pSz + ')';
        else if (pSz !== 1 && bi === 0) bl.style.transform = 'scale(' + pSz + ')';
        else if (bi > 0) bl.style.transform = 'rotate(' + (bi * (360 / pBC)) + 'deg)';
        blades.appendChild(bl);
      }
    }

    /* CSS-Accessoire */
    var accCfg = cfg.cssAccessories || {};
    function applyCssOff(el, type) {
      var c = accCfg[type]; if (!c) return;
      if (c.offsetY) el.style.top = (parseFloat(el.style.top) || 0) + c.offsetY + 'px';
      if (c.offsetX) el.style.marginLeft = c.offsetX + 'px';
      if (c.scale && c.scale !== 1) { var t = el.style.transform || ''; el.style.transform = t + ' scale(' + c.scale + ')'; }
    }

    if (tr.accessory === 'tophat') {
      var h = document.createElement('div'); h.className = 's-acc s-tophat'; h.style.background = tr.isBlack ? '#555' : '#222';
      head.appendChild(h); applyCssOff(h, 'tophat');
    } else if (tr.accessory === 'partyhat') {
      var h = document.createElement('div'); h.className = 's-acc s-partyhat'; h.style.borderBottomColor = tr.accColor; h.style.borderBottomWidth = '10px';
      head.appendChild(h); applyCssOff(h, 'partyhat');
    } else if (tr.accessory === 'crown') {
      var h = document.createElement('div'); h.className = 's-acc s-crown';
      head.appendChild(h); applyCssOff(h, 'crown');
    } else if (tr.accessory === 'beanie') {
      var h = document.createElement('div'); h.className = 's-acc s-beanie'; h.style.background = tr.accColor;
      head.appendChild(h); applyCssOff(h, 'beanie');
    } else if (tr.accessory === 'glasses') {
      var g = document.createElement('div'); g.className = 's-acc s-glasses';
      g.innerHTML = '<span class="s-lens"></span><span class="s-lens"></span><span class="s-bridge"></span>';
      head.appendChild(g); applyCssOff(g, 'glasses');
    } else if (tr.accessory === 'bowtie') {
      var bt = document.createElement('div'); bt.className = 's-acc s-bowtie'; bt.style.borderLeftColor = bt.style.borderRightColor = tr.accColor; bt.style.borderLeftWidth = bt.style.borderRightWidth = '3.5px';
      torso.appendChild(bt); applyCssOff(bt, 'bowtie');
    } else if (tr.accessory === 'bell') {
      var b = document.createElement('div'); b.className = 's-acc s-bell'; head.appendChild(b); applyCssOff(b, 'bell');
    } else if (tr.accessory === 'flower') {
      var f = document.createElement('div'); f.className = 's-acc s-flower'; f.style.background = tr.accColor; head.appendChild(f); applyCssOff(f, 'flower');
    } else if (tr.accessory === 'scarf') {
      var s = document.createElement('div'); s.className = 's-acc s-scarf'; s.style.background = tr.accColor;
      head.appendChild(s); applyCssOff(s, 'scarf');
    } else if (tr.accessory === 'shoes') {
      for (var si = 0; si < legEls.length; si++) {
        var sh = document.createElement('div'); sh.className = 's-shoe'; sh.style.background = tr.accColor; legEls[si].appendChild(sh);
      }
    }

    /* Sprite-Overlays */
    function applyPreviewSpriteOverlay(el, idx, catCfg, defaultCount, posYProp) {
      var customSlots = catCfg.customSlots || [];
      var item;
      if (idx >= defaultCount && customSlots[idx - defaultCount]) {
        var cs = customSlots[idx - defaultCount];
        item = cs;
        if (cs.image) { el.style.backgroundImage = 'url(' + cs.image + ')'; el.style.backgroundSize = 'contain'; el.style.backgroundPosition = 'center'; }
      } else {
        item = (catCfg.items && catCfg.items[idx]) || { dY: 0, dX: 0 };
        if (item.customImage) {
          el.style.backgroundImage = 'url(' + item.customImage + ')'; el.style.backgroundSize = 'contain'; el.style.backgroundPosition = 'center';
          return item; // Skip default spritesheet positioning
        }
      }
      return item || { dY: 0, dX: 0 };
    }

    if (tr.spriteHat >= 0) {
      var hatEl = document.createElement('div');
      var hC = cfg.spriteHat;
      var hCustomSlots = hC.customSlots || [];
      if (tr.spriteHat >= 16 && tr.spriteHat < 16 + (hCustomSlots.length ? 0 : 999)) {
        // Default wig range (index 16-24)
        hatEl.className = 's-sprite-wig';
        var wigIdx = tr.spriteHat - 16;
        var wc = wigIdx % 3, wr = (wigIdx / 3) | 0;
        hatEl.style.backgroundPosition = (wc * 50) + '% ' + (wr * 50) + '%';
      } else {
        hatEl.className = 's-sprite-hat';
        var hItem = applyPreviewSpriteOverlay(hatEl, tr.spriteHat, hC, 16, 'top');
        if (!hItem.customImage && !(tr.spriteHat >= 16)) {
          var hatCol = tr.spriteHat % 4, hatRow = (tr.spriteHat / 4) | 0;
          if (hC.customSheet) hatEl.style.backgroundImage = 'url(' + hC.customSheet + ')';
          hatEl.style.backgroundPosition = -(hatCol * hC.slotW) + 'px ' + -(hatRow * hC.slotH) + 'px';
        }
        hatEl.style.top = ((hC.offsetY || 0) + (hItem.dY || 0)) + 'px';
        var hTotalX = (hC.offsetX || 0) + (hItem.dX || 0);
        if (hTotalX) hatEl.style.left = 'calc(50% + ' + hTotalX + 'px)';
        var hTotalS = (hC.scale || 1) * (hItem.dS || 1);
        if (hTotalS !== 1) hatEl.style.transform = 'translateX(-50%) scale(' + hTotalS + ')';
      }
      head.appendChild(hatEl);
    }
    if (tr.spriteGlasses >= 0) {
      var glEl = document.createElement('div'); glEl.className = 's-sprite-glasses';
      var gC = cfg.spriteGlasses;
      var gItem = applyPreviewSpriteOverlay(glEl, tr.spriteGlasses, gC, 32, 'top');
      if (!gItem.customImage && !gItem.image) {
        if (gC.customSheet) glEl.style.backgroundImage = 'url(' + gC.customSheet + ')';
        var glCol = tr.spriteGlasses % (gC.cols || 4), glRow = (tr.spriteGlasses / (gC.cols || 4)) | 0;
        glEl.style.backgroundPosition = -(glCol * (gC.slotW || 16.975)) + 'px ' + -(glRow * (gC.slotH || 8.3375)) + 'px';
      }
      glEl.style.top = ((gC.offsetY || 0) + (gItem.dY || 0)) + 'px';
      var gTotalX = (gC.offsetX || 0) + (gItem.dX || 0);
      if (gTotalX) glEl.style.left = 'calc(50% + ' + gTotalX + 'px)';
      var gTotalS = (gC.scale || 1) * (gItem.dS || 1);
      if (gTotalS !== 1) glEl.style.transform = 'translateX(-50%) scale(' + gTotalS + ')';
      head.appendChild(glEl);
    }
    if (tr.spriteStache >= 0) {
      var stEl = document.createElement('div'); stEl.className = 's-sprite-stache';
      var sC = cfg.spriteStache;
      var sItem2 = applyPreviewSpriteOverlay(stEl, tr.spriteStache, sC, 12, 'bottom');
      if (!sItem2.customImage && !sItem2.image) {
        if (sC.customSheet) stEl.style.backgroundImage = 'url(' + sC.customSheet + ')';
        var stCol = tr.spriteStache % (sC.cols || 3), stRow = (tr.spriteStache / (sC.cols || 3)) | 0;
        stEl.style.backgroundPosition = -(stCol * (sC.slotW || 40)) + 'px ' + -(stRow * (sC.slotH || 30)) + 'px';
      }
      stEl.style.bottom = ((sC.offsetY || 0) + (sItem2.dY || 0)) + 'px';
      var sTotalX = (sC.offsetX || 0) + (sItem2.dX || 0);
      if (sTotalX) stEl.style.left = 'calc(50% + ' + sTotalX + 'px)';
      var sTotalS = (sC.scale || 1) * (sItem2.dS || 1);
      if (sTotalS !== 1) stEl.style.transform = 'translateX(-50%) scale(' + sTotalS + ')';
      head.appendChild(stEl);
    }
    if (tr.spriteBody >= 0) {
      var bdEl = document.createElement('div'); bdEl.className = 's-sprite-body';
      var bdC = cfg.spriteBody;
      var bdItem = applyPreviewSpriteOverlay(bdEl, tr.spriteBody, bdC, 0, 'top');
      var bdPosY = (bdC.offsetY || 0) + (bdItem.dY || 0);
      bdEl.style.top = bdPosY + 'px';
      var bdTotalX = (bdC.offsetX || 0) + (bdItem.dX || 0);
      if (bdTotalX) bdEl.style.left = bdTotalX + 'px';
      var bdTotalS = (bdC.scale || 1) * (bdItem.dS || 1);
      if (bdTotalS !== 1) bdEl.style.transform = 'scale(' + bdTotalS + ')';
      torso.appendChild(bdEl);
    }
    if (tr.spriteTail >= 0) {
      var tlEl = document.createElement('div'); tlEl.className = 's-sprite-tail';
      var tlC = cfg.spriteTail;
      var tlItem = applyPreviewSpriteOverlay(tlEl, tr.spriteTail, tlC, 0, 'top');
      var tlPosY = (tlC.offsetY || 0) + (tlItem.dY || 0);
      tlEl.style.top = tlPosY + 'px';
      var tlTotalX = (tlC.offsetX || 0) + (tlItem.dX || 0);
      if (tlTotalX) tlEl.style.left = tlTotalX + 'px';
      var tlTotalS = (tlC.scale || 1) * (tlItem.dS || 1);
      if (tlTotalS !== 1) tlEl.style.transform = 'scale(' + tlTotalS + ')';
      tail.appendChild(tlEl);
    }
  }

  /* ═══ Sprite-Grid bauen ═══ */

  var SPRITE_SHEETS = {
    's-sprite-hat': '/img/spritesheet_hats.png',
    's-sprite-glasses': '/img/spritesheet_glasses.png',
    's-sprite-stache': '/img/spritesheet_stuff.png'
  };

  var CATEGORY_FOR_CLASS = {
    's-sprite-hat': 'spriteHat',
    's-sprite-glasses': 'spriteGlasses',
    's-sprite-stache': 'spriteStache',
    's-sprite-body': 'spriteBody',
    's-sprite-tail': 'spriteTail'
  };

  function getCustomImageForSlot(category, idx) {
    var catCfg = cfg[category] || {};
    var defaultCount = DEFAULT_SLOT_COUNTS[category] || 0;
    if (idx < defaultCount) {
      return (catCfg.items && catCfg.items[idx] && catCfg.items[idx].customImage) || null;
    }
    var customSlots = catCfg.customSlots || [];
    var cs = customSlots[idx - defaultCount];
    return cs ? cs.image : null;
  }

  function buildDefaultSpriteTile(spr, spriteClass, i) {
    spr.style.cssText = 'position:relative;top:auto;left:auto;bottom:auto;right:auto;transform:scale(3);transform-origin:center center;pointer-events:none;z-index:11;background-repeat:no-repeat;image-rendering:auto;';
    if (spriteClass === 's-sprite-hat') {
      if (i >= 16) {
        var wc = (i - 16) % 3, wr = ((i - 16) / 3) | 0;
        spr.style.width = '11px'; spr.style.height = '15px';
        spr.style.backgroundImage = 'url(/img/spritesheet_peruecken.png)';
        spr.style.backgroundSize = '300% 300%';
        spr.style.backgroundPosition = (wc * 50) + '% ' + (wr * 50) + '%';
        spr.style.transform = 'scale(2.5)';
      } else {
        var c = i % 4, r = (i / 4) | 0;
        spr.style.width = '10px'; spr.style.height = '9px';
        spr.style.backgroundImage = 'url(' + (cfg.spriteHat.customSheet || '/img/spritesheet_hats.png') + ')';
        spr.style.backgroundSize = '40px 36px';
        spr.style.backgroundPosition = -(c * cfg.spriteHat.slotW) + 'px ' + -(r * cfg.spriteHat.slotH) + 'px';
      }
    } else if (spriteClass === 's-sprite-glasses') {
      var gc = i % (cfg.spriteGlasses.cols || 4), gr = (i / (cfg.spriteGlasses.cols || 4)) | 0;
      spr.style.width = (cfg.spriteGlasses.slotW || 16.975) + 'px';
      spr.style.height = (cfg.spriteGlasses.slotH || 8.3375) + 'px';
      spr.style.transform = 'scale(2.7)';
      spr.style.backgroundImage = 'url(' + (cfg.spriteGlasses.customSheet || '/img/spritesheet_glasses.png') + ')';
      spr.style.backgroundSize = '67.9px 66.7px';
      spr.style.backgroundPosition = -(gc * (cfg.spriteGlasses.slotW || 16.975)) + 'px ' + -(gr * (cfg.spriteGlasses.slotH || 8.3375)) + 'px';
    } else if (spriteClass === 's-sprite-stache') {
      var sc = i % (cfg.spriteStache.cols || 3), sr2 = (i / (cfg.spriteStache.cols || 3)) | 0;
      spr.style.width = (cfg.spriteStache.slotW || 40) + 'px';
      spr.style.height = (cfg.spriteStache.slotH || 30) + 'px';
      spr.style.transform = 'scale(1.1)';
      spr.style.backgroundImage = 'url(' + (cfg.spriteStache.customSheet || '/img/spritesheet_stuff.png') + ')';
      spr.style.backgroundSize = '120px 120px';
      spr.style.backgroundPosition = -(sc * (cfg.spriteStache.slotW || 40)) + 'px ' + -(sr2 * (cfg.spriteStache.slotH || 30)) + 'px';
    }
  }

  function buildCustomImageTile(spr, url) {
    spr.style.cssText = 'position:relative;width:36px;height:36px;pointer-events:none;z-index:11;background-repeat:no-repeat;background-size:contain;background-position:center;';
    spr.style.backgroundImage = 'url(' + url + ')';
  }

  function buildSpriteGrid(containerId, defaultCount, cols, spriteClass, current, onSelect) {
    var grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';
    var category = CATEGORY_FOR_CLASS[spriteClass];
    var catCfg = cfg[category] || {};
    var customSlots = catCfg.customSlots || [];
    var totalCount = defaultCount + customSlots.length;

    // "Kein"-Button
    var none = document.createElement('div');
    none.className = 'umkleide-sprite-tile' + (current < 0 ? ' active' : '');
    none.textContent = '\u2013';
    none.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--muted);';
    none.title = 'Kein';
    none.addEventListener('click', function () { onSelect(-1); });
    grid.appendChild(none);

    for (var i = 0; i < totalCount; i++) {
      var tile = document.createElement('div');
      tile.className = 'umkleide-sprite-tile' + (i === current ? ' active' : '');
      tile.title = '#' + i;
      var isCustomSlot = i >= defaultCount;

      var customImage = getCustomImageForSlot(category, i);
      var spr = document.createElement('div');

      if (customImage) {
        buildCustomImageTile(spr, customImage);
      } else if (isCustomSlot) {
        // Leerer Custom-Slot — Platzhalter
        spr.style.cssText = 'position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;pointer-events:none;';
        spr.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      } else {
        buildDefaultSpriteTile(spr, spriteClass, i);
      }

      tile.appendChild(spr);

      // Upload-Overlay (Kamera-Icon) auf Hover
      var overlay = document.createElement('div');
      overlay.className = 'sprite-tile-upload-overlay';
      overlay.title = customImage ? 'Bild ersetzen' : 'Eigenes Bild hochladen';
      overlay.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
      (function (idx) {
        overlay.addEventListener('click', function (e) {
          e.stopPropagation();
          triggerSlotUpload(category, idx);
        });
      })(i);
      tile.appendChild(overlay);

      // ✕-Button für Custom-Slots oder für Default-Slots mit customImage
      if (isCustomSlot) {
        var removeBtn = document.createElement('div');
        removeBtn.className = 'sprite-tile-remove-btn';
        removeBtn.title = 'Slot entfernen';
        removeBtn.innerHTML = '&times;';
        (function (idx) {
          removeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeCustomSlot(category, idx);
          });
        })(i);
        tile.appendChild(removeBtn);
      } else if (customImage) {
        var resetBtn = document.createElement('div');
        resetBtn.className = 'sprite-tile-remove-btn';
        resetBtn.title = 'Eigenes Bild entfernen';
        resetBtn.innerHTML = '&times;';
        (function (idx) {
          resetBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeSlotSprite(category, idx);
          });
        })(i);
        tile.appendChild(resetBtn);
      }

      (function (idx) {
        tile.addEventListener('click', function () { onSelect(idx); });
      })(i);
      grid.appendChild(tile);
    }

    // "+" Tile zum Hinzufügen
    var addTile = document.createElement('div');
    addTile.className = 'umkleide-sprite-tile sprite-tile-add';
    addTile.title = 'Neuen Slot hinzuf\u00fcgen';
    addTile.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    addTile.addEventListener('click', function () { addCustomSlot(category); });
    grid.appendChild(addTile);
  }

  function refreshGridActive(containerId, current) {
    var tiles = document.getElementById(containerId).children;
    for (var i = 0; i < tiles.length; i++) {
      // Index 0 = "Kein", danach 0..n
      var tileIdx = i - 1;
      tiles[i].classList.toggle('active', tileIdx === current);
    }
  }

  /* ═══ CSS-Acc Buttons ═══ */
  function buildCssButtons() {
    var container = document.getElementById('cssBtns');
    if (!container) return;
    container.innerHTML = '';

    // "Kein"-Button
    var none = document.createElement('button');
    none.type = 'button';
    none.textContent = 'Kein';
    none.className = (!currentCssAcc ? 'active' : '');
    none.addEventListener('click', function () { selectCssAcc(null); });
    container.appendChild(none);

    for (var i = 0; i < CSS_ACC_KEYS.length; i++) {
      var key = CSS_ACC_KEYS[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = CSS_ACC_NAMES[key];
      btn.className = (key === currentCssAcc ? 'active' : '');
      (function (k) {
        btn.addEventListener('click', function () { selectCssAcc(k); });
      })(key);
      container.appendChild(btn);
    }
  }

  function selectCssAcc(key) {
    currentCssAcc = key;
    selectedCssKey = key || 'tophat';
    buildCssButtons();
    loadCssSliders();
    rebuildPreview();
  }

  function loadCssSliders() {
    var c = cfg.cssAccessories[selectedCssKey] || {offsetY:0,offsetX:0,scale:1};
    setSlider('cssY', 'cssYV', c.offsetY);
    setSlider('cssX', 'cssXV', c.offsetX);
    setSlider('cssS', 'cssSV', c.scale);
  }

  /* ═══ Per-Item-Offset Helpers ═══ */
  function getItemOff(catCfg, idx, categoryKey) {
    var defaultCount = categoryKey ? (DEFAULT_SLOT_COUNTS[categoryKey] || 0) : 9999;
    if (idx >= defaultCount) {
      // Custom-Slot: offsets leben in customSlots-Array
      if (!catCfg.customSlots) catCfg.customSlots = [];
      var csIdx = idx - defaultCount;
      if (!catCfg.customSlots[csIdx]) catCfg.customSlots[csIdx] = { image: null, dY: 0, dX: 0, dS: 1 };
      if (catCfg.customSlots[csIdx].dS == null) catCfg.customSlots[csIdx].dS = 1;
      return catCfg.customSlots[csIdx];
    }
    if (!catCfg.items) catCfg.items = {};
    if (!catCfg.items[idx]) catCfg.items[idx] = { dY: 0, dX: 0, dS: 1 };
    if (catCfg.items[idx].dS == null) catCfg.items[idx].dS = 1;
    return catCfg.items[idx];
  }

  function showItemSliders(panelId, labelId, idx, catCfg, idYId, idYVId, idXId, idXVId, idSId, idSVId, categoryKey) {
    var panel = document.getElementById(panelId);
    if (idx < 0) { if (panel) panel.style.display = 'none'; return; }
    var off = getItemOff(catCfg, idx, categoryKey);
    var label = document.getElementById(labelId);
    if (label) label.textContent = '#' + idx;
    setSlider(idYId, idYVId, off.dY);
    setSlider(idXId, idXVId, off.dX);
    if (idSId) setSlider(idSId, idSVId, off.dS != null ? off.dS : 1);
    if (panel) panel.style.display = '';
  }

  /* ═══ Select-Handlers ═══ */
  function selectHat(idx) {
    currentHat = idx;
    refreshGridActive('hatGrid', idx);
    showItemSliders('hatItemSliders', 'hatItemLabel', idx, cfg.spriteHat, 'hatIdY', 'hatIdYV', 'hatIdX', 'hatIdXV', 'hatIdS', 'hatIdSV', 'spriteHat');
    rebuildPreview();
  }
  function selectGlasses(idx) {
    currentGlasses = idx;
    refreshGridActive('glassesGrid', idx);
    showItemSliders('glItemSliders', 'glItemLabel', idx, cfg.spriteGlasses, 'glIdY', 'glIdYV', 'glIdX', 'glIdXV', 'glIdS', 'glIdSV', 'spriteGlasses');
    rebuildPreview();
  }
  function selectStache(idx) {
    currentStache = idx;
    refreshGridActive('stacheGrid', idx);
    showItemSliders('stItemSliders', 'stItemLabel', idx, cfg.spriteStache, 'stIdY', 'stIdYV', 'stIdX', 'stIdXV', 'stIdS', 'stIdSV', 'spriteStache');
    rebuildPreview();
  }
  function selectBody(idx) {
    currentBody = idx;
    refreshGridActive('bodyGrid', idx);
    showItemSliders('bodyItemSliders', 'bodyItemLabel', idx, cfg.spriteBody, 'bodyIdY', 'bodyIdYV', 'bodyIdX', 'bodyIdXV', 'bodyIdS', 'bodyIdSV', 'spriteBody');
    rebuildPreview();
  }
  function selectTail(idx) {
    currentTail = idx;
    refreshGridActive('tailGrid', idx);
    showItemSliders('tailItemSliders', 'tailItemLabel', idx, cfg.spriteTail, 'tailIdY', 'tailIdYV', 'tailIdX', 'tailIdXV', 'tailIdS', 'tailIdSV', 'spriteTail');
    rebuildPreview();
  }

  /* ═══ Slider-Bindings ═══ */
  // Sprite Hat
  bindSlider('hatY', 'hatYV', function (v) { cfg.spriteHat.offsetY = v; });
  bindSlider('hatX', 'hatXV', function (v) { cfg.spriteHat.offsetX = v; });
  bindSlider('hatS', 'hatSV', function (v) { cfg.spriteHat.scale = v; });

  // Sprite Glasses
  bindSlider('glY', 'glYV', function (v) { cfg.spriteGlasses.offsetY = v; });
  bindSlider('glX', 'glXV', function (v) { cfg.spriteGlasses.offsetX = v; });
  bindSlider('glS', 'glSV', function (v) { cfg.spriteGlasses.scale = v; });

  // Sprite Stache
  bindSlider('stY', 'stYV', function (v) { cfg.spriteStache.offsetY = v; });
  bindSlider('stX', 'stXV', function (v) { cfg.spriteStache.offsetX = v; });
  bindSlider('stS', 'stSV', function (v) { cfg.spriteStache.scale = v; });

  // Per-Item-Offsets (Feinkorrektur pro Sprite-Item)
  bindSlider('hatIdY', 'hatIdYV', function (v) { if (currentHat >= 0) getItemOff(cfg.spriteHat, currentHat, 'spriteHat').dY = v; });
  bindSlider('hatIdX', 'hatIdXV', function (v) { if (currentHat >= 0) getItemOff(cfg.spriteHat, currentHat, 'spriteHat').dX = v; });
  bindSlider('hatIdS', 'hatIdSV', function (v) { if (currentHat >= 0) getItemOff(cfg.spriteHat, currentHat, 'spriteHat').dS = v; });
  bindSlider('glIdY', 'glIdYV', function (v) { if (currentGlasses >= 0) getItemOff(cfg.spriteGlasses, currentGlasses, 'spriteGlasses').dY = v; });
  bindSlider('glIdX', 'glIdXV', function (v) { if (currentGlasses >= 0) getItemOff(cfg.spriteGlasses, currentGlasses, 'spriteGlasses').dX = v; });
  bindSlider('glIdS', 'glIdSV', function (v) { if (currentGlasses >= 0) getItemOff(cfg.spriteGlasses, currentGlasses, 'spriteGlasses').dS = v; });
  bindSlider('stIdY', 'stIdYV', function (v) { if (currentStache >= 0) getItemOff(cfg.spriteStache, currentStache, 'spriteStache').dY = v; });
  bindSlider('stIdX', 'stIdXV', function (v) { if (currentStache >= 0) getItemOff(cfg.spriteStache, currentStache, 'spriteStache').dX = v; });
  bindSlider('stIdS', 'stIdSV', function (v) { if (currentStache >= 0) getItemOff(cfg.spriteStache, currentStache, 'spriteStache').dS = v; });

  // Sprite Body
  bindSlider('bodyY', 'bodyYV', function (v) { cfg.spriteBody.offsetY = v; });
  bindSlider('bodyX', 'bodyXV', function (v) { cfg.spriteBody.offsetX = v; });
  bindSlider('bodyS', 'bodySV', function (v) { cfg.spriteBody.scale = v; });
  bindSlider('bodyIdY', 'bodyIdYV', function (v) { if (currentBody >= 0) getItemOff(cfg.spriteBody, currentBody, 'spriteBody').dY = v; });
  bindSlider('bodyIdX', 'bodyIdXV', function (v) { if (currentBody >= 0) getItemOff(cfg.spriteBody, currentBody, 'spriteBody').dX = v; });
  bindSlider('bodyIdS', 'bodyIdSV', function (v) { if (currentBody >= 0) getItemOff(cfg.spriteBody, currentBody, 'spriteBody').dS = v; });

  // Sprite Tail
  bindSlider('tailY', 'tailYV', function (v) { cfg.spriteTail.offsetY = v; });
  bindSlider('tailX', 'tailXV', function (v) { cfg.spriteTail.offsetX = v; });
  bindSlider('tailS', 'tailSV', function (v) { cfg.spriteTail.scale = v; });
  bindSlider('tailIdY', 'tailIdYV', function (v) { if (currentTail >= 0) getItemOff(cfg.spriteTail, currentTail, 'spriteTail').dY = v; });
  bindSlider('tailIdX', 'tailIdXV', function (v) { if (currentTail >= 0) getItemOff(cfg.spriteTail, currentTail, 'spriteTail').dX = v; });
  bindSlider('tailIdS', 'tailIdSV', function (v) { if (currentTail >= 0) getItemOff(cfg.spriteTail, currentTail, 'spriteTail').dS = v; });

  // CSS Accessory
  bindSlider('cssY', 'cssYV', function (v) { if (!cfg.cssAccessories[selectedCssKey]) cfg.cssAccessories[selectedCssKey] = {offsetY:0,offsetX:0,scale:1}; cfg.cssAccessories[selectedCssKey].offsetY = v; });
  bindSlider('cssX', 'cssXV', function (v) { if (!cfg.cssAccessories[selectedCssKey]) cfg.cssAccessories[selectedCssKey] = {offsetY:0,offsetX:0,scale:1}; cfg.cssAccessories[selectedCssKey].offsetX = v; });
  bindSlider('cssS', 'cssSV', function (v) { if (!cfg.cssAccessories[selectedCssKey]) cfg.cssAccessories[selectedCssKey] = {offsetY:0,offsetX:0,scale:1}; cfg.cssAccessories[selectedCssKey].scale = v; });

  // Gesicht (wird gespeichert)
  bindSlider('fEyeY', 'fEyeYV', function (v) { cfg.face.eyeY = v; });
  bindSlider('fEyeLX', 'fEyeLXV', function (v) { cfg.face.eyeLeftX = v; });
  bindSlider('fEyeRX', 'fEyeRXV', function (v) { cfg.face.eyeRightX = v; });
  bindSlider('fEarY', 'fEarYV', function (v) { cfg.face.earY = v; });
  bindSlider('fEarLX', 'fEarLXV', function (v) { cfg.face.earLeftX = v; });
  bindSlider('fEarRX', 'fEarRXV', function (v) { cfg.face.earRightX = v; });
  bindSlider('fMouthY', 'fMouthYV', function (v) { cfg.face.mouthY = v; });

  // Body-Slider (nur Vorschau)
  bindSlider('pScale', 'pScaleV', function (v) { body.scale = v; });
  bindSlider('pChub', 'pChubV', function (v) { body.chub = v; });
  bindSlider('pHead', 'pHeadV', function (v) { body.headMul = v; });
  bindSlider('pLegs', 'pLegsV', function (v) { body.legMul = v; });
  bindSlider('pTail', 'pTailV', function (v) { body.tailSize = v; });

  var blackCb = document.getElementById('pBlack');
  if (blackCb) blackCb.addEventListener('change', function () { body.isBlack = this.checked; rebuildPreview(); });

  var propCb = document.getElementById('pPropeller');
  if (propCb) propCb.addEventListener('change', function () { body.showPropeller = this.checked; rebuildPreview(); });

  var accColorEl = document.getElementById('pAccColor');
  if (accColorEl) accColorEl.addEventListener('input', function () { body.accColor = this.value; rebuildPreview(); });

  // Propeller-Varianten Controls
  bindSlider('pPropSize', 'pPropSizeV', function (v) { body.propSize = v; });
  var propCountEl = document.getElementById('pPropBladeCount');
  if (propCountEl) propCountEl.addEventListener('change', function () { body.propBladeCount = parseInt(this.value, 10); rebuildPreview(); });
  var propShapeEl = document.getElementById('pPropShape');
  if (propShapeEl) propShapeEl.addEventListener('change', function () { body.propShape = this.value; rebuildPreview(); });
  var propColorEl = document.getElementById('pPropColor');
  if (propColorEl) propColorEl.addEventListener('input', function () { body.propBladeColor = this.value; rebuildPreview(); });
  var propHubColorEl = document.getElementById('pPropHubColor');
  if (propHubColorEl) propHubColorEl.addEventListener('input', function () { body.propHubColor = this.value; rebuildPreview(); });

  /* Zufaelliges Schaf */
  var randomBtn = document.getElementById('btnRandomBody');
  if (randomBtn) randomBtn.addEventListener('click', function () {
    var woolColors = ['white','white','white','#f5f0e0','#eee','#f0e6d3','#e8ddd0','#f5e6f0','#e0f0e8','#f0f0d8','#ffe8d6'];
    var accColors = ['#e44','#44e','#4a4','#e4e','#fa0','#0cd','#f80','#c44'];
    body.scale = +(0.6 + Math.random() * 0.8).toFixed(2);
    body.chub = +(0.7 + Math.random() * 0.7).toFixed(2);
    body.headMul = +(0.75 + Math.random() * 0.5).toFixed(2);
    body.legMul = +(0.9 + Math.random() * 0.8).toFixed(2);
    body.tailSize = +(3 + Math.random() * 3).toFixed(1);
    body.isBlack = Math.random() < 0.15;
    body.woolColor = body.isBlack ? '#3a3a3a' : woolColors[Math.random() * woolColors.length | 0];
    body.accColor = accColors[Math.random() * accColors.length | 0];
    // Propeller randomisieren
    body.propBladeCount = [2, 2, 2, 3, 3, 4][Math.random() * 6 | 0];
    var propColors = ['#ffd740', '#ff6b6b', '#69db7c', '#74c0fc', '#da77f2', '#ffa94d', '#e8e8e8'];
    body.propBladeColor = propColors[Math.random() * propColors.length | 0];
    body.propHubColor = Math.random() < 0.7 ? '#666666' : darkenColor(body.propBladeColor);
    body.propSize = +(0.7 + Math.random() * 0.6).toFixed(2);
    body.propShape = ['standard', 'standard', 'round', 'slim', 'teardrop'][Math.random() * 5 | 0];
    setSlider('pScale', 'pScaleV', body.scale);
    setSlider('pChub', 'pChubV', body.chub);
    setSlider('pHead', 'pHeadV', body.headMul);
    setSlider('pLegs', 'pLegsV', body.legMul);
    setSlider('pTail', 'pTailV', body.tailSize);
    setSlider('pPropSize', 'pPropSizeV', body.propSize);
    if (blackCb) blackCb.checked = body.isBlack;
    if (accColorEl) accColorEl.value = body.accColor.length === 4 ? body.accColor[0]+body.accColor[1]+body.accColor[1]+body.accColor[2]+body.accColor[2]+body.accColor[3]+body.accColor[3] : body.accColor;
    if (propCountEl) propCountEl.value = body.propBladeCount;
    if (propShapeEl) propShapeEl.value = body.propShape;
    if (propColorEl) propColorEl.value = body.propBladeColor;
    if (propHubColorEl) propHubColorEl.value = body.propHubColor;
    rebuildPreview();
  });

  /* ═══ Tab-Logik ═══ */
  document.querySelectorAll('.umkleide-controls-panel .tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.umkleide-controls-panel .tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.umkleide-controls-panel .tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  /* ═══ Speichern ═══ */
  document.getElementById('btnSave').addEventListener('click', function () {
    fetch('/admin/umkleide/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ config: cfg })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok) {
        // Live-Schafe sofort aktualisieren (neue Schafe nutzen die neue Config)
        window.__sheepConfig = JSON.parse(JSON.stringify(cfg));
        if (typeof showToast === 'function') showToast(data.message, 'success');
        else alert(data.message);
      } else {
        if (typeof showToast === 'function') showToast(data.error || 'Fehler', 'error');
        else alert(data.error || 'Fehler');
      }
    })
    .catch(function () { alert('Netzwerkfehler beim Speichern.'); });
  });

  /* ═══ Zur\u00fccksetzen ═══ */
  document.getElementById('btnReset').addEventListener('click', function () {
    if (!confirm('Alle Accessoire-Einstellungen auf die Standardwerte zur\u00fccksetzen?')) return;
    fetch('/admin/umkleide/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: '{}'
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok) {
        cfg = JSON.parse(JSON.stringify(DEFAULTS));
        // Slider zurücksetzen
        setSlider('hatY', 'hatYV', -8); setSlider('hatX', 'hatXV', 0); setSlider('hatS', 'hatSV', 1.0);
        setSlider('glY', 'glYV', 1.5); setSlider('glX', 'glXV', 0); setSlider('glS', 'glSV', 1.0);
        setSlider('stY', 'stYV', -1); setSlider('stX', 'stXV', 0); setSlider('stS', 'stSV', 1.0);
        setSlider('fEyeY','fEyeYV',3.5); setSlider('fEyeLX','fEyeLXV',2); setSlider('fEyeRX','fEyeRXV',2);
        setSlider('fEarY','fEarYV',-1.5); setSlider('fEarLX','fEarLXV',-2.5); setSlider('fEarRX','fEarRXV',-2.5);
        setSlider('fMouthY','fMouthYV',2);
        // Per-Item-Slider zurücksetzen
        setSlider('hatIdY','hatIdYV',0); setSlider('hatIdX','hatIdXV',0); setSlider('hatIdS','hatIdSV',1);
        setSlider('glIdY','glIdYV',0); setSlider('glIdX','glIdXV',0); setSlider('glIdS','glIdSV',1);
        setSlider('stIdY','stIdYV',0); setSlider('stIdX','stIdXV',0); setSlider('stIdS','stIdSV',1);
        document.getElementById('hatItemSliders').style.display = 'none';
        document.getElementById('glItemSliders').style.display = 'none';
        document.getElementById('stItemSliders').style.display = 'none';
        loadCssSliders();
        // Grids mit Standard-Sheets neu bauen
        buildSpriteGrid('hatGrid', 16, 4, 's-sprite-hat', currentHat, selectHat);
        buildSpriteGrid('glassesGrid', 32, 4, 's-sprite-glasses', currentGlasses, selectGlasses);
        buildSpriteGrid('stacheGrid', 12, 3, 's-sprite-stache', currentStache, selectStache);
        buildSpriteGrid('bodyGrid', 0, 4, 's-sprite-body', currentBody, selectBody);
        buildSpriteGrid('tailGrid', 0, 4, 's-sprite-tail', currentTail, selectTail);
        rebuildPreview();
        if (typeof showToast === 'function') showToast(data.message, 'success');
        else alert(data.message);
      }
    })
    .catch(function () { alert('Netzwerkfehler.'); });
  });

  /* ═══ Einzel-Sprite-Upload ═══ */

  var GRID_REBUILD = {
    spriteHat: function () { buildSpriteGrid('hatGrid', 16, 4, 's-sprite-hat', currentHat, selectHat); },
    spriteGlasses: function () { buildSpriteGrid('glassesGrid', 32, 4, 's-sprite-glasses', currentGlasses, selectGlasses); },
    spriteStache: function () { buildSpriteGrid('stacheGrid', 12, 3, 's-sprite-stache', currentStache, selectStache); },
    spriteBody: function () { buildSpriteGrid('bodyGrid', 0, 4, 's-sprite-body', currentBody, selectBody); },
    spriteTail: function () { buildSpriteGrid('tailGrid', 0, 4, 's-sprite-tail', currentTail, selectTail); }
  };

  var slotFileInput = document.getElementById('slotSpriteFile');
  var pendingUploadCategory = null;
  var pendingUploadIndex = null;

  function triggerSlotUpload(category, slotIndex) {
    pendingUploadCategory = category;
    pendingUploadIndex = slotIndex;
    slotFileInput.value = '';
    slotFileInput.click();
  }

  slotFileInput.addEventListener('change', function () {
    if (!slotFileInput.files.length || pendingUploadCategory == null) return;
    var fd = new FormData();
    fd.append('category', pendingUploadCategory);
    fd.append('slotIndex', pendingUploadIndex);
    fd.append('csrfToken', csrfToken);
    fd.append('sprite', slotFileInput.files[0]);
    fetch('/admin/umkleide/upload-slot-sprite', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          var cat = pendingUploadCategory;
          var idx = pendingUploadIndex;
          var defaultCount = DEFAULT_SLOT_COUNTS[cat] || 0;
          if (!cfg[cat]) cfg[cat] = {};
          if (idx < defaultCount) {
            if (!cfg[cat].items) cfg[cat].items = {};
            if (!cfg[cat].items[idx]) cfg[cat].items[idx] = { dY: 0, dX: 0, dS: 1 };
            cfg[cat].items[idx].customImage = data.url;
          } else {
            if (!cfg[cat].customSlots) cfg[cat].customSlots = [];
            var cs = cfg[cat].customSlots[idx - defaultCount];
            if (cs) cs.image = data.url;
          }
          if (GRID_REBUILD[cat]) GRID_REBUILD[cat]();
          rebuildPreview();
          if (typeof showToast === 'function') showToast(data.message, 'success');
        } else {
          if (typeof showToast === 'function') showToast(data.error || 'Fehler', 'error');
          else alert(data.error || 'Fehler');
        }
      })
      .catch(function () { alert('Netzwerkfehler beim Upload.'); })
      .finally(function () { slotFileInput.value = ''; pendingUploadCategory = null; pendingUploadIndex = null; });
  });

  function addCustomSlot(category) {
    fetch('/admin/umkleide/add-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ category: category })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok) {
        if (!cfg[category]) cfg[category] = {};
        if (!cfg[category].customSlots) cfg[category].customSlots = [];
        cfg[category].customSlots.push({ image: null, dY: 0, dX: 0, dS: 1 });
        if (GRID_REBUILD[category]) GRID_REBUILD[category]();
        if (typeof showToast === 'function') showToast(data.message, 'success');
      }
    })
    .catch(function () { alert('Netzwerkfehler.'); });
  }

  function removeCustomSlot(category, slotIndex) {
    fetch('/admin/umkleide/remove-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ category: category, slotIndex: slotIndex })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok) {
        var defaultCount = DEFAULT_SLOT_COUNTS[category] || 0;
        if (cfg[category] && cfg[category].customSlots) {
          cfg[category].customSlots.splice(slotIndex - defaultCount, 1);
        }
        // Selektion anpassen wenn nötig
        var sel = category === 'spriteHat' ? currentHat : category === 'spriteGlasses' ? currentGlasses : currentStache;
        if (sel === slotIndex) {
          if (category === 'spriteHat') currentHat = -1;
          else if (category === 'spriteGlasses') currentGlasses = -1;
          else currentStache = -1;
        } else if (sel > slotIndex) {
          if (category === 'spriteHat') currentHat--;
          else if (category === 'spriteGlasses') currentGlasses--;
          else currentStache--;
        }
        if (GRID_REBUILD[category]) GRID_REBUILD[category]();
        rebuildPreview();
        if (typeof showToast === 'function') showToast(data.message, 'success');
      }
    })
    .catch(function () { alert('Netzwerkfehler.'); });
  }

  function removeSlotSprite(category, slotIndex) {
    fetch('/admin/umkleide/remove-slot-sprite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ category: category, slotIndex: slotIndex })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok) {
        if (cfg[category] && cfg[category].items && cfg[category].items[slotIndex]) {
          delete cfg[category].items[slotIndex].customImage;
        }
        if (GRID_REBUILD[category]) GRID_REBUILD[category]();
        rebuildPreview();
        if (typeof showToast === 'function') showToast(data.message, 'success');
      }
    })
    .catch(function () { alert('Netzwerkfehler.'); });
  }

  /* ═══ Export / Import ═══ */
  document.getElementById('btnExport').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sheep-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('btnImport').addEventListener('click', function () {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var imported = JSON.parse(e.target.result);
        if (typeof imported !== 'object' || !imported) throw new Error('Kein Objekt');
        // Merge in cfg
        if (imported.spriteHat) Object.assign(cfg.spriteHat, imported.spriteHat);
        if (imported.spriteGlasses) Object.assign(cfg.spriteGlasses, imported.spriteGlasses);
        if (imported.spriteStache) Object.assign(cfg.spriteStache, imported.spriteStache);
        if (imported.cssAccessories) {
          for (var k in imported.cssAccessories) {
            if (cfg.cssAccessories[k]) Object.assign(cfg.cssAccessories[k], imported.cssAccessories[k]);
          }
        }
        if (imported.face) Object.assign(cfg.face, imported.face);
        loadConfigIntoUI();
        if (typeof showToast === 'function') showToast('Config importiert \u2014 zum \u00dcbernehmen "Konfiguration speichern" klicken.', 'success');
      } catch (err) {
        if (typeof showToast === 'function') showToast('Ung\u00fcltige JSON-Datei: ' + err.message, 'error');
        else alert('Ung\u00fcltige JSON-Datei: ' + err.message);
      }
    };
    reader.readAsText(file);
    this.value = '';
  });

  /* ═══ Init ═══ */
  function loadConfigIntoUI() {
    // Slider mit aktuellen cfg-Werten befüllen
    setSlider('hatY', 'hatYV', cfg.spriteHat.offsetY);
    setSlider('hatX', 'hatXV', cfg.spriteHat.offsetX);
    setSlider('hatS', 'hatSV', cfg.spriteHat.scale);
    setSlider('glY', 'glYV', cfg.spriteGlasses.offsetY);
    setSlider('glX', 'glXV', cfg.spriteGlasses.offsetX);
    setSlider('glS', 'glSV', cfg.spriteGlasses.scale);
    setSlider('stY', 'stYV', cfg.spriteStache.offsetY);
    setSlider('stX', 'stXV', cfg.spriteStache.offsetX);
    setSlider('stS', 'stSV', cfg.spriteStache.scale);
    setSlider('bodyY', 'bodyYV', cfg.spriteBody.offsetY);
    setSlider('bodyX', 'bodyXV', cfg.spriteBody.offsetX);
    setSlider('bodyS', 'bodySV', cfg.spriteBody.scale);
    setSlider('tailY', 'tailYV', cfg.spriteTail.offsetY);
    setSlider('tailX', 'tailXV', cfg.spriteTail.offsetX);
    setSlider('tailS', 'tailSV', cfg.spriteTail.scale);
    setSlider('fEyeY', 'fEyeYV', cfg.face.eyeY);
    setSlider('fEyeLX', 'fEyeLXV', cfg.face.eyeLeftX);
    setSlider('fEyeRX', 'fEyeRXV', cfg.face.eyeRightX);
    setSlider('fEarY', 'fEarYV', cfg.face.earY);
    setSlider('fEarLX', 'fEarLXV', cfg.face.earLeftX);
    setSlider('fEarRX', 'fEarRXV', cfg.face.earRightX);
    setSlider('fMouthY', 'fMouthYV', cfg.face.mouthY);

    // Grids neu bauen
    buildSpriteGrid('hatGrid', 16, 4, 's-sprite-hat', currentHat, selectHat);
    buildSpriteGrid('glassesGrid', 32, 4, 's-sprite-glasses', currentGlasses, selectGlasses);
    buildSpriteGrid('stacheGrid', 12, 3, 's-sprite-stache', currentStache, selectStache);
    buildSpriteGrid('bodyGrid', 0, 4, 's-sprite-body', currentBody, selectBody);
    buildSpriteGrid('tailGrid', 0, 4, 's-sprite-tail', currentTail, selectTail);
    buildCssButtons();
    loadCssSliders();

    // Per-Item-Slider
    if (currentHat >= 0) showItemSliders('hatItemSliders', 'hatItemLabel', currentHat, cfg.spriteHat, 'hatIdY', 'hatIdYV', 'hatIdX', 'hatIdXV', 'hatIdS', 'hatIdSV', 'spriteHat');
    if (currentGlasses >= 0) showItemSliders('glItemSliders', 'glItemLabel', currentGlasses, cfg.spriteGlasses, 'glIdY', 'glIdYV', 'glIdX', 'glIdXV', 'glIdS', 'glIdSV', 'spriteGlasses');
    if (currentStache >= 0) showItemSliders('stItemSliders', 'stItemLabel', currentStache, cfg.spriteStache, 'stIdY', 'stIdYV', 'stIdX', 'stIdXV', 'stIdS', 'stIdSV', 'spriteStache');
    if (currentBody >= 0) showItemSliders('bodyItemSliders', 'bodyItemLabel', currentBody, cfg.spriteBody, 'bodyIdY', 'bodyIdYV', 'bodyIdX', 'bodyIdXV', 'bodyIdS', 'bodyIdSV', 'spriteBody');
    if (currentTail >= 0) showItemSliders('tailItemSliders', 'tailItemLabel', currentTail, cfg.spriteTail, 'tailIdY', 'tailIdYV', 'tailIdX', 'tailIdXV', 'tailIdS', 'tailIdSV', 'spriteTail');

    // Preview
    rebuildPreview();
  }

  // Initiale UI laden
  loadConfigIntoUI();

  // Vorhängeschloss-Toggle für globale Slider
  document.querySelectorAll('.umkleide-lock-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrapper = btn.closest('.umkleide-sliders');
      var locked = wrapper.classList.contains('umkleide-global-locked');
      if (locked) {
        wrapper.classList.remove('umkleide-global-locked');
        wrapper.classList.add('umkleide-global-unlocked');
        btn.innerHTML = '&#128275;'; // 🔓
        btn.title = 'Sperren um versehentliches Verstellen zu verhindern';
      } else {
        wrapper.classList.remove('umkleide-global-unlocked');
        wrapper.classList.add('umkleide-global-locked');
        btn.innerHTML = '&#128274;'; // 🔒
        btn.title = 'Entsperren um globale Werte zu ändern';
      }
    });
  });

})();
