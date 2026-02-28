// Rechtsklick blockieren (außer auf Inputs, Textareas und Links)
document.addEventListener("contextmenu", function(e) {
  var tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.closest("a")) return;
  e.preventDefault();
});

// Global: Live-Status in Navigation anzeigen
(function initNavLiveIndicator() {
  var btn = document.getElementById("navLiveBtn");
  var btnMobile = document.getElementById("navLiveBtnMobile");
  if (!btn && !btnMobile) return;

  function hasActiveLiveState() {
    try {
      for (var i = 0; i < sessionStorage.length; i++) {
        var key = sessionStorage.key(i);
        if (key && key.indexOf("liveState_") === 0) {
          var raw = sessionStorage.getItem(key);
          if (raw) {
            var state = JSON.parse(raw);
            if (state && state.version === 1) return true;
          }
        }
      }
    } catch(e) {}
    return false;
  }

  function updateNavLive() {
    var active = hasActiveLiveState();
    if (btn) btn.style.display = active ? "" : "none";
    if (btnMobile) btnMobile.style.display = active ? "" : "none";
  }

  updateNavLive();

  // Re-check when sessionStorage changes (from other tabs or after live mode closes)
  window.addEventListener("storage", updateNavLive);

  // Re-check periodically for same-tab changes
  setInterval(updateNavLive, 2000);
})();

// Mobile menu toggle
const menuToggle = document.getElementById("menuToggle");
const mobileNav = document.getElementById("mobileNav");

if (menuToggle && mobileNav) {
  menuToggle.addEventListener("click", () => {
    menuToggle.classList.toggle("active");
    mobileNav.classList.toggle("active");
  });

  // Close menu when clicking a link
  mobileNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menuToggle.classList.remove("active");
      mobileNav.classList.remove("active");
    });
  });
}

// Toast notifications
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ"
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.success}</span>
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// Close toast on click
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("toast-close")) {
    e.target.closest(".toast").remove();
  }
});

// Confirmation dialogs
function confirmAction(message, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";
  overlay.innerHTML = `
    <div class="modal">
      <h3>Bestätigung</h3>
      <p>${message}</p>
      <div class="modal-actions">
        <button class="btn-secondary" data-action="cancel">Abbrechen</button>
        <button class="btn-danger" data-action="confirm">Bestätigen</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.dataset.action === "cancel") {
      overlay.remove();
    } else if (e.target.dataset.action === "confirm") {
      overlay.remove();
      onConfirm();
    }
  });
}

// Attach confirmation to dangerous forms
document.querySelectorAll("[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = form.dataset.confirm || "Bist du sicher?";
    confirmAction(message, () => form.submit());
  });
});

// Gameday navigation (Prev/Next + Custom Dropdown)
const gamedayToggle = document.getElementById("gamedayToggle");
const gamedayDropdown = document.getElementById("gamedayDropdown");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");

if (gamedayToggle && gamedayDropdown) {
  const options = Array.from(gamedayDropdown.querySelectorAll(".gameday-picker-option"));
  let currentIndex = options.findIndex(o => o.classList.contains("is-active"));
  if (currentIndex < 0) currentIndex = options.length - 1;

  function updateNavButtons() {
    if (btnPrev) btnPrev.disabled = currentIndex === 0;
    if (btnNext) btnNext.disabled = currentIndex === options.length - 1;
  }

  function navigateTo(val) {
    window.location = "/kegelkladde?gamedayId=" + encodeURIComponent(val);
  }

  gamedayToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    gamedayDropdown.classList.toggle("is-open");
    // Scroll active option into view
    const active = gamedayDropdown.querySelector(".is-active");
    if (active) active.scrollIntoView({ block: "nearest" });
  });

  gamedayDropdown.addEventListener("click", (e) => {
    const opt = e.target.closest(".gameday-picker-option");
    if (opt) navigateTo(opt.dataset.value);
  });

  // Close on outside click
  document.addEventListener("click", () => gamedayDropdown.classList.remove("is-open"));
  gamedayDropdown.addEventListener("click", (e) => e.stopPropagation());

  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (currentIndex > 0) {
        currentIndex--;
        navigateTo(options[currentIndex].dataset.value);
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (currentIndex < options.length - 1) {
        currentIndex++;
        navigateTo(options[currentIndex].dataset.value);
      }
    });
  }

  updateNavButtons();
}

// Member order drag and drop
const orderList = document.getElementById("orderList");
const orderForm = document.getElementById("orderForm");
const memberOrderInput = document.getElementById("memberOrder");

if (orderList && orderForm && memberOrderInput) {
  orderList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const item = button.closest("li");
    if (!item) return;

    if (button.classList.contains("move-up") && item.previousElementSibling) {
      item.parentNode.insertBefore(item, item.previousElementSibling);
    }

    if (button.classList.contains("move-down") && item.nextElementSibling) {
      item.parentNode.insertBefore(item.nextElementSibling, item);
    }
  });

  orderForm.addEventListener("submit", () => {
    const ids = Array.from(orderList.querySelectorAll("li")).map((li) => li.dataset.id);
    memberOrderInput.value = ids.join(",");
  });
}

// Cost recalculation for 9er/Kranz/Triclops
function formatEuroCost(value) {
  return value.toFixed(2).replace(".", ",");
}

function recalcCosts() {
  const rows = document.querySelectorAll(".kladde-table tbody tr");
  let totalAlle9 = 0, totalKranz = 0, totalTriclops = 0;

  rows.forEach((row) => {
    const cb = row.querySelector("[data-present]");
    if (cb && cb.checked) {
      totalAlle9 += Number(row.querySelector('[data-marker-input="alle9"]')?.value || 0);
      totalKranz += Number(row.querySelector('[data-marker-input="kranz"]')?.value || 0);
      totalTriclops += Number(row.querySelector('[data-marker-input="triclops"]')?.value || 0);
    }
  });

  const totals = { alle9: totalAlle9, kranz: totalKranz, triclops: totalTriclops };

  rows.forEach((row) => {
    const cb = row.querySelector("[data-present]");
    const isPresent = cb && cb.checked;

    // Pudel: Spieler zahlt selbst 0,10€ pro Pudel
    const myPudel = Number(row.querySelector('[data-marker-input="pudel"]')?.value || 0);
    const costPudel = isPresent ? myPudel * 0.10 : 0;
    const pudelEl = row.querySelector('[data-cost-type="pudel"]');
    if (pudelEl) pudelEl.textContent = costPudel > 0 ? formatEuroCost(costPudel) + " €" : "";

    // 9er/Kranz/Triclops: alle anderen Anwesenden zahlen 0,10€
    let costOthers = 0;
    ["alle9", "kranz", "triclops"].forEach((type) => {
      const myVal = Number(row.querySelector(`[data-marker-input="${type}"]`)?.value || 0);
      const cost = isPresent ? (totals[type] - myVal) * 0.10 : 0;
      costOthers += cost;
      const el = row.querySelector(`[data-cost-type="${type}"]`);
      if (el) el.textContent = cost > 0 ? formatEuroCost(cost) + " €" : "";
    });

    // Game fields (V+A, Monte, Aussteigen, 6-Tage)
    const va = Number(row.querySelector('[name^="va_"]')?.value || 0) / 10;
    const monte = Number(row.querySelector('[name^="monte_"]')?.value || 0) / 10;
    const aussteigen = Number(row.querySelector('[name^="aussteigen_"]')?.value || 0) / 10;
    const sechs_tage = Number(row.querySelector('[name^="sechs_tage_"]')?.value || 0) / 10;
    const gameCosts = isPresent ? va + monte + aussteigen + sechs_tage : 0;

    // Custom game fields
    let customGameTotal = 0;
    if (isPresent) {
      row.querySelectorAll("[data-custom-game-field]").forEach((input) => {
        customGameTotal += Number(input.value || 0) / 10;
      });
    }

    // Zu zahlen / Rest berechnen
    const contribution = 4.00;
    const penalties = Number(row.querySelector('[name^="penalties_"]')?.value || 0);
    const carryoverEl = row.querySelector("[data-carryover]");
    const carryover = Number(carryoverEl?.dataset.value || carryoverEl?.value || 0);
    const paidField = row.querySelector("[data-paid-field]");
    const paidEl = row.querySelector("[data-paid]");
    const paid = paidField ? Number(paidField.value || 0) : Number(paidEl?.dataset.value || paidEl?.value || 0);
    const toPay = kladdeStatus === 1
      ? (isPresent ? costPudel + costOthers + gameCosts + customGameTotal : 0)
      : (isPresent ? contribution + penalties + costPudel + costOthers + gameCosts + customGameTotal + carryover : contribution + penalties + carryover);
    const rest = toPay - paid;

    // Spieltag gesamt (reine Spiel- + Bilderkosten)
    const gameTotalEl = row.querySelector("[data-game-total]");
    if (gameTotalEl) {
      const gameTotal = isPresent ? costPudel + costOthers + gameCosts + customGameTotal : 0;
      gameTotalEl.textContent = formatEuroCost(gameTotal) + " €";
    }

    const toPayEl = row.querySelector("[data-topay]");
    if (toPayEl) toPayEl.textContent = formatEuroCost(toPay) + " €";

    const restEl = row.querySelector("[data-rest]");
    if (restEl) {
      restEl.textContent = formatEuroCost(rest) + " €";
      restEl.style.color = rest > 0 ? "var(--error)" : rest < 0 ? "var(--success)" : "";
    }
  });

  updateCompactCells();
  updateMontePoints();
  updateAussteigenMedals();
  updateGameWinners();

  // Sync mobile "nach Spiel" display if active
  if (typeof window._syncMobileDisplay === "function") window._syncMobileDisplay();
}

// Monte-Liste Punkte (10, 6, 4, 3, 2, 1 + Extrapunkt)
function updateMontePoints() {
  const table = document.querySelector(".kladde-table:not(.kladde-preview)");
  if (!table) return;
  const pointScale = [10, 6, 4, 3, 2, 1];
  const MONTE_CUTOFF_ZEHNTEL = 20; // 2,00 € = keine Platz-Punkte
  const rows = table.querySelectorAll("tbody tr[data-member-id]");

  const entries = [];
  rows.forEach(row => {
    const td = row.querySelector('td[data-game-key="monte"]');
    if (!td) return;
    const isActive = !row.classList.contains("row-inactive");
    const isStruck = td.classList.contains("cell-struck");
    const input = td.querySelector(".game-col-input");
    const value = Number(input?.value || 0);
    const tbInput = row.querySelector('[data-tiebreak="monte"]');
    const tiebreak = Number(tbInput?.value || 0);
    const extraRadio = row.querySelector(".monte-extra-radio");
    const hasExtra = extraRadio?.checked || false;
    entries.push({ td, row, value, tiebreak, hasExtra, isActive, isStruck });
  });

  const hasValues = entries.some(e => e.isActive && !e.isStruck && e.value > 0);

  // Rank eligible (active + not struck + value > 0 + below cutoff) players: lowest value = best
  // value === 0 means "nicht geworfen" = zahlend/busted
  const eligible = entries
    .filter(e => e.isActive && !e.isStruck && e.value > 0 && e.value < MONTE_CUTOFF_ZEHNTEL)
    .sort((a, b) => a.value - b.value || a.tiebreak - b.tiebreak);

  const ptsMap = new Map();
  // Detect ties: group by value, groups with >1 member are tied
  const tiedSet = new Set();
  if (hasValues) {
    eligible.forEach((e, i) => {
      const base = i < pointScale.length ? pointScale[i] : 0;
      ptsMap.set(e.td, base + (e.hasExtra ? 1 : 0));
    });

    // Build value groups for tie detection
    const valueGroups = new Map();
    eligible.forEach(e => {
      const arr = valueGroups.get(e.value) || [];
      arr.push(e);
      valueGroups.set(e.value, arr);
    });
    valueGroups.forEach(group => {
      if (group.length > 1) group.forEach(e => tiedSet.add(e.td));
    });

    // Extrapunkt for busted players (0 or >= 2,00 €) who have the extra radio
    entries.forEach(e => {
      if (e.isActive && !e.isStruck && (e.value === 0 || e.value >= MONTE_CUTOFF_ZEHNTEL) && e.hasExtra) {
        ptsMap.set(e.td, 1);
      }
    });
  }

  // Update DOM
  entries.forEach(e => {
    let el = e.td.querySelector(".monte-pts");
    const pts = ptsMap.get(e.td);
    const isTied = tiedSet.has(e.td);
    if (pts != null && pts > 0) {
      if (!el) {
        el = document.createElement("span");
        el.className = "monte-pts";
        const radio = e.td.querySelector(".monte-extra-radio");
        if (radio) {
          let wrap = radio.closest(".monte-extra-wrap");
          if (!wrap) {
            wrap = document.createElement("span");
            wrap.className = "monte-extra-wrap";
            radio.before(wrap);
            wrap.appendChild(radio);
          }
          wrap.prepend(el);
        } else {
          const mi = e.td.querySelector(".money-inline");
          if (mi) mi.append(el);
        }
      }
      el.textContent = pts;
      el.classList.toggle("monte-pts-tie", isTied);
      el.onclick = isTied ? () => cycleMonteTiebreak(e.td) : null;
    } else if (el) {
      el.remove();
    }
  });
}

// Cycle Monte tiebreak: swap clicked player one position up within their tie group
function cycleMonteTiebreak(clickedTd) {
  const table = document.querySelector(".kladde-table:not(.kladde-preview)");
  if (!table) return;
  const MONTE_CUTOFF_ZEHNTEL = 20;

  // Find clicked entry's value
  const clickedRow = clickedTd.closest("tr[data-member-id]");
  if (!clickedRow) return;
  const clickedInput = clickedTd.querySelector(".game-col-input");
  const clickedValue = Number(clickedInput?.value || 0);

  // Build list of all active, non-struck, below-cutoff entries with same value
  const rows = table.querySelectorAll("tbody tr[data-member-id]");
  const group = [];
  rows.forEach(row => {
    const td = row.querySelector('td[data-game-key="monte"]');
    if (!td) return;
    const isActive = !row.classList.contains("row-inactive");
    const isStruck = td.classList.contains("cell-struck");
    const input = td.querySelector(".game-col-input");
    const value = Number(input?.value || 0);
    if (!isActive || isStruck || value === 0 || value >= MONTE_CUTOFF_ZEHNTEL) return;
    if (value !== clickedValue) return;
    const tbInput = row.querySelector('[data-tiebreak="monte"]');
    const tiebreak = Number(tbInput?.value || 0);
    group.push({ row, td, tbInput, tiebreak });
  });

  if (group.length < 2) return;

  // Sort group by tiebreak ASC
  group.sort((a, b) => a.tiebreak - b.tiebreak);

  // If all tiebreaks are the same (e.g. all 0), assign sequential values
  const allSame = group.every(g => g.tiebreak === group[0].tiebreak);
  if (allSame) {
    group.forEach((g, i) => {
      g.tiebreak = i;
      if (g.tbInput) g.tbInput.value = i;
    });
  }

  // Find clicked player's position in sorted group
  const clickedIdx = group.findIndex(g => g.row === clickedRow);
  if (clickedIdx <= 0) return; // already first or not found

  // Swap tiebreak with the one above
  const above = group[clickedIdx - 1];
  const current = group[clickedIdx];
  const tmpTb = above.tiebreak;
  above.tiebreak = current.tiebreak;
  current.tiebreak = tmpTb;
  if (above.tbInput) above.tbInput.value = above.tiebreak;
  if (current.tbInput) current.tbInput.value = current.tiebreak;

  // Recalc and auto-save both rows
  recalcCosts();
  autoSaveRow(above.row);
  autoSaveRow(current.row);
}

// Aussteigen-Rang Anzeige (Gold=1., Silber=2.)
function updateAussteigenMedals() {
  const table = document.querySelector(".kladde-table:not(.kladde-preview)");
  if (!table) return;
  const rows = table.querySelectorAll("tbody tr[data-member-id]");

  const entries = [];
  rows.forEach(row => {
    const td = row.querySelector('td[data-game-key="aussteigen"]');
    if (!td) return;
    const isActive = !row.classList.contains("row-inactive");
    const isStruck = td.classList.contains("cell-struck");
    const input = td.querySelector(".game-col-input");
    const value = Number(input?.value || 0);
    const tbInput = row.querySelector('[data-tiebreak="aussteigen"]');
    const tiebreak = Number(tbInput?.value || 0);
    entries.push({ td, row, value, tiebreak, isActive, isStruck });
  });

  const eligible = entries.filter(e => e.isActive && !e.isStruck);
  const hasValues = eligible.some(e => e.value > 0);

  const rankMap = new Map(); // td -> { rank, tied }
  const tiedSet = new Set();

  if (hasValues) {
    const sorted = [...eligible].sort((a, b) => a.value - b.value || a.tiebreak - b.tiebreak);

    // Build value groups
    const valueGroups = new Map();
    sorted.forEach(e => {
      const arr = valueGroups.get(e.value) || [];
      arr.push(e);
      valueGroups.set(e.value, arr);
    });

    // Assign ranks, detect ties
    let rank = 1;
    for (const val of [...new Set(sorted.map(e => e.value))]) {
      const group = valueGroups.get(val);
      const isTied = group.length > 1;
      if (isTied) group.forEach(e => tiedSet.add(e.td));
      group.forEach((e, i) => {
        rankMap.set(e.td, rank + i);
      });
      rank += group.length;
    }
  }

  // Update DOM: show rank badge for gold (1), silver (2), and all tied players
  entries.forEach(e => {
    let el = e.td.querySelector(".aussteigen-medal");
    const rank = rankMap.get(e.td);
    const isTied = tiedSet.has(e.td);
    const show = rank != null && (rank <= 2 || isTied);
    if (show) {
      if (!el) {
        el = document.createElement("span");
        el.className = "aussteigen-medal";
        const mi = e.td.querySelector(".money-inline");
        if (mi) mi.append(el);
      }
      el.textContent = rank;
      el.className = "aussteigen-medal";
      if (rank === 1) el.classList.add("aussteigen-gold");
      else if (rank === 2) el.classList.add("aussteigen-silver");
      el.classList.toggle("aussteigen-medal-tie", isTied);
      el.onclick = isTied ? () => cycleAussteigenTiebreak(e.td) : null;
    } else if (el) {
      el.remove();
    }
  });
}

// Cycle Aussteigen tiebreak: swap clicked player one position up within their tie group
function cycleAussteigenTiebreak(clickedTd) {
  const table = document.querySelector(".kladde-table:not(.kladde-preview)");
  if (!table) return;

  const clickedRow = clickedTd.closest("tr[data-member-id]");
  if (!clickedRow) return;
  const clickedInput = clickedTd.querySelector(".game-col-input");
  const clickedValue = Number(clickedInput?.value || 0);

  const rows = table.querySelectorAll("tbody tr[data-member-id]");
  const group = [];
  rows.forEach(row => {
    const td = row.querySelector('td[data-game-key="aussteigen"]');
    if (!td) return;
    const isActive = !row.classList.contains("row-inactive");
    const isStruck = td.classList.contains("cell-struck");
    const input = td.querySelector(".game-col-input");
    const value = Number(input?.value || 0);
    if (!isActive || isStruck) return;
    if (value !== clickedValue) return;
    const tbInput = row.querySelector('[data-tiebreak="aussteigen"]');
    const tiebreak = Number(tbInput?.value || 0);
    group.push({ row, td, tbInput, tiebreak });
  });

  if (group.length < 2) return;

  group.sort((a, b) => a.tiebreak - b.tiebreak);

  const allSame = group.every(g => g.tiebreak === group[0].tiebreak);
  if (allSame) {
    group.forEach((g, i) => {
      g.tiebreak = i;
      if (g.tbInput) g.tbInput.value = i;
    });
  }

  const clickedIdx = group.findIndex(g => g.row === clickedRow);
  if (clickedIdx <= 0) return;

  const above = group[clickedIdx - 1];
  const current = group[clickedIdx];
  const tmpTb = above.tiebreak;
  above.tiebreak = current.tiebreak;
  current.tiebreak = tmpTb;
  if (above.tbInput) above.tbInput.value = above.tiebreak;
  if (current.tbInput) current.tbInput.value = current.tiebreak;

  recalcCosts();
  autoSaveRow(above.row);
  autoSaveRow(current.row);
}

// Lorbeerkranz: highlight lowest value per game column
function updateGameWinners() {
  const table = document.querySelector(".kladde-table:not(.kladde-preview)");
  if (!table) return;

  // Collect all unique game keys from header
  const gameKeys = new Set();
  table.querySelectorAll("tbody tr:first-child td[data-game-key]").forEach(td => {
    gameKeys.add(td.getAttribute("data-game-key"));
  });
  // Fallback: scan all rows for game keys
  if (gameKeys.size === 0) {
    table.querySelectorAll("tbody td[data-game-key]").forEach(td => {
      gameKeys.add(td.getAttribute("data-game-key"));
    });
  }

  const rows = table.querySelectorAll("tbody tr[data-member-id]");

  gameKeys.forEach(key => {
    const cells = [];
    rows.forEach(row => {
      const td = row.querySelector(`td[data-game-key="${key}"]`);
      if (!td) return;
      const isActive = !row.classList.contains("row-inactive");
      const isStruck = td.classList.contains("cell-struck");
      const input = td.querySelector(".game-col-input");
      const value = Number(input?.value || 0);
      cells.push({ td, value, eligible: isActive && !isStruck });
    });

    const eligible = cells.filter(c => c.eligible);
    // Spiel wurde gespielt wenn mindestens ein Wert > 0
    const gamePlayed = eligible.some(c => c.value > 0);
    let minVal = Infinity;
    if (gamePlayed) {
      minVal = Math.min(...eligible.map(c => c.value));
    }

    cells.forEach(c => {
      c.td.classList.toggle("game-winner", gamePlayed && c.eligible && c.value === minVal);
    });
  });
}

// Compact cell mode: display values as text, edit on hover
function initCompactMode() {
  document.querySelectorAll(".kladde-table .money-inline .mini-number").forEach((input) => {
    if (input.hasAttribute("data-paid-field")) return;
    const display = document.createElement("span");
    display.className = "field-display";
    const isGameField = input.hasAttribute("data-game-field") || input.hasAttribute("data-custom-game-field");
    display.textContent = isGameField ? String(Number(input.value) || 0) : formatEuroCost(Number(input.value) || 0);
    input.after(display);
    const td = input.closest("td");
    if (td) td.classList.add("has-compact");
  });
}

function updateCompactCells() {
  // Per game column: if any active player has a value > 0, show 0s too
  const gameKeysWithValues = new Set();
  document.querySelectorAll('.kladde-table tbody tr:not(.row-inactive) td[data-game-key] .mini-number').forEach(inp => {
    if (Number(inp.value) > 0) {
      const td = inp.closest("td[data-game-key]");
      if (td) gameKeysWithValues.add(td.dataset.gameKey);
    }
  });

  // Update display spans for money inputs
  document.querySelectorAll(".kladde-table td.has-compact").forEach((td) => {
    const input = td.querySelector(".mini-number");
    const display = td.querySelector(".field-display");
    if (input && display) {
      const val = Number(input.value) || 0;
      const isGameField = input.hasAttribute("data-game-field") || input.hasAttribute("data-custom-game-field");
      display.textContent = isGameField ? String(val) : formatEuroCost(val);
      const alwaysEdit = input.hasAttribute("data-always-edit");
      const gameKey = td.dataset.gameKey;
      const gameActive = gameKey && gameKeysWithValues.has(gameKey);
      td.classList.toggle("cell-empty", val === 0 && !alwaysEdit && !gameActive);
    }
  });

  // Update marker cells empty state + strip visibility
  document.querySelectorAll(".kladde-table .marker-controls").forEach((controls) => {
    const td = controls.closest("td");
    if (!td) return;
    const row = td.closest("tr");
    if (row && row.classList.contains("row-inactive")) return;
    const input = controls.querySelector("[data-marker-input]");
    const cost = td.querySelector(".marker-cost");
    const strip = controls.querySelector(".marker-strip");
    const val = Number(input?.value || 0);
    const costText = cost?.textContent?.trim() || "";
    td.classList.toggle("cell-empty", val === 0 && !costText);
    if (strip) strip.style.visibility = val === 0 ? "hidden" : "";
  });
}

// Marker controls for alle9 and kranz
function renderMarkers(displayEl, value) {
  const safe = Math.max(0, Math.min(999, value || 0));
  const fives = Math.floor(safe / 5);
  const rest = safe % 5;
  let html = "";
  for (let i = 0; i < fives; i++) {
    html += '<span class="tally-five">||||</span>';
    if ((i + 1) % 2 === 0 && (i + 1 < fives || rest > 0)) html += '<span class="tally-break"></span>';
  }
  if (rest > 0) html += "|".repeat(rest);
  displayEl.innerHTML = html;
}

// --- Gag Animations ---
function gagPudel(anchor) {
  const texts = ["Pudel!", "Nein!", "Uff!", "Oha!", "Mist!"];
  const cell = anchor.closest("td") || anchor;

  // 1) Kurzes Wackeln der Zeile
  const row = cell.closest("tr");
  if (row && !row.classList.contains("gag-shake")) {
    row.classList.add("gag-shake");
    row.addEventListener("animationend", () => row.classList.remove("gag-shake"), { once: true });
  }

  // 2) Roter Flash auf der Zelle
  cell.style.position = "relative";
  const flash = document.createElement("span");
  flash.className = "gag-cell-flash";
  cell.appendChild(flash);
  flash.addEventListener("animationend", () => flash.remove());

  // 3) Text-Bubble poppt hoch (fixed, damit kein overflow clippt)
  const rect = cell.getBoundingClientRect();
  const el = document.createElement("span");
  el.className = "gag-bubble";
  el.textContent = texts[Math.floor(Math.random() * texts.length)];
  el.style.left = (rect.left + rect.width / 2) + "px";
  el.style.top = rect.top + "px";
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

function gagConfetti(anchor) {
  const colors = ["#2f8f6d", "#e8d09f", "#ffffff", "#20684f", "#ffd700"];
  const cell = anchor.closest("td") || anchor;
  const rect = cell.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement("div");
    p.className = "gag-confetti";
    p.style.left = cx + "px";
    p.style.top = cy + "px";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.setProperty("--dx", (Math.random() - 0.5) * 140 + "px");
    p.style.setProperty("--dy", -(Math.random() * 60 + 40) + "px");
    p.style.setProperty("--r1", Math.floor(Math.random() * 360) + "deg");
    p.style.setProperty("--wobble", (Math.random() * 30 + 10) * (Math.random() < 0.5 ? -1 : 1) + "px");
    p.style.setProperty("--t-burst", (Math.random() * 0.2 + 0.4) + "s");
    p.style.setProperty("--t-drift", (Math.random() * 1.5 + 2.5) + "s");
    p.style.width = (Math.random() * 6 + 3) + "px";
    p.style.height = (Math.random() * 8 + 4) + "px";
    document.body.appendChild(p);
    p.addEventListener("animationend", (e) => { if (e.animationName === "gagDrift") p.remove(); });
  }
}

// Warmup: force browser to compile gag animation keyframes
(function gagWarmup() {
  const offscreen = document.createElement("div");
  offscreen.style.cssText = "position:fixed;left:-9999px;top:-9999px;pointer-events:none;opacity:0;";
  document.body.appendChild(offscreen);

  // gag-shake
  const shake = document.createElement("div");
  shake.className = "gag-shake";
  offscreen.appendChild(shake);

  // gag-cell-flash
  const flash = document.createElement("span");
  flash.className = "gag-cell-flash";
  offscreen.appendChild(flash);

  // gag-bubble
  const bubble = document.createElement("span");
  bubble.className = "gag-bubble";
  offscreen.appendChild(bubble);

  // gag-confetti (with CSS vars)
  const conf = document.createElement("div");
  conf.className = "gag-confetti";
  conf.style.setProperty("--dx", "10px");
  conf.style.setProperty("--dy", "-10px");
  conf.style.setProperty("--r1", "45deg");
  conf.style.setProperty("--wobble", "5px");
  conf.style.setProperty("--t-burst", "0.4s");
  conf.style.setProperty("--t-drift", "2.5s");
  offscreen.appendChild(conf);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => offscreen.remove());
  });
})();

document.querySelectorAll(".marker-controls").forEach((controlsEl) => {
  controlsEl.addEventListener("click", (event) => {
    const button = event.target.closest(".mark-btn");
    if (!button || button.disabled) return;

    const target = button.dataset.markTarget;
    const op = button.dataset.op;
    const input = controlsEl.querySelector(`[data-marker-input="${target}"]`);
    const display = controlsEl.querySelector(`[data-marker-display="${target}"]`);
    if (!input || !display) return;

    const current = Number.parseInt(input.value, 10) || 0;
    const next = op === "inc" ? current + 1 : current - 1;
    const safe = Math.max(0, Math.min(999, next));
    input.value = String(safe);
    renderMarkers(display, safe, target);
    recalcCosts();
    const row = controlsEl.closest("tr");
    if (row) autoSaveRow(row);

    // Gag animations (disabled on mobile)
    const kladdeData = document.getElementById("kladdeData");
    if (kladdeData && kladdeData.dataset.gags === "1" && op === "inc" && window.matchMedia("(min-width: 900px)").matches) {
      if (target === "pudel") gagPudel(controlsEl);
      if (target === "triclops") gagConfetti(controlsEl);
      if ((target === "alle9" || target === "kranz") && event.isTrusted) {
        if (window.flyingSheep) {
          const row = controlsEl.closest("tr");
          const memberId = row?.dataset.memberId;
          const nameCol = row?.querySelector(".name-col");
          const name = nameCol?.dataset.name || nameCol?.textContent.trim() || "?";
          const letter = name.charAt(0).toUpperCase();
          const rect = controlsEl.getBoundingClientRect();
          window.flyingSheep.spawn(rect.left + rect.width / 2, rect.top, memberId, letter, name);
        }
      }
    }
  });
});

// Auto-save indicator
let saveTimeout;
const saveIndicator = document.getElementById("saveIndicator");

function showSaving() {
  if (saveIndicator) {
    saveIndicator.textContent = "Speichern...";
    saveIndicator.classList.add("visible");
  }
}

function showSaved() {
  if (saveIndicator) {
    saveIndicator.textContent = "Gespeichert";
    setTimeout(() => {
      saveIndicator.classList.remove("visible");
    }, 2000);
  }
}

// Form validation feedback
document.querySelectorAll("input[required], select[required]").forEach((input) => {
  input.addEventListener("invalid", (e) => {
    e.target.classList.add("invalid");
  });

  input.addEventListener("input", (e) => {
    e.target.classList.remove("invalid");
  });
});

// Password strength indicator
const passwordInputs = document.querySelectorAll('input[type="password"][name="password"], input[type="password"][name="newPassword"]');
passwordInputs.forEach((input) => {
  const strengthIndicator = document.createElement("div");
  strengthIndicator.className = "password-strength";
  strengthIndicator.style.cssText = "height: 4px; border-radius: 2px; margin-top: 4px; transition: all 200ms;";

  input.parentElement.appendChild(strengthIndicator);

  input.addEventListener("input", () => {
    const value = input.value;
    let strength = 0;

    if (value.length >= 8) strength++;
    if (value.length >= 12) strength++;
    if (/[A-Z]/.test(value)) strength++;
    if (/[0-9]/.test(value)) strength++;
    if (/[^A-Za-z0-9]/.test(value)) strength++;

    const colors = ["#e53e3e", "#dd6b20", "#d69e2e", "#38a169", "#2f8f6d"];
    const widths = ["20%", "40%", "60%", "80%", "100%"];

    strengthIndicator.style.background = colors[Math.min(strength, 4)];
    strengthIndicator.style.width = widths[Math.min(strength, 4)];
  });
});

// Number input helpers - increment/decrement on arrow keys
document.querySelectorAll('input[type="number"]').forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const stepAttr = input.getAttribute("step") || "1";
      const decimals = (stepAttr.split(".")[1] || "").length;
      const step = Number(stepAttr) || 1;
      const min = Number(input.min) || 0;
      const max = Number(input.max) || 999;
      const current = Number(input.value) || 0;

      let next = e.key === "ArrowUp" ? current + step : current - step;
      next = Math.max(min, Math.min(max, next));
      input.value = decimals > 0 ? next.toFixed(decimals) : next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd + S to save forms
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    const activeForm = document.activeElement?.closest("form");
    if (activeForm && activeForm.querySelector('button[type="submit"]')) {
      e.preventDefault();
      activeForm.querySelector('button[type="submit"]').click();
    }
  }

  // Escape to close modals
  if (e.key === "Escape") {
    const modal = document.querySelector(".modal-overlay.active");
    if (modal) {
      modal.classList.remove("active");
    }

    // Close mobile nav
    if (menuToggle && mobileNav && mobileNav.classList.contains("active")) {
      menuToggle.classList.remove("active");
      mobileNav.classList.remove("active");
    }
  }
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    const target = document.querySelector(anchor.getAttribute("href"));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

// Toggle row inputs based on attendance checkbox
document.querySelectorAll("[data-present]").forEach((cb) => {
  const row = cb.closest("tr");
  if (!row) return;
  cb.addEventListener("change", () => {
    row.classList.toggle("row-inactive", !cb.checked);
    row.querySelectorAll("[data-field], [data-field-btn]").forEach((el) => {
      if (el.hasAttribute("data-always-edit")) return;
      el.disabled = !cb.checked;
    });
    // Auto-Strafe: TBD bei Abwesenheit (wird bei Abrechnung berechnet)
    const penaltyInput = row.querySelector('[name^="penalties_"]');
    if (penaltyInput && !penaltyInput.disabled) {
      if (!cb.checked && (Number(penaltyInput.value) || 0) === 0) {
        penaltyInput.value = "";
        penaltyInput.placeholder = "TBD";
      } else if (cb.checked) {
        penaltyInput.placeholder = "";
        if (!penaltyInput.value) {
          penaltyInput.value = "0.00";
        }
      }
    }
    recalcCosts();
    autoSaveRow(row);
  });
});

// Recalc + debounced save on any number input change (Strafen etc.)
document.querySelectorAll(".kladde-table .no-spin").forEach((input) => {
  input.addEventListener("input", () => {
    recalcCosts();
    const row = input.closest("tr");
    if (row) debouncedSaveRow(row);
  });
});

// Auto-save attendance row via AJAX
const kladdeData = document.getElementById("kladdeData");
const kladdeStatus = Number(kladdeData?.dataset.status || 0);

// Debounced auto-save: speichert 600ms nach letzter Eingabe
const _rowSaveTimers = new Map();
function debouncedSaveRow(row) {
  if (!row) return;
  const id = row.dataset.memberId;
  if (!id) return;
  clearTimeout(_rowSaveTimers.get(id));
  _rowSaveTimers.set(id, setTimeout(() => {
    _rowSaveTimers.delete(id);
    autoSaveRow(row);
  }, 400));
}

// Pending saves bei Seitenwechsel sofort abschicken
window.addEventListener("beforeunload", () => flushPendingSaves());

// Bei Klick auf Nav-Links: ausstehende Saves sofort flushen
function flushPendingSaves() {
  for (const [id, timer] of _rowSaveTimers) {
    clearTimeout(timer);
    const row = document.querySelector(`tr[data-member-id="${id}"]`);
    if (row && kladdeData) {
      const payload = buildSavePayload(row);
      if (payload) {
        navigator.sendBeacon(
          "/kegelkladde/attendance-auto",
          new Blob([JSON.stringify(payload)], { type: "application/json" })
        );
      }
    }
  }
  _rowSaveTimers.clear();
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href]");
  if (link && _rowSaveTimers.size > 0) {
    flushPendingSaves();
  }
});

function buildSavePayload(row) {
  if (!kladdeData || kladdeStatus >= 3) return null;
  const csrfToken = kladdeData.dataset.csrf;
  const gamedayId = kladdeData.dataset.gamedayId;
  const memberId = row.dataset.memberId;
  if (!csrfToken || !gamedayId || !memberId) return null;

  const payload = { csrfToken, gamedayId, memberId };
  if (kladdeStatus <= 1) {
    payload.present = row.querySelector("[data-present]")?.checked ? 1 : 0;
    payload.penalties = row.querySelector(`[name="penalties_${memberId}"]`)?.value || 0;
    payload.pudel = row.querySelector('[data-marker-input="pudel"]')?.value || 0;
    payload.alle9 = row.querySelector('[data-marker-input="alle9"]')?.value || 0;
    payload.kranz = row.querySelector('[data-marker-input="kranz"]')?.value || 0;
    payload.triclops = row.querySelector('[data-marker-input="triclops"]')?.value || 0;
    payload.va = (Number(row.querySelector(`[name="va_${memberId}"]`)?.value) || 0) / 10;
    payload.monte = (Number(row.querySelector(`[name="monte_${memberId}"]`)?.value) || 0) / 10;
    payload.aussteigen = (Number(row.querySelector(`[name="aussteigen_${memberId}"]`)?.value) || 0) / 10;
    payload.sechs_tage = (Number(row.querySelector(`[name="sechs_tage_${memberId}"]`)?.value) || 0) / 10;
    payload.monte_tiebreak = row.querySelector(`[name="monte_tiebreak_${memberId}"]`)?.value || 0;
    payload.aussteigen_tiebreak = row.querySelector(`[name="aussteigen_tiebreak_${memberId}"]`)?.value || 0;
  } else if (kladdeStatus === 2) {
    payload.paid = row.querySelector(`[name="paid_${memberId}"]`)?.value || 0;
    payload.penalties = row.querySelector(`[name="penalties_${memberId}"]`)?.value || 0;
  }
  return payload;
}

function autoSaveRow(row) {
  const payload = buildSavePayload(row);
  if (!payload) return;

  showSaving();

  fetch("/kegelkladde/attendance-auto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  })
  .then((r) => r.json())
  .then((data) => {
    if (data.ok) {
      showSaved();
      if (kladdeStatus === 2) updateKassenstand();
    } else {
      showToast(data.error || "Fehler beim Speichern", "error");
    }
  })
  .catch(() => showToast("Fehler beim Speichern", "error"));
}

// Live-Update Kassenstand (Spieltag-bezogen)
function updateKassenstand() {
  const summary = document.getElementById("kassenstandSummary");
  if (!summary) return;
  const gamedayId = summary.dataset.gamedayId;
  if (!gamedayId) return;
  fetch("/api/kassenstand?gamedayId=" + encodeURIComponent(gamedayId))
    .then((r) => r.json())
    .then((data) => {
      const el = (id) => document.getElementById(id);
      if (el("ksPrev")) el("ksPrev").textContent = formatEuroCost(data.previousKassenstand) + " \u20ac";
      if (el("ksPaid")) el("ksPaid").textContent = "+" + formatEuroCost(data.gamedayPaid) + " \u20ac";
      if (el("ksTotal")) el("ksTotal").textContent = formatEuroCost(data.kassenstand) + " \u20ac";
    })
    .catch(() => {});
}

// Spieltag-Einträge (Kosten + Einnahmen): Betrag speichern + neue anlegen
function initGamedayCosts() {
  const summary = document.getElementById("kassenstandSummary");
  if (!summary) return;

  const gamedayId = summary.dataset.gamedayId;
  const csrfToken = summary.dataset.csrf;

  // Betrag-Inputs: AJAX-Save bei Änderung
  summary.querySelectorAll(".ks-entry-input").forEach((input) => {
    input.addEventListener("change", () => {
      const entryId = input.dataset.entryId;
      showSaving();
      fetch("/kegelkladde/gameday-entry-value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, entryId, amount: input.value || 0 })
      })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) { showSaved(); updateKassenstand(); }
        else showToast(data.error || "Fehler", "error");
      })
      .catch(() => showToast("Fehler beim Speichern", "error"));
    });
  });

  // Neue Einträge anlegen (Kosten oder Einnahmen)
  summary.querySelectorAll(".ks-new-entry-input").forEach((newInput) => {
    function createEntry() {
      const name = newInput.value.trim();
      if (!name) return;
      const type = newInput.dataset.entryType;
      newInput.disabled = true;

      fetch("/kegelkladde/gameday-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, gamedayId, name, type })
      })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) window.location.reload();
        else { showToast(data.error || "Fehler", "error"); newInput.disabled = false; }
      })
      .catch(() => { showToast("Fehler beim Anlegen", "error"); newInput.disabled = false; });
    }

    newInput.addEventListener("blur", createEntry);
    newInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); newInput.blur(); }
    });
  });
}

// Trigger auto-save on blur for number inputs
document.querySelectorAll(".kladde-table .no-spin").forEach((input) => {
  input.addEventListener("change", () => {
    const row = input.closest("tr");
    if (row) autoSaveRow(row);
  });
});

// Game field inputs: recalc + debounced save on input, immediate save on blur
document.querySelectorAll(".kladde-table [data-game-field]").forEach((input) => {
  input.addEventListener("input", () => {
    recalcCosts();
    const row = input.closest("tr");
    if (row) debouncedSaveRow(row);
  });
  input.addEventListener("change", () => {
    const row = input.closest("tr");
    if (row) autoSaveRow(row);
  });
});

// Custom game value inputs: recalc + debounced AJAX save
document.querySelectorAll(".kladde-table [data-custom-game-field]").forEach((input) => {
  input.addEventListener("input", () => {
    recalcCosts();
    // Custom games haben eigenen Save-Endpoint, trotzdem debounced
  });
  input.addEventListener("change", () => {
    recalcCosts();
    if (!kladdeData || kladdeStatus > 1) return;
    const row = input.closest("tr");
    if (!row) return;
    const csrfToken = kladdeData.dataset.csrf;
    const gamedayId = kladdeData.dataset.gamedayId;
    const memberId = row.dataset.memberId;
    const customGameId = input.dataset.customGameId;
    const amount = (Number(input.value) || 0) / 10;

    showSaving();
    fetch("/kegelkladde/custom-game-value", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, gamedayId, memberId, customGameId, amount })
    })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) showSaved();
      else showToast(data.error || "Fehler beim Speichern", "error");
    })
    .catch(() => showToast("Fehler beim Speichern", "error"));
  });
});

// Struck game: dblclick / long-press auf Spiel-Zellen togglet Durchstreichung
(function() {
  if (!kladdeData || kladdeStatus > 1) return;
  const gameCells = document.querySelectorAll(".kladde-table td[data-game-key]");

  function toggleStruck(td) {
    const row = td.closest("tr[data-member-id]");
    if (!row || row.classList.contains("row-inactive")) return;
    const gameKey = td.dataset.gameKey;
    const memberId = row.dataset.memberId;
    const csrfToken = kladdeData.dataset.csrf;
    const gamedayId = kladdeData.dataset.gamedayId;

    td.classList.toggle("cell-struck");

    fetch("/kegelkladde/struck-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, gamedayId, memberId, gameKey })
    })
    .then((r) => {
      if (!r.ok) return r.text().then((t) => { throw new Error(t || r.statusText); });
      return r.json();
    })
    .then((data) => {
      if (!data.ok) {
        td.classList.toggle("cell-struck");
        showToast(data.error || "Fehler", "error");
      }
    })
    .catch(() => {
      td.classList.toggle("cell-struck");
      showToast("Fehler beim Speichern", "error");
    });
  }

  // Desktop: dblclick
  gameCells.forEach((td) => {
    td.addEventListener("dblclick", (e) => {
      if (e.target.closest("input, button, label")) return;
      toggleStruck(td);
    });
  });

  // Mobile: long-press (500ms)
  let pressTimer = null;
  let pressTarget = null;
  gameCells.forEach((td) => {
    td.addEventListener("touchstart", (e) => {
      if (e.target.closest("input, button, label")) return;
      pressTarget = td;
      pressTimer = setTimeout(() => {
        e.preventDefault();
        toggleStruck(td);
        pressTimer = null;
      }, 500);
    }, { passive: false });
    td.addEventListener("touchend", () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });
    td.addEventListener("touchmove", () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });
  });
})();

// Paid field inputs (status 2): recalc rest + debounced save
document.querySelectorAll(".kladde-table [data-paid-field]").forEach((input) => {
  input.addEventListener("input", () => {
    const row = input.closest("tr");
    if (!row) return;
    const toPayEl = row.querySelector("[data-topay]");
    const restEl = row.querySelector("[data-rest]");
    if (toPayEl && restEl) {
      const toPay = Number(toPayEl.textContent.replace(",", ".").replace(/[^0-9.\-]/g, "")) || 0;
      const paid = Number(input.value) || 0;
      const rest = toPay - paid;
      restEl.textContent = formatEuroCost(rest) + " €";
      restEl.style.color = rest > 0 ? "var(--error)" : rest < 0 ? "var(--success)" : "";
    }
    if (row) debouncedSaveRow(row);
  });
  input.addEventListener("change", () => {
    const row = input.closest("tr");
    if (row) autoSaveRow(row);
  });
});

// New custom game column: header input blur
document.querySelectorAll("[data-new-game-header]").forEach((input) => {
  input.addEventListener("blur", () => {
    const name = input.value.trim();
    if (!name || !kladdeData) return;

    const csrfToken = kladdeData.dataset.csrf;
    const gamedayId = kladdeData.dataset.gamedayId;

    fetch("/kegelkladde/custom-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, gamedayId, name })
    })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        window.location.reload();
      } else {
        showToast(data.error || "Fehler", "error");
      }
    })
    .catch(() => showToast("Fehler beim Anlegen", "error"));
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
  });
});

// Rename custom game column: blur/Enter on header input
document.querySelectorAll("[data-custom-game-rename]").forEach((input) => {
  function doRename() {
    const name = input.value.trim();
    const original = input.dataset.originalName;
    if (!name) {
      input.value = original;
      return;
    }
    if (name === original) return;
    if (!kladdeData) return;

    const csrfToken = kladdeData.dataset.csrf;
    const gamedayId = kladdeData.dataset.gamedayId;
    const customGameId = input.dataset.customGameRename;

    showSaving();
    fetch("/kegelkladde/custom-game-rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, gamedayId, customGameId, name })
    })
    .then((r) => {
      if (!r.ok) return r.text().then((t) => { throw new Error(t || r.statusText); });
      return r.json();
    })
    .then((data) => {
      if (data.ok) {
        showSaved();
        input.dataset.originalName = name;
        // Update data-label on matching td cells in all rows
        document.querySelectorAll(`[data-custom-game-id="${customGameId}"]`).forEach((field) => {
          const td = field.closest("td");
          if (td) td.dataset.label = name;
        });
      } else {
        showToast(data.error || "Fehler beim Umbenennen", "error");
        input.value = original;
      }
    })
    .catch(() => {
      showToast("Fehler beim Umbenennen", "error");
      input.value = original;
    });
  }

  input.addEventListener("blur", doRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
  });
});

// Delete custom game column: click on delete button
document.querySelectorAll("[data-custom-game-delete]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!kladdeData) return;
    const customGameId = btn.dataset.customGameDelete;
    const th = btn.closest("th");
    const name = th ? th.querySelector("[data-custom-game-rename]")?.value || "Spiel" : "Spiel";

    confirmAction(`Spiel "${name}" wirklich löschen? Alle Werte gehen verloren!`, () => {
      const csrfToken = kladdeData.dataset.csrf;
      const gamedayId = kladdeData.dataset.gamedayId;

      fetch("/kegelkladde/custom-game-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, gamedayId, customGameId })
      })
      .then((r) => {
        if (!r.ok) return r.text().then((t) => { throw new Error(t || r.statusText); });
        return r.json();
      })
      .then((data) => {
        if (data.ok) {
          window.location.reload();
        } else {
          showToast(data.error || "Fehler beim Löschen", "error");
        }
      })
      .catch((err) => showToast("Fehler beim Löschen: " + (err.message || err), "error"));
    });
  });
});

// Inline-Edit für Rekorde/Kurioses
document.querySelectorAll(".btn-edit").forEach((btn) => {
  btn.addEventListener("click", () => {
    const row = btn.closest("tr");
    if (row.classList.contains("editing")) return;

    const gameCell = row.querySelector(".record-game");
    const titleCell = row.querySelector(".record-title");
    const holderCell = row.querySelector(".record-holder");
    const actionsCell = row.querySelector(".actions");
    const actionBtns = actionsCell.querySelector(".action-btns");
    const editForm = actionsCell.querySelector(".edit-form");

    const origGame = gameCell ? gameCell.textContent.trim() : '';
    const origTitle = titleCell.textContent.trim();
    const origHolder = holderCell.textContent.trim();

    row.classList.add("editing");

    if (gameCell) gameCell.innerHTML = `<input type="text" class="edit-input" value="${origGame.replace(/"/g, "&quot;")}" maxlength="120" />`;
    titleCell.innerHTML = `<input type="text" class="edit-input" value="${origTitle.replace(/"/g, "&quot;")}" maxlength="120" />`;
    holderCell.innerHTML = `<input type="text" class="edit-input" value="${origHolder.replace(/"/g, "&quot;")}" maxlength="120" />`;

    actionBtns.style.display = "none";
    editForm.style.display = "";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-save btn-sm";
    saveBtn.textContent = "✓";
    saveBtn.title = "Speichern";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-cancel btn-sm";
    cancelBtn.textContent = "✗";
    cancelBtn.title = "Abbrechen";

    const editBtns = document.createElement("div");
    editBtns.className = "action-btns edit-active-btns";
    editBtns.appendChild(saveBtn);
    editBtns.appendChild(cancelBtn);
    actionsCell.appendChild(editBtns);

    titleCell.querySelector("input").focus();

    function doSave() {
      const newGame = gameCell ? gameCell.querySelector("input").value.trim() : '';
      const newTitle = titleCell.querySelector("input").value.trim();
      const newHolder = holderCell.querySelector("input").value.trim();
      if (!newTitle || !newHolder) {
        showToast("Rekord und Rekordhalter müssen ausgefüllt sein.", "error");
        return;
      }
      const gameVal = editForm.querySelector(".edit-game-val");
      if (gameVal) gameVal.value = newGame;
      editForm.querySelector(".edit-title-val").value = newTitle;
      editForm.querySelector(".edit-holder-val").value = newHolder;
      editForm.submit();
    }

    function doCancel() {
      row.classList.remove("editing");
      if (gameCell) gameCell.textContent = origGame;
      titleCell.textContent = origTitle;
      holderCell.textContent = origHolder;
      actionBtns.style.display = "";
      editForm.style.display = "none";
      editBtns.remove();
    }

    saveBtn.addEventListener("click", doSave);
    cancelBtn.addEventListener("click", doCancel);

    // Enter = Speichern, Escape = Abbrechen
    row.querySelectorAll(".edit-input").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); doSave(); }
        if (e.key === "Escape") { doCancel(); }
      });
    });
  });
});

// Inline-Edit für Ausgaben
document.querySelectorAll(".btn-expense-edit").forEach((btn) => {
  btn.addEventListener("click", () => {
    const row = btn.closest("tr");
    if (row.classList.contains("editing")) return;

    const dateCell = row.querySelector(".expense-date");
    const descCell = row.querySelector(".expense-desc");
    const amountCell = row.querySelector(".expense-amount");
    const actionsCell = row.querySelector(".actions");
    const actionBtns = actionsCell.querySelector(".action-btns");
    const editForm = actionsCell.querySelector(".edit-form");

    const origDate = dateCell.textContent.trim();
    const origDesc = descCell.textContent.trim();
    const origAmount = amountCell.textContent.trim().replace(/[^\d,.-]/g, "").replace(",", ".");

    // DD.MM.YYYY -> YYYY-MM-DD
    const [d, m, y] = origDate.split(".");
    const isoDate = `${y}-${m}-${d}`;

    row.classList.add("editing");

    dateCell.innerHTML = '<input type="date" class="edit-input" value="' + isoDate + '" />';
    descCell.innerHTML = '<input type="text" class="edit-input" value="' + origDesc.replace(/"/g, '&quot;') + '" maxlength="200" />';
    amountCell.innerHTML = '<input type="number" class="edit-input" step="0.01" min="0.01" value="' + origAmount + '" style="width:80px" />';

    actionBtns.style.display = "none";
    editForm.style.display = "";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-save btn-sm";
    saveBtn.textContent = "\u2713";
    saveBtn.title = "Speichern";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-cancel btn-sm";
    cancelBtn.textContent = "\u2717";
    cancelBtn.title = "Abbrechen";

    const editBtns = document.createElement("div");
    editBtns.className = "action-btns edit-active-btns";
    editBtns.appendChild(saveBtn);
    editBtns.appendChild(cancelBtn);
    actionsCell.appendChild(editBtns);

    descCell.querySelector("input").focus();

    function doSave() {
      const newDate = dateCell.querySelector("input").value;
      const newDesc = descCell.querySelector("input").value.trim();
      const newAmount = amountCell.querySelector("input").value;
      if (!newDate || !newDesc || !newAmount) {
        showToast("Alle Felder müssen ausgefüllt sein.", "error");
        return;
      }
      editForm.querySelector(".edit-date-val").value = newDate;
      editForm.querySelector(".edit-desc-val").value = newDesc;
      editForm.querySelector(".edit-amount-val").value = newAmount;
      editForm.submit();
    }

    function doCancel() {
      row.classList.remove("editing");
      dateCell.textContent = origDate;
      descCell.textContent = origDesc;
      amountCell.textContent = origAmount.replace(".", ",") + " \u20ac";
      actionBtns.style.display = "";
      editForm.style.display = "none";
      editBtns.remove();
    }

    saveBtn.addEventListener("click", doSave);
    cancelBtn.addEventListener("click", doCancel);

    row.querySelectorAll(".edit-input").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); doSave(); }
        if (e.key === "Escape") { doCancel(); }
      });
    });
  });
});

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    btn.closest(".tab-nav").querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    btn.closest("section").querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById("tab-" + target);
    if (panel) panel.classList.add("active");
  });
});

// Sortable tables
document.querySelectorAll(".sortable-table").forEach((table) => {
  const headers = table.querySelectorAll("thead th[data-sort]");
  headers.forEach((th, colIdx) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const tbody = table.querySelector("tbody");
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const type = th.dataset.sort;
      const currentDir = th.dataset.sortDir === "asc" ? "desc" : "asc";

      // Reset all headers in this table
      headers.forEach((h) => { h.dataset.sortDir = ""; h.classList.remove("sort-asc", "sort-desc"); });
      th.dataset.sortDir = currentDir;
      th.classList.add(currentDir === "asc" ? "sort-asc" : "sort-desc");

      rows.sort((a, b) => {
        const cellA = a.children[colIdx];
        const cellB = b.children[colIdx];
        let valA, valB;
        if (type === "number") {
          valA = Number(cellA.dataset.value ?? cellA.textContent) || 0;
          valB = Number(cellB.dataset.value ?? cellB.textContent) || 0;
        } else {
          valA = cellA.textContent.trim().toLowerCase();
          valB = cellB.textContent.trim().toLowerCase();
        }
        const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
        return currentDir === "asc" ? cmp : -cmp;
      });

      rows.forEach((row) => tbody.appendChild(row));
    });
  });
});

// Column-first tab navigation: Tab moves down rows within same column, then to next column
function initKladdeTabNav() {
  const table = document.querySelector(".kladde-table:not(.kladde-preview)");
  if (!table) return;

  // Define column selectors in tab order (per row)
  const colSelectors = [
    '[name^="penalties_"]',
    '[data-mark-target="alle9"][data-op="inc"]',
    '[data-mark-target="kranz"][data-op="inc"]',
    '[data-mark-target="triclops"][data-op="inc"]',
    '[data-mark-target="pudel"][data-op="inc"]',
    '[name^="va_"]',
    '[name^="monte_"]',
    '[name^="aussteigen_"]',
    '[name^="sechs_tage_"]',
  ];

  // Add custom game columns dynamically
  const firstRow = table.querySelector("tbody tr");
  if (firstRow) {
    firstRow.querySelectorAll("[data-custom-game-id]").forEach((input) => {
      colSelectors.push(`[data-custom-game-id="${input.dataset.customGameId}"]`);
    });
  }

  // Add paid fields if present
  if (table.querySelector("[data-paid-field]")) {
    colSelectors.push("[data-paid-field]");
  }

  const rows = Array.from(table.querySelectorAll("tbody tr"));
  if (rows.length === 0) return;

  // Build flat tab order: column by column, row by row
  const tabOrder = [];
  for (const sel of colSelectors) {
    for (const row of rows) {
      const el = row.querySelector(sel);
      if (el && !el.disabled) tabOrder.push(el);
    }
  }

  if (tabOrder.length === 0) return;

  // Set tabindex=-1 on all kladde inputs/buttons to remove them from natural tab order
  const allTabbable = table.querySelectorAll("tbody input:not([type=hidden]):not([type=checkbox]), tbody button.mark-btn:not(.mark-dec)");
  allTabbable.forEach((el) => { el.setAttribute("tabindex", "-1"); });

  // Give the first element tabindex 0 so it's reachable
  tabOrder[0].setAttribute("tabindex", "0");

  // Reveal entire column when any cell in it gets focus
  function revealColumn(el) {
    const td = el.closest("td");
    if (!td) return;
    const colIdx = td.cellIndex;
    // Remove previous col-active
    table.querySelectorAll("td.col-active").forEach((c) => c.classList.remove("col-active"));
    // Activate all cells in this column
    rows.forEach((row) => {
      const cell = row.cells[colIdx];
      if (cell) cell.classList.add("col-active");
    });
  }

  table.addEventListener("focusin", (e) => {
    if (tabOrder.includes(e.target)) revealColumn(e.target);
  });

  table.addEventListener("focusout", () => {
    // Clear on focus leaving table entirely (debounced to allow tab between cells)
    setTimeout(() => {
      if (!table.contains(document.activeElement)) {
        table.querySelectorAll("td.col-active").forEach((c) => c.classList.remove("col-active"));
      }
    }, 100);
  });

  table.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;

    const idx = tabOrder.indexOf(e.target);
    if (idx === -1) return;

    e.preventDefault();
    const next = e.shiftKey ? idx - 1 : idx + 1;
    if (next < 0 || next >= tabOrder.length) return;

    const target = tabOrder[next];
    target.setAttribute("tabindex", "0");
    revealColumn(target);
    target.focus();
    if (target.select) target.select();
  });
}

// Mobile "nach Spiel" view: one card per game category, all members inside
function initMobileByGame() {
  if (window.matchMedia("(min-width: 900px)").matches) return;
  const kladde = document.getElementById("kladdeData");
  if (!kladde) return;
  const tableShell = kladde.querySelector(".table-shell");
  const table = kladde.querySelector(".kladde-table:not(.kladde-preview)");
  if (!table || !tableShell) return;
  const rows = Array.from(table.querySelectorAll("tbody tr[data-member-id]"));
  if (rows.length === 0) return;

  const members = rows.map(row => {
    const nameCol = row.querySelector(".name-col");
    const avatarEl = nameCol?.querySelector(".kladde-avatar");
    let avatarHtml = "";
    if (avatarEl) avatarHtml = avatarEl.outerHTML;
    return {
      id: row.dataset.memberId,
      name: nameCol?.dataset.name || nameCol?.textContent?.trim() || "",
      avatarHtml,
      row
    };
  });

  // --- Toggle UI ---
  const toggle = document.createElement("div");
  toggle.className = "mobile-view-toggle";
  toggle.innerHTML =
    '<button type="button" class="toggle-btn active" data-view="game">Nach Spiel</button>' +
    '<button type="button" class="toggle-btn" data-view="kegler">Nach Kegler</button>';

  // --- Game container ---
  const gc = document.createElement("div");
  gc.className = "mobile-by-game";

  function makeCard(title, expanded) {
    const card = document.createElement("div");
    card.className = "game-card" + (expanded ? "" : " mobile-collapsed");
    const hdr = document.createElement("div");
    hdr.className = "game-card-header";
    hdr.textContent = title;
    hdr.addEventListener("click", () => card.classList.toggle("mobile-collapsed"));
    const body = document.createElement("div");
    body.className = "game-card-body";
    card.append(hdr, body);
    return { card, body };
  }

  function makeRow(m) {
    const r = document.createElement("div");
    r.className = "game-card-row";
    r.dataset.mid = m.id;
    return r;
  }

  // 1. Anwesenheit
  {
    const { card, body } = makeCard("Anwesenheit", true);
    members.forEach(m => {
      const tcb = m.row.querySelector("[data-present]");
      if (!tcb) return;
      const r = makeRow(m);
      r.innerHTML = '<span class="gcn">' + m.avatarHtml + m.name + '</span>' +
        '<label class="present-toggle"><input type="checkbox" data-mp="' + m.id + '"' +
        (tcb.checked ? " checked" : "") + (tcb.disabled ? " disabled" : "") +
        ' /><img src="/sheep.png" alt="" class="present-icon" /></label>';
      r.querySelector("input").addEventListener("change", function() {
        tcb.checked = this.checked;
        tcb.dispatchEvent(new Event("change", { bubbles: true }));
        syncMobile();
      });
      body.appendChild(r);
    });
    gc.appendChild(card);
  }

  // 2. Marker cards
  [
    { key: "alle9", label: "9er" },
    { key: "kranz", label: "Kränze" },
    { key: "triclops", label: "Triclops" },
    { key: "pudel", label: "Pudel" }
  ].forEach(({ key, label }) => {
    const { card, body } = makeCard(label);
    members.forEach(m => {
      const ti = m.row.querySelector('[data-marker-input="' + key + '"]');
      const td = m.row.querySelector('[data-marker-display="' + key + '"]');
      const tc = m.row.querySelector('[data-cost-type="' + key + '"]');
      if (!ti) return;
      const r = makeRow(m);
      r.dataset.mk = key;
      r.innerHTML = '<span class="gcn">' + m.avatarHtml + m.name + '</span>' +
        '<div class="gc-marker">' +
        '<button type="button" class="mark-btn mark-dec"' + (ti.disabled ? " disabled" : "") + '>&minus;</button>' +
        '<span class="marker-strip" data-md="' + key + '_' + m.id + '">' + (td ? td.innerHTML : "") + '</span>' +
        '<button type="button" class="mark-btn"' + (ti.disabled ? " disabled" : "") + '>+</button>' +
        '</div>' +
        '<span class="marker-cost gcost" data-mc="' + key + '_' + m.id + '">' + (tc ? tc.textContent : "") + '</span>';
      r.querySelector(".mark-btn:not(.mark-dec)").addEventListener("click", () => {
        const btn = m.row.querySelector('[data-mark-target="' + key + '"][data-op="inc"]');
        if (btn && !btn.disabled) { btn.click(); syncMobile(); }
      });
      r.querySelector(".mark-dec").addEventListener("click", () => {
        const btn = m.row.querySelector('[data-mark-target="' + key + '"][data-op="dec"]');
        if (btn && !btn.disabled) { btn.click(); syncMobile(); }
      });
      body.appendChild(r);
    });
    gc.appendChild(card);
  });

  // 3. Money field cards
  [
    { prefix: "penalties", label: "Strafen", isGame: false },
    { prefix: "va", label: "V+A", isGame: true },
    { prefix: "monte", label: "Monte", isGame: true },
    { prefix: "aussteigen", label: "Aussteigen", isGame: true },
    { prefix: "sechs_tage", label: "6-Tage", isGame: true }
  ].forEach(({ prefix, label, isGame }) => {
    const { card, body } = makeCard(label);
    let any = false;
    members.forEach(m => {
      const ti = m.row.querySelector('[name="' + prefix + '_' + m.id + '"]');
      if (!ti) return;
      any = true;
      const r = makeRow(m);
      r.innerHTML = '<span class="gcn">' + m.avatarHtml + m.name + '</span>' +
        '<span class="money-inline"><input type="number" min="0" max="999" step="' + (isGame ? '1' : '0.10') + '" value="' + ti.value +
        '" class="mini-number no-spin" data-mi="' + prefix + '_' + m.id + '"' +
        (ti.disabled ? " disabled" : "") + ' />' + (isGame ? '' : '&euro;') + '</span>';
      const inp = r.querySelector("input");
      inp.addEventListener("input", () => { ti.value = inp.value; recalcCosts(); });
      inp.addEventListener("change", () => { ti.value = inp.value; recalcCosts(); autoSaveRow(m.row); });
      body.appendChild(r);
    });
    if (any) gc.appendChild(card);
  });

  // 4. Custom game cards
  const firstRow = rows[0];
  if (firstRow) {
    firstRow.querySelectorAll("[data-custom-game-id]").forEach(sample => {
      const cgId = sample.dataset.customGameId;
      const cgLabel = sample.closest("td")?.dataset.label || ("Spiel " + cgId);
      const { card, body } = makeCard(cgLabel);
      members.forEach(m => {
        const ti = m.row.querySelector('[data-custom-game-id="' + cgId + '"]');
        if (!ti) return;
        const r = makeRow(m);
        r.innerHTML = '<span class="gcn">' + m.avatarHtml + m.name + '</span>' +
          '<span class="money-inline"><input type="number" min="0" max="999" step="1" value="' + ti.value +
          '" class="mini-number no-spin" data-mcg="' + cgId + '_' + m.id + '"' +
          (ti.disabled ? " disabled" : "") + ' /></span>';
        const inp = r.querySelector("input");
        inp.addEventListener("input", () => { ti.value = inp.value; recalcCosts(); });
        inp.addEventListener("change", () => {
          ti.value = inp.value; recalcCosts();
          const csrfToken = kladde.dataset.csrf;
          const gamedayId = kladde.dataset.gamedayId;
          showSaving();
          fetch("/kegelkladde/custom-game-value", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csrfToken, gamedayId, memberId: m.id, customGameId: cgId, amount: (Number(inp.value) || 0) / 10 })
          })
          .then(res => res.json())
          .then(data => { if (data.ok) showSaved(); else showToast(data.error || "Fehler", "error"); })
          .catch(() => showToast("Fehler beim Speichern", "error"));
        });
        body.appendChild(r);
      });
      gc.appendChild(card);
    });
  }

  // 5. Payment card (status 2)
  {
    const { card, body } = makeCard("Zahlung");
    let any = false;
    members.forEach(m => {
      const ti = m.row.querySelector('[data-paid-field]');
      if (!ti) return;
      any = true;
      const topay = m.row.querySelector("[data-topay]");
      const rest = m.row.querySelector("[data-rest]");
      const r = makeRow(m);
      r.innerHTML = '<span class="gcn">' + m.avatarHtml + m.name + '</span>' +
        '<span class="game-card-topay" data-mtp="' + m.id + '">' + (topay ? topay.textContent.trim() : "") + '</span>' +
        '<span class="money-inline"><input type="number" min="0" max="9999" step="0.10" value="' + ti.value +
        '" class="mini-number no-spin" />&euro;</span>' +
        '<span class="game-card-rest" data-mrs="' + m.id + '">' + (rest ? rest.textContent.trim() : "") + '</span>';
      const inp = r.querySelector("input");
      inp.addEventListener("input", () => { ti.value = inp.value; ti.dispatchEvent(new Event("input", { bubbles: true })); syncMobile(); });
      inp.addEventListener("change", () => { ti.value = inp.value; autoSaveRow(m.row); });
      body.appendChild(r);
    });
    if (any) { card.classList.remove("mobile-collapsed"); gc.appendChild(card); }
  }

  // 6. Summary card
  {
    const { card, body } = makeCard("Übersicht", true);
    members.forEach(m => {
      const topay = m.row.querySelector("[data-topay]");
      const rest = m.row.querySelector("[data-rest]");
      const r = makeRow(m);
      r.className += " gc-summary";
      let h = '<span class="gcn">' + m.avatarHtml + m.name + '</span>' +
        '<span class="money-text" data-mts="' + m.id + '">' + (topay ? topay.textContent.trim() : "") + '</span>';
      if (rest) h += '<span class="money-text" data-mrss="' + m.id + '" style="color:' + (rest.style.color || "") + '">' + rest.textContent.trim() + '</span>';
      r.innerHTML = h;
      body.appendChild(r);
    });
    gc.appendChild(card);
  }

  // Insert into DOM
  kladde.insertBefore(toggle, tableShell);
  kladde.appendChild(gc);
  kladde.classList.add("kladde-view-game");

  // Toggle handler
  toggle.addEventListener("click", e => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn) return;
    toggle.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    kladde.classList.toggle("kladde-view-game", btn.dataset.view === "game");
    kladde.classList.toggle("kladde-view-kegler", btn.dataset.view === "kegler");
  });

  // --- Sync mobile display from table ---
  function syncMobile() {
    members.forEach(m => {
      const isPresent = m.row.querySelector("[data-present]")?.checked;

      // Present checkbox
      const mcb = gc.querySelector('[data-mp="' + m.id + '"]');
      if (mcb) { mcb.checked = isPresent; }

      // Inactive state on all game rows for this member
      gc.querySelectorAll('.game-card-row[data-mid="' + m.id + '"]').forEach(r => {
        r.classList.toggle("gc-inactive", !isPresent);
      });

      // Markers: display + cost + disabled
      ["alle9", "kranz", "triclops", "pudel"].forEach(key => {
        const td = m.row.querySelector('[data-marker-display="' + key + '"]');
        const md = gc.querySelector('[data-md="' + key + '_' + m.id + '"]');
        if (td && md) md.innerHTML = td.innerHTML;

        const tc = m.row.querySelector('[data-cost-type="' + key + '"]');
        const mc = gc.querySelector('[data-mc="' + key + '_' + m.id + '"]');
        if (tc && mc) mc.textContent = tc.textContent;

        const ti = m.row.querySelector('[data-marker-input="' + key + '"]');
        const mr = gc.querySelector('.game-card-row[data-mid="' + m.id + '"][data-mk="' + key + '"]');
        if (ti && mr) mr.querySelectorAll("button").forEach(b => { b.disabled = ti.disabled; });
      });

      // Money inputs: sync value + disabled
      ["penalties", "va", "monte", "aussteigen", "sechs_tage"].forEach(prefix => {
        const ti = m.row.querySelector('[name="' + prefix + '_' + m.id + '"]');
        const mi = gc.querySelector('[data-mi="' + prefix + '_' + m.id + '"]');
        if (ti && mi) {
          mi.disabled = ti.disabled;
          if (document.activeElement !== mi) mi.value = ti.value;
        }
      });

      // Custom games: sync disabled + value
      m.row.querySelectorAll("[data-custom-game-id]").forEach(ti => {
        const cgId = ti.dataset.customGameId;
        const mi = gc.querySelector('[data-mcg="' + cgId + '_' + m.id + '"]');
        if (mi) {
          mi.disabled = ti.disabled;
          if (document.activeElement !== mi) mi.value = ti.value;
        }
      });

      // Zu zahlen + Rest
      const topay = m.row.querySelector("[data-topay]");
      if (topay) {
        gc.querySelectorAll('[data-mtp="' + m.id + '"], [data-mts="' + m.id + '"]').forEach(el => {
          el.textContent = topay.textContent.trim();
        });
      }
      const rest = m.row.querySelector("[data-rest]");
      if (rest) {
        gc.querySelectorAll('[data-mrs="' + m.id + '"], [data-mrss="' + m.id + '"]').forEach(el => {
          el.textContent = rest.textContent.trim();
          el.style.color = rest.style.color;
        });
      }
    });
  }

  // Expose sync so recalcCosts can call it
  window._syncMobileDisplay = syncMobile;
}

// Mobile card expand/collapse
function initMobileCards() {
  if (window.matchMedia("(min-width: 900px)").matches) return;
  const table = document.querySelector(".kladde-table:not(.kladde-preview)");
  if (!table) return;

  table.querySelectorAll("tbody tr[data-member-id]").forEach((row) => {
    row.classList.add("mobile-collapsed");
    const nameCell = row.querySelector(".name-col");
    if (nameCell) {
      nameCell.addEventListener("click", (e) => {
        // Don't toggle when clicking on inputs/buttons/links inside name cell
        if (e.target.closest("input, button, a")) return;
        row.classList.toggle("mobile-collapsed");
      });
    }
  });
}

// Row-level edit locking
function initEditLocks() {
  const kladde = document.getElementById("kladdeData");
  if (!kladde) return;

  const gamedayId = kladde.dataset.gamedayId;
  const csrfToken = kladde.dataset.csrf;
  const myUserId = kladde.dataset.userId;
  if (!gamedayId || !csrfToken || !myUserId) return;

  const table = kladde.querySelector(".kladde-table");
  if (!table) return;

  let currentLockedRow = null; // memberId of the row we currently have locked
  let unlockTimer = null;

  function sendLock(memberId) {
    if (currentLockedRow === memberId) {
      // Renew existing lock
      fetch("/kegelkladde/lock-row", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, gamedayId, memberId })
      }).catch(() => {});
      return;
    }

    // Unlock previous row first
    if (currentLockedRow !== null) {
      sendUnlock(currentLockedRow);
    }

    currentLockedRow = memberId;
    fetch("/kegelkladde/lock-row", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, gamedayId, memberId })
    }).catch(() => {});
  }

  function sendUnlock(memberId) {
    fetch("/kegelkladde/unlock-row", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, gamedayId, memberId })
    }).catch(() => {});
    if (currentLockedRow === memberId) currentLockedRow = null;
  }

  // Focus-in: lock the row
  table.addEventListener("focusin", (e) => {
    const row = e.target.closest("tr[data-member-id]");
    if (!row) return;
    clearTimeout(unlockTimer);
    sendLock(row.dataset.memberId);
  });

  // Click on marker buttons also locks
  table.addEventListener("click", (e) => {
    if (!e.target.closest(".mark-btn")) return;
    const row = e.target.closest("tr[data-member-id]");
    if (!row) return;
    clearTimeout(unlockTimer);
    sendLock(row.dataset.memberId);
  });

  // Focus-out: unlock with debounce (300ms to allow tabbing within same row)
  table.addEventListener("focusout", (e) => {
    const row = e.target.closest("tr[data-member-id]");
    if (!row) return;
    const memberId = row.dataset.memberId;

    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => {
      if (currentLockedRow === memberId) {
        sendUnlock(memberId);
      }
    }, 300);
  });

  // Apply/remove locks from server response
  function applyLocks(locks) {
    const lockedMembers = new Map();
    for (const lock of locks) {
      lockedMembers.set(String(lock.memberId), lock.firstName);
    }

    table.querySelectorAll("tbody tr[data-member-id]").forEach((row) => {
      const mId = row.dataset.memberId;
      const firstName = lockedMembers.get(mId);

      if (firstName) {
        row.classList.add("row-locked");
        // Add or update lock indicator
        const nameCell = row.querySelector(".name-col");
        if (nameCell) {
          let indicator = nameCell.querySelector(".lock-indicator");
          if (!indicator) {
            indicator = document.createElement("span");
            indicator.className = "lock-indicator";
            nameCell.appendChild(indicator);
          }
          indicator.textContent = "\u270E " + firstName;
        }
        // Disable inputs/buttons
        row.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
      } else {
        row.classList.remove("row-locked");
        const nameCell = row.querySelector(".name-col");
        if (nameCell) {
          const indicator = nameCell.querySelector(".lock-indicator");
          if (indicator) indicator.remove();
        }
        // Re-enable inputs/buttons (respect row-inactive state and kladdeStatus)
        const isInactive = row.classList.contains("row-inactive");
        row.querySelectorAll("input, button").forEach((el) => {
          if (kladdeStatus >= 2) {
            // Abrechnung/Archiv: Gezahlt-Feld + Strafen (data-always-edit) aktiv
            el.disabled = !el.hasAttribute("data-paid-field") && !el.hasAttribute("data-always-edit");
          } else if (isInactive && el.hasAttribute("data-field") && !el.hasAttribute("data-always-edit")) {
            el.disabled = true;
          } else {
            el.disabled = false;
          }
        });
      }
    });
  }

  // Poll every 5 seconds
  setInterval(() => {
    fetch(`/kegelkladde/locks?gamedayId=${encodeURIComponent(gamedayId)}`)
      .then((r) => r.json())
      .then((data) => { if (data.locks) applyLocks(data.locks); })
      .catch(() => {});

    // Renew own lock if active
    if (currentLockedRow !== null) {
      sendLock(currentLockedRow);
    }
  }, 5000);

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if (currentLockedRow !== null) {
      const payload = JSON.stringify({ csrfToken, gamedayId, memberId: currentLockedRow });
      navigator.sendBeacon("/kegelkladde/unlock-row", new Blob([payload], { type: "application/json" }));
    }
  });
}

// Monte-Extrapunkt Radio-Button Handler
document.querySelectorAll(".monte-extra-radio").forEach((radio) => {
  radio.addEventListener("change", () => {
    updateMontePoints();
    if (!kladdeData || kladdeStatus > 1) return;
    const csrfToken = kladdeData.dataset.csrf;
    const gamedayId = kladdeData.dataset.gamedayId;
    const memberId = radio.value;

    showSaving();
    fetch("/kegelkladde/monte-extra", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken, gamedayId, memberId })
    })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) showSaved();
      else showToast(data.error || "Fehler beim Speichern", "error");
    })
    .catch(() => showToast("Fehler beim Speichern", "error"));
  });
});

// Ranglisten: Spieltag-Auswahl
const ranglistenSelect = document.getElementById("ranglistenGameday");
if (ranglistenSelect) {
  ranglistenSelect.addEventListener("change", () => {
    const val = ranglistenSelect.value;
    window.location = val ? "/ranglisten?gamedayId=" + encodeURIComponent(val) : "/ranglisten";
  });
}

// Ranglisten: Gesamt / Nur Spieltag Toggle
const ranglistenSingleDay = document.getElementById("ranglistenSingleDay");
if (ranglistenSingleDay && ranglistenSelect) {
  const dataEl = document.getElementById("ranglistenData");
  let rlData = null;
  try { rlData = JSON.parse(dataEl?.textContent || "null"); } catch {}

  function renderCrowns(wins) {
    return wins > 0 ? "\u{1F451}" + wins : "";
  }

  function rebuildChart(container, players, target) {
    if (!container || !players || players.length === 0) {
      if (container) container.innerHTML = '<div class="empty-state"><p>Keine Daten f\u00fcr diesen Spieltag.</p></div>';
      return;
    }
    const maxVal = Math.max(players[0].value, 1);
    const ceil = Math.max(maxVal, target);
    container.style.setProperty("--target-pct", (target / ceil) * 100 + "%");
    container.innerHTML = players.map((p, i) => {
      const pct = (p.value / ceil) * 100;
      return '<div class="hbar-row">' +
        '<div class="hbar-label"><span class="hbar-rank">' + (i + 1) + '</span><span class="hbar-name">' + p.name + '</span></div>' +
        '<div class="hbar-crowns">' + renderCrowns(p.wins) + '</div>' +
        '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;">' +
        '<div class="hbar-seg hbar-hl" style="flex:1;"></div>' +
        '<span class="hbar-inline-value">' + p.value + '</span></div>' +
        '<div class="hbar-target"></div></div></div>';
    }).join("");
  }

  function restoreOriginal() {
    // Reload page to restore server-rendered charts
    window.location.reload();
  }

  ranglistenSingleDay.addEventListener("change", () => {
    if (!rlData) return;
    const selectedId = Number(ranglistenSelect.value) || 0;
    if (!selectedId) {
      ranglistenSingleDay.checked = false;
      return;
    }

    if (ranglistenSingleDay.checked) {
      // Build single-day view
      const monteDay = rlData.monte
        .map(p => {
          const gd = p.perGameday.find(e => e.gamedayId === selectedId);
          return { name: p.name, wins: p.wins, value: gd ? gd.points : 0 };
        })
        .filter(p => p.value > 0)
        .sort((a, b) => b.value - a.value);

      const medaillenDay = rlData.medaillen
        .map(p => {
          const gd = p.perGameday.find(e => e.gamedayId === selectedId);
          return { name: p.name, wins: p.wins, value: gd ? gd.points : 0 };
        })
        .filter(p => p.value > 0)
        .sort((a, b) => b.value - a.value);

      const monteChart = document.querySelector("#tab-monte .hbar-chart");
      const medaillenChart = document.querySelector("#tab-medaillen .hbar-chart");
      const monteLegend = document.querySelector("#tab-monte .hbar-legend");
      const medaillenLegend = document.querySelector("#tab-medaillen .hbar-legend");
      if (monteLegend) monteLegend.style.display = "none";
      if (medaillenLegend) medaillenLegend.style.display = "none";

      rebuildChart(monteChart, monteDay, rlData.monteTarget);
      rebuildChart(medaillenChart, medaillenDay, rlData.medaillenTarget);
    } else {
      restoreOriginal();
    }
  });
}

// Ranglisten: Spieltage segmented-bar view
(function() {
  var dataEl = document.getElementById("ranglistenData");
  if (!dataEl) return;
  var rlData;
  try { rlData = JSON.parse(dataEl.textContent); } catch(e) { return; }
  if (!rlData || !rlData.gamedays) return;

  var ranglistenSelect = document.getElementById("ranglistenGameday");
  var ranglistenSingleDay = document.getElementById("ranglistenSingleDay");

  // Map gameday id → date string
  var gdDateMap = {};
  rlData.gamedays.forEach(function(gd) { gdDateMap[gd.id] = gd.date; });

  // Color palette (vivid, high-contrast, varied hues)
  var blockColors = [
    "#e63946", "#2a9d8f", "#e9a820", "#4361ee", "#f77f00",
    "#7b2d8e", "#06d6a0", "#d62828", "#457b9d", "#f4a261",
    "#6a4c93", "#1db954", "#ef476f", "#118ab2", "#ffd166",
    "#8338ec", "#06b6d4", "#ff6b35", "#2ec4b6", "#c1121f"
  ];
  function getBlockColor(idx) {
    return blockColors[idx % blockColors.length];
  }

  function renderCrownsLocal(wins) {
    return wins > 0 ? "\u{1F451}" + wins : "";
  }

  // Save original chart HTML for restoration
  var originalHTML = {};
  document.querySelectorAll(".tab-panel").forEach(function(panel) {
    var chart = panel.querySelector(".hbar-chart");
    if (chart) {
      originalHTML[panel.id] = chart.innerHTML;
    }
  });

  var spieltageActive = { monte: false, medaillen: false };

  // Track current sort per type
  var currentSort = { monte: null, medaillen: null };

  function renderTable(chart, players, target, type, sortByGd) {
    if (!chart) return;
    var filtered = players.filter(function(p) { return p.total > 0; });

    if (filtered.length === 0) {
      chart.innerHTML = '<div class="empty-state"><p>Keine Daten vorhanden.</p></div>';
      return;
    }

    // Collect ordered gameday IDs that actually have data
    var allGdIds = [];
    var gdIdSet = {};
    rlData.gamedays.forEach(function(gd) {
      filtered.forEach(function(p) {
        p.perGameday.forEach(function(pg) {
          if (pg.gamedayId === gd.id && !gdIdSet[gd.id]) {
            gdIdSet[gd.id] = true;
            allGdIds.push(gd.id);
          }
        });
      });
    });
    var gdColorIdx = {};
    allGdIds.forEach(function(id, i) { gdColorIdx[id] = i; });

    // Build per-player gameday lookup (needed for sorting)
    var pgMaps = {};
    filtered.forEach(function(p) {
      var m = {};
      p.perGameday.forEach(function(pg) { m[pg.gamedayId] = pg.points; });
      pgMaps[p.name] = m;
    });

    // Sort
    var sorted;
    if (sortByGd === '_carry') {
      sorted = filtered.slice().sort(function(a, b) { return (b.carryover || 0) - (a.carryover || 0) || b.total - a.total; });
    } else if (sortByGd === '_total') {
      sorted = filtered.slice().sort(function(a, b) { return b.total - a.total; });
    } else if (sortByGd) {
      sorted = filtered.slice().sort(function(a, b) {
        return (pgMaps[b.name][sortByGd] || 0) - (pgMaps[a.name][sortByGd] || 0) || b.total - a.total;
      });
    } else {
      sorted = filtered.slice().sort(function(a, b) { return b.total - a.total; });
    }

    // Check if any player has carryover
    var hasCarry = sorted.some(function(p) { return p.carryover > 0; });

    // Max points per gameday column (determines column width)
    var maxPerGd = {};
    allGdIds.forEach(function(gdId) { maxPerGd[gdId] = 0; });
    if (hasCarry) maxPerGd._carry = 0;
    sorted.forEach(function(p) {
      if (hasCarry && p.carryover > 0 && p.carryover > maxPerGd._carry) {
        maxPerGd._carry = p.carryover;
      }
      p.perGameday.forEach(function(pg) {
        if (pg.points > maxPerGd[pg.gamedayId]) {
          maxPerGd[pg.gamedayId] = pg.points;
        }
      });
    });

    // Sum of max values → proportional column widths
    var sumMax = 0;
    if (hasCarry) sumMax += maxPerGd._carry;
    allGdIds.forEach(function(gdId) { sumMax += maxPerGd[gdId]; });
    if (sumMax === 0) sumMax = 1;

    // Available width for data columns (subtract fixed info + crowns + total)
    var dataPct = 72; // % of table width for data columns

    // Build colgroup
    var colgroupHtml = '<colgroup>' +
      '<col class="st-col-info" style="width:145px;">' +
      '<col class="st-col-crowns" style="width:36px;">';
    if (hasCarry) {
      var cw = (maxPerGd._carry / sumMax) * dataPct;
      colgroupHtml += '<col style="width:' + cw + '%;">';
    }
    allGdIds.forEach(function(gdId) {
      var cw = (maxPerGd[gdId] / sumMax) * dataPct;
      colgroupHtml += '<col style="width:' + cw + '%;">';
    });
    colgroupHtml += '<col class="st-col-total" style="width:45px;"></colgroup>';

    // Build header row
    var theadHtml = '<thead><tr class="st-header">' +
      '<th></th><th></th>'; // info + crowns columns empty
    if (hasCarry) {
      var carryActive = sortByGd === '_carry' ? ' st-sort-active' : '';
      var carryLabel = '\u00dcbertrag' + (rlData.carryoverDate ? ', Stand ' + rlData.carryoverDate : '');
      theadHtml += '<th class="st-head-cell st-head-sortable' + carryActive + '" data-sort-col="_carry"><span class="st-head-label" style="background:#a8c4b0;">' + carryLabel + '</span></th>';
    }
    allGdIds.forEach(function(gdId) {
      var color = getBlockColor(gdColorIdx[gdId] || 0);
      var dateStr = gdDateMap[gdId] || '';
      var shortDate = dateStr.replace(/(\d{2})\.(\d{2})\.\d{2}(\d{2})/, '$1.$2.$3');
      var isActive = sortByGd === gdId ? ' st-sort-active' : '';
      theadHtml += '<th class="st-head-cell st-head-sortable' + isActive + '" data-sort-col="' + gdId + '"><span class="st-head-label" style="background:' + color + ';">' + shortDate + '</span></th>';
    });
    var totalActive = sortByGd === '_total' ? ' st-sort-active' : '';
    theadHtml += '<th class="st-head-cell st-head-sortable' + totalActive + '" data-sort-col="_total"><span class="st-head-label" style="background:#555;">\u03A3</span></th>';
    theadHtml += '</tr></thead>';

    // Build rows
    var rowsHtml = '';
    sorted.forEach(function(p, i) {
      var pgMap = pgMaps[p.name];

      // Busted gamedays as a fast lookup (only for monte)
      var bustedSet = {};
      if (type === 'monte' && p.busted) {
        p.busted.forEach(function(b) { bustedSet[b.gamedayId] = b.monte; });
      }

      // Present gamedays lookup
      var presentSet = {};
      if (p.presentGds) {
        p.presentGds.forEach(function(gdId) { presentSet[gdId] = true; });
      }

      var delay = i * 50;
      rowsHtml += '<tr style="animation-delay:' + delay + 'ms;">';
      rowsHtml += '<td class="st-info"><span class="hbar-rank">' + (i + 1) +
        '</span><span class="hbar-name">' + p.name + '</span></td>';
      rowsHtml += '<td class="st-crowns">' + renderCrownsLocal(p.wins) + '</td>';

      // Carryover column
      if (hasCarry) {
        if (p.carryover > 0) {
          var barW = (p.carryover / maxPerGd._carry) * 100;
          rowsHtml += '<td class="st-cell"><div class="st-bar" style="width:' + barW +
            '%;background:#a8c4b0;" title="\u00dcbertrag: ' + p.carryover + ' Pkt."><span class="st-bar-val">' + p.carryover + '</span></div></td>';
        } else {
          rowsHtml += '<td class="st-cell"></td>';
        }
      }

      // Gameday columns
      allGdIds.forEach(function(gdId) {
        var pts = pgMap[gdId] || 0;
        if (pts > 0) {
          var barW = (pts / maxPerGd[gdId]) * 100;
          var color = getBlockColor(gdColorIdx[gdId] || 0);
          var dateStr = gdDateMap[gdId] || '';
          var shortDate = dateStr.replace(/(\d{2})\.(\d{2})\.\d{2}(\d{2})/, '$1.$2.$3');
          rowsHtml += '<td class="st-cell"><div class="st-bar" data-gd="' + gdId +
            '" style="width:' + barW + '%;background:' + color +
            ';" title="' + shortDate + ': ' + pts + ' Pkt."><span class="st-bar-val">' + pts + '</span></div></td>';
        } else if (bustedSet[gdId] != null) {
          var mVal = bustedSet[gdId].toFixed(2).replace('.', ',');
          var bustTitle = bustedSet[gdId] === 0 ? 'Zahlt \u2013 0 geworfen' : '\u00fcber 2,00 \u20ac \u2013 busted!';
          rowsHtml += '<td class="st-cell st-busted" title="' + bustTitle + '"><img src="/sheep_dead.png" alt="" class="st-busted-sheep" /><span class="st-busted-val">' + mVal + '\u20ac</span></td>';
        } else if (!presentSet[gdId]) {
          rowsHtml += '<td class="st-cell st-absent"></td>';
        } else {
          rowsHtml += '<td class="st-cell"></td>';
        }
      });

      // Total column
      rowsHtml += '<td class="st-total"><span class="hbar-inline-value">' + p.total + '</span></td>';
      rowsHtml += '</tr>';
    });

    chart.innerHTML = '<table class="st-table">' + colgroupHtml +
      theadHtml + '<tbody>' + rowsHtml + '</tbody></table>';
    chart.classList.add("spieltage-view");

    // Click handler for sortable headers
    chart.querySelectorAll(".st-head-sortable").forEach(function(th) {
      th.addEventListener("click", function() {
        var col = th.getAttribute("data-sort-col");
        // Toggle: click same column again → reset to default (total)
        var newSort = (currentSort[type] === col) ? null : col;
        currentSort[type] = newSort;
        renderTable(chart, players, target, type, newSort);
      });
    });

    if (ranglistenSelect && ranglistenSelect.value) {
      applySegHighlight(chart, Number(ranglistenSelect.value));
    }
  }

  function applySegHighlight(chart, gdId) {
    var tbl = chart.querySelector(".st-table");
    if (!tbl) return;
    var bars = tbl.querySelectorAll(".st-bar[data-gd]");
    var hasMatch = false;
    bars.forEach(function(b) {
      if (Number(b.getAttribute("data-gd")) === gdId) {
        b.classList.add("seg-hl");
        hasMatch = true;
      } else {
        b.classList.remove("seg-hl");
      }
    });
    if (hasMatch) { tbl.classList.add("has-seg-hl"); }
    else { tbl.classList.remove("has-seg-hl"); }
  }

  function clearSegHighlight(chart) {
    var tbl = chart.querySelector(".st-table");
    if (!tbl) {
      chart.querySelectorAll(".has-seg-hl").forEach(function(t) { t.classList.remove("has-seg-hl"); });
      chart.querySelectorAll(".seg-hl").forEach(function(b) { b.classList.remove("seg-hl"); });
      return;
    }
    tbl.classList.remove("has-seg-hl");
    tbl.querySelectorAll(".seg-hl").forEach(function(b) { b.classList.remove("seg-hl"); });
  }

  // Toggle handlers
  document.querySelectorAll(".ranglisten-mode-toggle").forEach(function(toggle) {
    var panel = toggle.closest(".tab-panel");
    if (!panel) return;
    var type = panel.id === "tab-monte" ? "monte" : "medaillen";
    var hbarChart = panel.querySelector(".hbar-chart");
    var hbarLegend = panel.querySelector(".hbar-legend");

    toggle.querySelectorAll(".rmt-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var mode = btn.getAttribute("data-mode");
        toggle.querySelectorAll(".rmt-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");

        if (mode === "spieltage") {
          spieltageActive[type] = true;
          if (ranglistenSingleDay) ranglistenSingleDay.disabled = true;

          // Bars drift to the right
          if (hbarChart) {
            hbarChart.classList.add("exiting");
            hbarChart.classList.remove("entering");
          }
          if (hbarLegend) {
            hbarLegend.classList.add("exiting");
            hbarLegend.classList.remove("entering");
          }

          setTimeout(function() {
            if (hbarChart) hbarChart.classList.remove("exiting");
            if (hbarLegend) {
              hbarLegend.style.display = "none";
              hbarLegend.classList.remove("exiting");
            }
            // Render segmented bars (same row layout, bars split into gameday segments)
            renderTable(hbarChart, rlData[type],
              type === "monte" ? rlData.monteTarget : rlData.medaillenTarget, type);
          }, 300);

        } else {
          spieltageActive[type] = false;
          var otherType = type === "monte" ? "medaillen" : "monte";
          if (ranglistenSingleDay && !spieltageActive[otherType]) {
            ranglistenSingleDay.disabled = false;
          }

          // Segmented bars drift right, original bars grow back in
          if (hbarChart) {
            hbarChart.classList.add("exiting");
          }

          setTimeout(function() {
            if (hbarChart && originalHTML[panel.id]) {
              hbarChart.innerHTML = originalHTML[panel.id];
              hbarChart.classList.remove("spieltage-view", "exiting");
            }
            if (hbarLegend) {
              hbarLegend.style.display = "";
            }
          }, 300);
        }
      });
    });
  });

  // Override dropdown in spieltage mode
  if (ranglistenSelect) {
    ranglistenSelect.addEventListener("change", function(e) {
      var anyActive = spieltageActive.monte || spieltageActive.medaillen;
      if (anyActive) {
        e.stopImmediatePropagation();
        var gdId = Number(ranglistenSelect.value) || 0;
        ["monte", "medaillen"].forEach(function(type) {
          if (!spieltageActive[type]) return;
          var panel = document.getElementById("tab-" + type);
          var chart = panel ? panel.querySelector(".hbar-chart") : null;
          if (!chart) return;
          if (gdId) { applySegHighlight(chart, gdId); }
          else { clearSegHighlight(chart); }
        });
      }
    }, true);
  }
})();

// Celebration overlay for round wins
function showCelebration(items) {
  if (!items || items.length === 0) return;
  let index = 0;
  let repeatCount = 0;

  function showNext() {
    if (index >= items.length) {
      // Repeat up to 3 more times with a pause
      if (repeatCount < 3) {
        repeatCount++;
        index = 0;
        setTimeout(showNext, 6000);
      }
      return;
    }
    const item = items[index];
    index++;

    const emoji = item.type === "monte" ? "\uD83C\uDFC6" : "\uD83C\uDFC5";
    const typeLabel = item.type === "monte" ? "Monte" : "Medaillen";

    const overlay = document.createElement("div");
    overlay.className = "celebration-overlay";
    overlay.innerHTML =
      '<div class="celebration-card">' +
        '<div class="celebration-emoji">' + emoji + '</div>' +
        '<div class="celebration-title">' + typeLabel + ' \u2013 Runde ' + item.round + '</div>' +
        '<div class="celebration-winner">' + item.winner + '</div>' +
        '<div class="celebration-score">' + item.score + ' Punkte</div>' +
        '<div class="celebration-hint">Antippen zum Schlie\u00dfen</div>' +
      '</div>';

    document.body.appendChild(overlay);
    spawnConfetti();

    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      overlay.classList.add("celebration-out");
      setTimeout(() => {
        overlay.remove();
        showNext();
      }, 300);
    }

    overlay.addEventListener("click", dismiss);
    setTimeout(dismiss, 8000);
  }

  showNext();
}

function spawnConfetti() {
  const colors = ["#ffd700", "#ff6b6b", "#48dbfb", "#ff9ff3", "#54a0ff", "#5f27cd", "#2f8f6d", "#ee5a24"];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (Math.random() * 8 + 4) + "px";
    piece.style.height = (Math.random() * 12 + 6) + "px";
    piece.style.animationDuration = (Math.random() * 2 + 2) + "s";
    piece.style.animationDelay = (Math.random() * 1.5) + "s";
    piece.style.transform = "rotate(" + Math.random() * 360 + "deg)";
    document.body.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove());
  }
}

// Initialize server-side flash messages as toasts and cost display
document.addEventListener("DOMContentLoaded", () => {
  initCompactMode();
  initKladdeTabNav();
  initMobileByGame();
  initMobileCards();
  initEditLocks();
  initGamedayCosts();
  recalcCosts();
  const flashData = document.getElementById("flashData");
  if (flashData) {
    try {
      const flash = JSON.parse(flashData.textContent);
      if (flash && flash.message) {
        showToast(flash.message, flash.type || "success");
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Pinnwand lightbox
  const lightbox = document.getElementById("pinLightbox");
  const lightboxImg = document.getElementById("pinLightboxImg");
  if (lightbox && lightboxImg) {
    document.querySelectorAll(".pin-card-image").forEach((img) => {
      img.addEventListener("click", () => {
        lightboxImg.src = img.src;
        lightbox.style.display = "flex";
      });
    });
    lightbox.addEventListener("click", () => {
      lightbox.style.display = "none";
      lightboxImg.src = "";
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox.style.display === "flex") {
        lightbox.style.display = "none";
        lightboxImg.src = "";
      }
    });
  }

  // Pinnwand drag & rotate
  (function() {
    var board = document.querySelector(".pin-board");
    if (!board) return;
    var csrf = board.dataset.csrf;
    var currentUserId = board.dataset.userId;
    var cards = board.querySelectorAll(".pin-card");
    var zCounter = 10;

    function isOwn(card) {
      return card.dataset.ownerId === currentUserId;
    }

    // Assign random positions to cards without saved positions
    cards.forEach(function(card) {
      if (card.dataset.hasPos === "0") {
        var x = 5 + Math.random() * 60;
        var y = 5 + Math.random() * 70;
        var rot = (Math.random() - 0.5) * 6;
        card.style.left = x + "%";
        card.style.top = y + "%";
        card.style.transform = "rotate(" + rot + "deg)";
        card.dataset.hasPos = "1";
        // Only save if it's the user's own card
        if (isOwn(card)) savePosition(card, x, y, rot);
      }
    });

    // Ensure board is tall enough for all cards
    function ensureBoardHeight() {
      var maxBottom = 600;
      cards.forEach(function(card) {
        var top = card.offsetTop + card.offsetHeight + 20;
        if (top > maxBottom) maxBottom = top;
      });
      board.style.minHeight = maxBottom + "px";
    }
    setTimeout(ensureBoardHeight, 50);

    function savePosition(card, posX, posY, rotation) {
      var pinId = card.dataset.pinId;
      fetch("/pinnwand/position", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ csrfToken: csrf, pinId: pinId, posX: posX, posY: posY, rotation: rotation })
      });
    }

    function getRotation(card) {
      var st = card.style.transform;
      var m = st.match(/rotate\(([-\d.]+)deg\)/);
      return m ? parseFloat(m[1]) : 0;
    }

    function getPos(e) {
      if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    // --- DRAG ---
    var dragCard = null, dragOffsetX = 0, dragOffsetY = 0, dragMoved = false;

    function onDragStart(e) {
      var target = e.target;
      // Don't drag when clicking buttons, links, forms, inputs, or rotate handle
      if (target.closest("button, a, form, input, textarea, select, .pin-rotate-handle, .pin-ontop-handle")) return;
      // Don't drag when clicking on images (lightbox)
      if (target.closest(".pin-card-image")) return;
      var card = target.closest(".pin-card");
      if (!card || !isOwn(card)) return;

      e.preventDefault();
      dragCard = card;
      dragMoved = false;
      card.classList.add("dragging");
      zCounter++;
      card.style.zIndex = zCounter;

      var pos = getPos(e);
      var rect = card.getBoundingClientRect();
      dragOffsetX = pos.x - rect.left;
      dragOffsetY = pos.y - rect.top;
    }

    function onDragMove(e) {
      if (!dragCard) return;
      e.preventDefault();
      dragMoved = true;
      var pos = getPos(e);
      var boardRect = board.getBoundingClientRect();
      var x = pos.x - boardRect.left - dragOffsetX;
      var y = pos.y - boardRect.top - dragOffsetY;
      // Clamp to board bounds
      x = Math.max(0, Math.min(x, boardRect.width - dragCard.offsetWidth));
      y = Math.max(0, y);
      // Convert to percentage (left=% of width, top=% of height)
      var pctX = (x / boardRect.width) * 100;
      var pctY = (y / boardRect.height) * 100;
      dragCard.style.left = pctX + "%";
      dragCard.style.top = pctY + "%";
    }

    function onDragEnd() {
      if (!dragCard) return;
      dragCard.classList.remove("dragging");
      if (dragMoved) {
        var posX = parseFloat(dragCard.style.left);
        var posY = parseFloat(dragCard.style.top);
        var rot = getRotation(dragCard);
        savePosition(dragCard, posX, posY, rot);
        ensureBoardHeight();
      }
      dragCard = null;
    }

    // --- ROTATE ---
    var rotCard = null, rotStartAngle = 0, rotInitial = 0;

    function onRotateStart(e) {
      var handle = e.target.closest(".pin-rotate-handle");
      if (!handle) return;
      var card = handle.closest(".pin-card");
      if (!card || !isOwn(card)) return;
      e.preventDefault();
      e.stopPropagation();
      rotCard = card;
      rotInitial = getRotation(card);
      zCounter++;
      card.style.zIndex = zCounter;

      var pos = getPos(e);
      var rect = card.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      rotStartAngle = Math.atan2(pos.y - cy, pos.x - cx) * (180 / Math.PI);
    }

    function onRotateMove(e) {
      if (!rotCard) return;
      e.preventDefault();
      var pos = getPos(e);
      var rect = rotCard.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var angle = Math.atan2(pos.y - cy, pos.x - cx) * (180 / Math.PI);
      var delta = angle - rotStartAngle;
      var newRot = rotInitial + delta;
      rotCard.style.transform = "rotate(" + newRot + "deg)";
    }

    function onRotateEnd() {
      if (!rotCard) return;
      var rot = getRotation(rotCard);
      var posX = parseFloat(rotCard.style.left);
      var posY = parseFloat(rotCard.style.top);
      savePosition(rotCard, posX, posY, rot);
      rotCard = null;
    }

    // Mouse events
    board.addEventListener("mousedown", function(e) {
      if (e.target.closest(".pin-rotate-handle")) {
        onRotateStart(e);
      } else {
        onDragStart(e);
      }
    });
    document.addEventListener("mousemove", function(e) {
      if (rotCard) onRotateMove(e);
      else if (dragCard) onDragMove(e);
    });
    document.addEventListener("mouseup", function() {
      if (rotCard) onRotateEnd();
      else if (dragCard) onDragEnd();
    });

    // Touch events
    board.addEventListener("touchstart", function(e) {
      if (e.target.closest(".pin-rotate-handle")) {
        onRotateStart(e);
      } else {
        onDragStart(e);
      }
    }, { passive: false });
    document.addEventListener("touchmove", function(e) {
      if (rotCard) onRotateMove(e);
      else if (dragCard) onDragMove(e);
    }, { passive: false });
    document.addEventListener("touchend", function() {
      if (rotCard) onRotateEnd();
      else if (dragCard) onDragEnd();
    });

    // --- ON TOP ---
    board.addEventListener("click", function(e) {
      var btn = e.target.closest(".pin-ontop-handle");
      if (!btn) return;
      var card = btn.closest(".pin-card");
      if (!card || !isOwn(card)) return;
      zCounter++;
      card.style.zIndex = zCounter;
      card.classList.remove("pin-ontop");
      void card.offsetWidth;
      card.classList.add("pin-ontop");
    });

    // --- CARD STYLES ---
    var allStyleClasses = ['pin-style-polaroid','pin-style-vintage','pin-style-neon','pin-style-doodle','pin-style-frame','pin-style-dark','pin-style-glass','pin-style-wobble','pin-style-elegant','pin-style-retro','pin-style-tape','pin-style-shadow'];

    board.addEventListener("click", function(e) {
      var btn = e.target.closest(".pin-style-btn");
      if (!btn) return;
      var card = btn.closest(".pin-card");
      if (!card || !isOwn(card)) return;

      var style = btn.dataset.style;
      var pinId = card.dataset.pinId;

      // Remove all style classes
      allStyleClasses.forEach(function(cls) { card.classList.remove(cls); });
      // Apply new style
      if (style) card.classList.add("pin-style-" + style);

      // Update active button
      card.querySelectorAll(".pin-style-btn").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");

      // Save via AJAX
      fetch("/pinnwand/style", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ csrfToken: csrf, pinId: pinId, style: style })
      });
    });
  })();

  // Celebration for round wins
  const celebrateEl = document.getElementById("celebrateData");
  if (celebrateEl) {
    try {
      const items = JSON.parse(celebrateEl.textContent);
      if (items && items.length > 0) {
        setTimeout(() => showCelebration(items), 500);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Avatar upload: show preview + submit button
  const avatarInput = document.getElementById("avatarInput");
  const avatarSubmit = document.getElementById("avatarSubmit");
  const avatarPreview = document.getElementById("avatarPreview");
  if (avatarInput && avatarSubmit) {
    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files[0];
      if (!file) return;
      avatarSubmit.style.display = "";
      if (avatarPreview && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (avatarPreview.tagName === "IMG") {
            avatarPreview.src = e.target.result;
          } else {
            // Replace initials div with img
            const img = document.createElement("img");
            img.src = e.target.result;
            img.alt = "Avatar";
            img.className = "profil-avatar-img";
            img.id = "avatarPreview";
            avatarPreview.replaceWith(img);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Profile page: activate tab from hash
  if (window.location.hash) {
    const hash = window.location.hash.replace("#", "");
    const tabBtn = document.querySelector('.tab-btn[data-tab="' + hash + '"]');
    if (tabBtn) tabBtn.click();
  }

  // Member list: Drag & Drop reorder (admin only)
  initMemberDragDrop();

  // Copyable fields: click to copy
  document.querySelectorAll(".copyable").forEach(el => {
    el.addEventListener("click", () => {
      const text = el.textContent.trim();
      if (!text || text === "–") return;
      navigator.clipboard.writeText(text).then(() => {
        el.classList.add("copied");
        setTimeout(() => el.classList.remove("copied"), 1500);
      });
    });
  });
});

function initMemberDragDrop() {
  const memberLists = document.querySelectorAll(".member-grid");
  const orderForm = document.getElementById("orderForm");
  const orderInput = document.getElementById("memberOrder");
  if (!memberLists.length || !orderForm || !orderInput) return;

  let dragItem = null;

  memberLists.forEach(memberList => {
    memberList.querySelectorAll(".mcard[draggable]").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        dragItem = card;
        card.style.opacity = "0.5";
        e.dataTransfer.effectAllowed = "move";
      });

      card.addEventListener("dragend", () => {
        card.style.opacity = "";
        memberList.querySelectorAll(".mcard").forEach((c) => c.classList.remove("drag-over"));
        dragItem = null;
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragItem && dragItem !== card) {
          card.classList.add("drag-over");
        }
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over");
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        if (!dragItem || dragItem === card) return;

        const items = Array.from(memberList.querySelectorAll(".mcard"));
        const fromIdx = items.indexOf(dragItem);
        const toIdx = items.indexOf(card);

        if (fromIdx < toIdx) {
          card.after(dragItem);
        } else {
          card.before(dragItem);
        }

        // Auto-save new order
        saveMemberOrder();
      });
    });
  });

  function saveMemberOrder() {
    const ids = Array.from(document.querySelectorAll(".member-grid .mcard")).map((c) => c.dataset.id);
    orderInput.value = ids.join(",");
    // Submit via fetch for seamless UX
    const formData = new FormData(orderForm);
    fetch(orderForm.action, {
      method: "POST",
      body: formData
    })
    .then((r) => { if (r.ok) showToast("Reihenfolge gespeichert.", "success"); })
    .catch(() => showToast("Fehler beim Speichern der Reihenfolge.", "error"));
  }
}

// ==================== LIVE-MODUS ====================
(function initLiveMode() {
  const liveView = document.getElementById("liveView");
  const kladdeDataEl = document.getElementById("kladdeData");
  if (!liveView || !kladdeDataEl) return;

  const gameBtns = kladdeDataEl.querySelectorAll(".live-game-btn");
  if (gameBtns.length === 0) return;

  const btnClose = document.getElementById("btnLiveClose");
  const csrfToken = kladdeDataEl.dataset.csrf;
  const gamedayId = kladdeDataEl.dataset.gamedayId;

  const playersContainer = document.getElementById("livePlayers");
  const sidebarTitle = document.getElementById("liveSidebarTitle");
  const shuffleArea = document.getElementById("liveShuffle");
  const gameLabel = document.getElementById("liveGameLabel");
  const gameContent = document.getElementById("liveGameContent");
  const btnNext = document.getElementById("btnLiveNext");
  const btnPrev = document.getElementById("btnLivePrev");

  // =============================================
  // --- Live Effects (Fireworks, Confetti, Explosion) ---
  // =============================================
  var liveFx = (function() {
    var canvas = document.getElementById("liveFxCanvas");
    var ctx = canvas ? canvas.getContext("2d") : null;
    var animId = null;
    var stopTimer = null;
    var fwState = null; // fireworks state
    var burstParticles = []; // for confetti/explosion

    function rnd(min, max) { return Math.random() * (max - min) + min; }
    function dist(x1, y1, x2, y2) { var dx = x1-x2, dy = y1-y2; return Math.sqrt(dx*dx+dy*dy); }

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    // === FIREWORKS ===
    function FwRocket(sx, sy, tx, ty, hue) {
      this.x = sx; this.y = sy; this.sx = sx; this.sy = sy; this.tx = tx; this.ty = ty;
      this.distTotal = dist(sx, sy, tx, ty); this.distTraveled = 0;
      this.trail = []; for (var i = 0; i < 3; i++) this.trail.push([sx, sy]);
      this.angle = Math.atan2(ty - sy, tx - sx);
      this.speed = 2; this.accel = 1.05;
      this.hue = hue; this.brightness = rnd(50, 70);
      this.targetRadius = 1;
    }
    FwRocket.prototype.update = function() {
      this.trail.pop(); this.trail.unshift([this.x, this.y]);
      if (this.targetRadius < 8) this.targetRadius += 0.3; else this.targetRadius = 1;
      this.speed *= this.accel;
      var vx = Math.cos(this.angle) * this.speed, vy = Math.sin(this.angle) * this.speed;
      this.distTraveled = dist(this.sx, this.sy, this.x + vx, this.y + vy);
      if (this.distTraveled >= this.distTotal) return true; // explode
      this.x += vx; this.y += vy; return false;
    };
    FwRocket.prototype.draw = function(c) {
      c.beginPath();
      c.moveTo(this.trail[this.trail.length-1][0], this.trail[this.trail.length-1][1]);
      c.lineTo(this.x, this.y);
      c.strokeStyle = "hsl(" + this.hue + ",100%," + this.brightness + "%)";
      c.stroke();
      c.beginPath(); c.arc(this.tx, this.ty, this.targetRadius, 0, Math.PI * 2); c.stroke();
    };

    function FwSpark(x, y, hue) {
      this.x = x; this.y = y;
      this.trail = []; for (var i = 0; i < 5; i++) this.trail.push([x, y]);
      this.angle = rnd(0, Math.PI * 2);
      this.speed = rnd(1, 10);
      this.friction = 0.95; this.gravity = 1;
      this.hue = rnd(hue - 20, hue + 20);
      this.brightness = rnd(50, 80); this.alpha = 1;
      this.decay = rnd(0.015, 0.03);
    }
    FwSpark.prototype.update = function() {
      this.trail.pop(); this.trail.unshift([this.x, this.y]);
      this.speed *= this.friction;
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed + this.gravity;
      this.alpha -= this.decay;
      return this.alpha <= this.decay;
    };
    FwSpark.prototype.draw = function(c) {
      c.beginPath();
      c.moveTo(this.trail[this.trail.length-1][0], this.trail[this.trail.length-1][1]);
      c.lineTo(this.x, this.y);
      c.strokeStyle = "hsla(" + this.hue + ",100%," + this.brightness + "%," + this.alpha + ")";
      c.stroke();
    };

    // Fireworks state
    var fwActive = false;
    var fwRockets = [], fwSparks = [], fwHue = 120;
    var fwClickHandler = null;

    // Unified render loop — single animId for all effects
    var loopRunning = false;

    function fwExplode(x, y) {
      var count = Math.floor(rnd(25, 40));
      for (var i = 0; i < count; i++) fwSparks.push(new FwSpark(x, y, fwHue));
    }

    function ensureRenderLoop() {
      if (loopRunning) return;
      loopRunning = true;
      animId = requestAnimationFrame(renderLoop);
    }

    function renderLoop() {
      var cw = canvas.width, ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      var alive = false;

      // --- Fireworks ---
      if (fwActive || fwRockets.length > 0 || fwSparks.length > 0) {
        alive = true;
        fwHue += 0.5;
        ctx.globalCompositeOperation = "lighter";
        ctx.lineWidth = 2;
        for (var i = fwRockets.length - 1; i >= 0; i--) {
          fwRockets[i].draw(ctx);
          if (fwRockets[i].update()) { fwExplode(fwRockets[i].tx, fwRockets[i].ty); fwRockets.splice(i, 1); }
        }
        for (var j = fwSparks.length - 1; j >= 0; j--) {
          fwSparks[j].draw(ctx);
          if (fwSparks[j].update()) fwSparks.splice(j, 1);
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.lineWidth = 1;
      }

      // --- Burst particles (confetti + explosion) ---
      if (burstParticles.length > 0) {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        burstParticles.forEach(function(group) {
          if (group.confetti) {
            for (var ci = group.confetti.length - 1; ci >= 0; ci--) {
              group.confetti[ci].update(); group.confetti[ci].draw(ctx);
              if (group.confetti[ci].pos.y > ch) group.confetti.splice(ci, 1);
            }
          }
          if (group.sequins) {
            for (var si = group.sequins.length - 1; si >= 0; si--) {
              group.sequins[si].update(); group.sequins[si].draw(ctx);
              if (group.sequins[si].pos.y > ch) group.sequins.splice(si, 1);
            }
          }
          if (group.explosions) {
            for (var ei = group.explosions.length - 1; ei >= 0; ei--) {
              group.explosions[ei].draw(ctx);
              if (group.explosions[ei].update()) group.explosions.splice(ei, 1);
            }
          }
        });
        // Remove empty groups
        burstParticles = burstParticles.filter(function(g) {
          return (g.confetti && g.confetti.length > 0) ||
                 (g.sequins && g.sequins.length > 0) ||
                 (g.explosions && g.explosions.length > 0);
        });
        if (burstParticles.length > 0) alive = true;
        ctx.globalAlpha = 1;
      }

      if (alive) {
        animId = requestAnimationFrame(renderLoop);
      } else {
        loopRunning = false;
        animId = null;
      }
    }

    function startFireworks(duration) {
      if (!canvas || !ctx) return;
      // If already running, just reset timer
      if (fwActive) {
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
        if (duration) stopTimer = setTimeout(stopFireworks, duration);
        return;
      }
      resize();
      fwActive = true;
      fwRockets = []; fwSparks = []; fwHue = 120;
      var cw = canvas.width, ch = canvas.height;

      // Launch rockets on click/touch anywhere in liveView (passes through canvas)
      var parent = canvas.parentElement;
      fwClickHandler = function(e) {
        if (!fwActive) return;
        var cRect = canvas.getBoundingClientRect();
        var tx = (e.clientX || (e.touches && e.touches[0].clientX) || cRect.left + cw/2) - cRect.left;
        var ty = (e.clientY || (e.touches && e.touches[0].clientY) || cRect.top + ch/4) - cRect.top;
        var n = Math.floor(rnd(1, 4));
        for (var i = 0; i < n; i++) {
          fwRockets.push(new FwRocket(rnd(cw * 0.2, cw * 0.8), ch, tx + rnd(-30, 30), ty + rnd(-20, 20), fwHue));
        }
      };
      parent.addEventListener("click", fwClickHandler);
      parent.addEventListener("touchstart", fwClickHandler);

      // Initial salvo (3-5 rockets to random positions)
      var salvo = Math.floor(rnd(3, 6));
      for (var s = 0; s < salvo; s++) {
        (function(delay) {
          setTimeout(function() {
            if (fwActive) fwRockets.push(new FwRocket(rnd(cw*0.2, cw*0.8), ch, rnd(cw*0.1, cw*0.9), rnd(ch*0.1, ch*0.5), fwHue));
          }, delay);
        })(s * 200);
      }

      ensureRenderLoop();

      if (duration) {
        stopTimer = setTimeout(stopFireworks, duration);
      }
    }

    function stopFireworks() {
      fwActive = false; // render loop will drain remaining rockets/sparks
      if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
      if (fwClickHandler && canvas) {
        var parent = canvas.parentElement;
        parent.removeEventListener("click", fwClickHandler);
        parent.removeEventListener("touchstart", fwClickHandler);
        fwClickHandler = null;
      }
    }

    // === CONFETTI BURST (randomized count & velocity) ===
    function Confetto(x, y, power) {
      var colors = [
        { f: "#ffc107", b: "#e0a800" },
        { f: "#ff6f00", b: "#cc5900" },
        { f: "#ff1744", b: "#d50032" },
        { f: "#7b5cff", b: "#6245e0" },
        { f: "#00e676", b: "#00b85c" }
      ];
      this.color = colors[Math.floor(rnd(0, colors.length))];
      this.dim = { x: rnd(5, 10), y: rnd(8, 15) };
      this.pos = { x: x + rnd(-20, 20), y: y + rnd(-5, 5) };
      this.rotation = rnd(0, Math.PI * 2);
      this.scale = { x: 1, y: 1 };
      this.vel = { x: rnd(-9, 9) * power, y: -(rnd(6, 12) * power) };
      this.mod = rnd(0, 99);
    }
    Confetto.prototype.update = function() {
      this.vel.x -= this.vel.x * 0.075;
      this.vel.y = Math.min(this.vel.y + 0.3, 3);
      this.vel.x += Math.random() > 0.5 ? Math.random() : -Math.random();
      this.pos.x += this.vel.x; this.pos.y += this.vel.y;
      this.scale.y = Math.cos((this.pos.y + this.mod) * 0.09);
    };
    Confetto.prototype.draw = function(c) {
      var w = this.dim.x * this.scale.x, h = this.dim.y * this.scale.y;
      c.save();
      c.translate(this.pos.x, this.pos.y); c.rotate(this.rotation);
      c.fillStyle = this.scale.y > 0 ? this.color.f : this.color.b;
      c.fillRect(-w/2, -h/2, w, h);
      c.restore();
    };

    function Sequin(x, y, power) {
      var cols = ["#ffc107", "#ff6f00", "#7b5cff", "#00e676", "#ff1744"];
      this.color = cols[Math.floor(rnd(0, cols.length))];
      this.r = rnd(1, 3);
      this.pos = { x: x + rnd(-15, 15), y: y + rnd(-5, 5) };
      this.vel = { x: rnd(-6, 6) * power, y: rnd(-10, -6) * power };
    }
    Sequin.prototype.update = function() {
      this.vel.x -= this.vel.x * 0.02;
      this.vel.y += 0.55;
      this.pos.x += this.vel.x; this.pos.y += this.vel.y;
    };
    Sequin.prototype.draw = function(c) {
      c.fillStyle = this.color;
      c.beginPath(); c.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2); c.fill();
    };

    function confettiBurst(originEl) {
      if (!canvas || !ctx) return;
      resize();
      var rect = originEl.getBoundingClientRect();
      var cRect = canvas.getBoundingClientRect();
      var cx = rect.left + rect.width / 2 - cRect.left;
      var cy = rect.top + rect.height / 2 - cRect.top;
      var count = Math.floor(rnd(15, 40));
      var seqCount = Math.floor(rnd(8, 20));
      var power = rnd(0.7, 1.5);
      var pieces = [], seqs = [];
      for (var i = 0; i < count; i++) pieces.push(new Confetto(cx, cy, power));
      for (var j = 0; j < seqCount; j++) seqs.push(new Sequin(cx, cy, power));
      burstParticles.push({ confetti: pieces, sequins: seqs });
      ensureRenderLoop();
    }

    // === EXPLOSION BURST (radial particles at click point) ===
    function ExpParticle(x, y, palette) {
      var palettes = {
        accent:  ["#2f8f6d", "#5cb89a", "#1a5c44", "#8fd4b8"],
        gold:    ["#ffc107", "#ffca28", "#ff8f00", "#fff176"],
        blue:    ["#007bff", "#42a5f5", "#1565c0", "#90caf9"],
        brown:   ["#795548", "#a1887f", "#4e342e", "#bcaaa4"],
        purple:  ["#7b5cff", "#b388ff", "#4a148c", "#ce93d8"],
        red:     ["#e53935", "#ef5350", "#b71c1c", "#ef9a9a"]
      };
      var cols = palettes[palette] || palettes.accent;
      this.x = x; this.y = y;
      this.color = cols[Math.floor(rnd(0, cols.length))];
      var angle = rnd(0, Math.PI * 2);
      var speed = rnd(2, 12);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.r = rnd(2, 6);
      this.alpha = 1;
      this.decay = rnd(0.015, 0.04);
      this.gravity = 0.15;
    }
    ExpParticle.prototype.update = function() {
      this.vx *= 0.96; this.vy *= 0.96;
      this.vy += this.gravity;
      this.x += this.vx; this.y += this.vy;
      this.alpha -= this.decay;
      return this.alpha <= 0;
    };
    ExpParticle.prototype.draw = function(c) {
      c.globalAlpha = Math.max(0, this.alpha);
      c.fillStyle = this.color;
      c.beginPath(); c.arc(this.x, this.y, this.r, 0, Math.PI * 2); c.fill();
    };

    function explosion(originEl, palette, count) {
      if (!canvas || !ctx) return;
      resize();
      var rect = originEl.getBoundingClientRect();
      var cRect = canvas.getBoundingClientRect();
      var cx = rect.left + rect.width / 2 - cRect.left;
      var cy = rect.top + rect.height / 2 - cRect.top;
      count = count || Math.floor(rnd(20, 50));
      var exps = [];
      for (var i = 0; i < count; i++) exps.push(new ExpParticle(cx, cy, palette));
      burstParticles.push({ explosions: exps });
      ensureRenderLoop();
    }

    function stopAll() {
      // Stop fireworks properly (remove click handlers)
      stopFireworks();
      fwRockets = []; fwSparks = [];
      // Stop burst particles
      burstParticles = [];
      // Stop render loop
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      loopRunning = false;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function warmup() {
      if (!canvas || !ctx) return;
      resize();
      // Run one invisible frame of each effect type to JIT-compile the code paths
      var cw = canvas.width, ch = canvas.height;
      burstParticles.push({ confetti: [new Confetto(cw/2, ch/2, 0.1)], startTime: Date.now() });
      burstParticles.push({ explosions: [new ExpParticle(cw/2, ch/2, "brown")] });
      fwRockets.push(new FwRocket(cw/2, ch, cw/2, ch/2, 0));
      fwSparks.push(new FwSpark(cw/2, ch/2, 0));
      // Render one frame then clear
      renderLoop();
      loopRunning = false;
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      fwRockets = []; fwSparks = []; burstParticles = [];
      ctx.clearRect(0, 0, cw, ch);
    }

    return {
      fireworks: startFireworks,
      confetti: confettiBurst,
      explosion: explosion,
      stop: stopAll,
      warmup: warmup
    };
  })();

  // =============================================
  // --- Unified Controls Panel (liveControls) ---
  // =============================================
  var liveControls = {
    mode: null,       // "volle" | "abraeumen" | null
    opts: null,       // callbacks and state for current mode
    _keyHandler: null,

    // Render Volle picker into shuffleArea (RIGHT side)
    renderVolle: function(opts) {
      // opts: { onPick(val, marker, btn), onUndo(), canUndo: bool, headerHtml?: string }
      this.mode = "volle";
      this.opts = opts;
      var html = '<div class="va-phase-container">';
      if (opts.headerHtml) html += opts.headerHtml;
      html += renderVAPicker();
      html += '<div class="va-actions-row">';
      html += '<button type="button" class="va-picker-btn va-picker-clear va-actions-undo" id="liveCtrlUndo"' + (opts.canUndo ? '' : ' disabled') + '>\u00D7 R\u00fcckg\u00e4ngig</button>';
      html += '</div>';
      html += '</div>';
      shuffleArea.innerHTML = html;
      this._attachVolleHandlers();
    },

    // Render Abräumen pin diamond into shuffleArea (RIGHT side)
    renderAbraeumen: function(opts) {
      // opts: { onConfirm(fallenPins), onUndo(), onInvert(), canUndo, canInvert, fallenCount, throwNum, headerHtml?: string }
      this.mode = "abraeumen";
      this.opts = opts;
      var html = '<div class="va-phase-container">';
      if (opts.headerHtml) {
        html += opts.headerHtml;
      } else {
        html += '<div class="va-abraeumen-throw-num">Wurf ' + (opts.throwNum || 1) + '<span class="va-abraeumen-throw-total"> / 5</span></div>';
      }
      html += renderPinDiamond();
      html += '<div class="va-abraeumen-actions">';
      html += '<span class="va-fallen-count" id="vaFallenCount">Getroffen: ' + (opts.fallenCount || 0) + '</span>';
      html += '<button type="button" class="va-invert-btn" id="vaInvertBtn"' + (opts.canInvert ? '' : ' disabled') + '>Invertieren \u21C4</button>';
      html += '<button type="button" class="va-confirm-throw" id="vaConfirmThrow">Wurf best\u00e4tigen \u2713</button>';
      html += '</div>';
      html += '<div class="va-actions-row">';
      html += '<button type="button" class="va-picker-clear va-actions-undo" id="liveCtrlUndo"' + (opts.canUndo ? '' : ' disabled') + '>\u00D7 R\u00fcckg\u00e4ngig</button>';
      html += '</div>';
      html += '</div>';
      shuffleArea.innerHTML = html;
      this._attachAbraeumenHandlers();
    },

    // Clear controls panel
    clear: function() {
      this.mode = null;
      this.opts = null;
      this._removeKeyHandler();
      shuffleArea.innerHTML = '';
    },

    // Highlight a picker button as "active" (used by Monte's two-step flow)
    highlightPick: function(value) {
      shuffleArea.querySelectorAll(".va-picker-btn").forEach(function(b) {
        b.classList.remove("monte-picker-active");
      });
      if (value != null) {
        var pickVal;
        if (value === 12) pickVal = "kranz";
        else if (value === 9) pickVal = "9er";
        else pickVal = String(value);
        var btn = shuffleArea.querySelector('.va-picker-btn[data-va-pick="' + pickVal + '"]');
        if (btn) btn.classList.add("monte-picker-active");
      }
    },

    _attachVolleHandlers: function() {
      var self = this;
      this._removeKeyHandler();

      // Click handlers on picker buttons
      shuffleArea.querySelectorAll(".va-picker-btn[data-va-pick]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var val = btn.dataset.vaPick;
          if (val === "clear") {
            if (self.opts.onUndo) self.opts.onUndo();
            return;
          }
          var throwVal, marker;
          if (val === "pudel") { throwVal = 0; marker = "pudel"; }
          else if (val === "triclops") { throwVal = 3; marker = "triclops"; }
          else if (val === "9er") { throwVal = 9; marker = "alle9"; }
          else if (val === "kranz") { throwVal = 12; marker = "kranz"; }
          else { throwVal = Number(val); marker = null; }
          if (self.opts.onPick) self.opts.onPick(throwVal, marker, btn);
        });
      });

      // Undo button
      var undoBtn = document.getElementById("liveCtrlUndo");
      if (undoBtn) undoBtn.addEventListener("click", function() {
        if (self.opts.onUndo) self.opts.onUndo();
      });

      // Keyboard 0-9, K
      this._installKeyHandler();
    },

    _attachAbraeumenHandlers: function() {
      var self = this;
      this._removeKeyHandler();

      // Pin toggle (only standing pins are clickable)
      shuffleArea.querySelectorAll(".pin-btn.pin-standing").forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (btn.classList.contains("pin-selected")) {
            btn.classList.remove("pin-selected");
            btn.classList.add("pin-standing");
          } else {
            btn.classList.remove("pin-standing");
            btn.classList.add("pin-selected");
          }
          updateFallenCount();
        });
      });

      // Invert button
      var invertBtn = document.getElementById("vaInvertBtn");
      if (invertBtn) {
        invertBtn.addEventListener("click", function() {
          shuffleArea.querySelectorAll(".pin-btn").forEach(function(btn) {
            if (btn.classList.contains("pin-selected")) {
              btn.classList.remove("pin-selected");
              btn.classList.add("pin-standing");
            } else if (btn.classList.contains("pin-standing")) {
              btn.classList.remove("pin-standing");
              btn.classList.add("pin-selected");
            }
          });
          updateFallenCount();
        });
      }

      // Confirm button
      var confirmBtn = document.getElementById("vaConfirmThrow");
      if (confirmBtn) {
        confirmBtn.addEventListener("click", function() {
          var fallenPins = [];
          shuffleArea.querySelectorAll(".pin-btn.pin-selected").forEach(function(btn) {
            fallenPins.push(Number(btn.dataset.pin));
          });
          if (self.opts.onConfirm) self.opts.onConfirm(fallenPins);
        });
      }

      // Undo button
      var undoBtn = document.getElementById("liveCtrlUndo");
      if (undoBtn) undoBtn.addEventListener("click", function() {
        if (self.opts.onUndo) self.opts.onUndo();
      });
    },

    _installKeyHandler: function() {
      var self = this;
      this._removeKeyHandler();
      this._keyHandler = function(e) {
        if (self.mode !== "volle") return;
        if (e.key >= "0" && e.key <= "9") {
          e.preventDefault();
          var btn;
          if (e.key === "9") {
            btn = shuffleArea.querySelector('.va-picker-btn[data-va-pick="9er"]');
          } else {
            btn = shuffleArea.querySelector('.va-picker-btn[data-va-pick="' + e.key + '"]');
          }
          if (btn) btn.click();
        } else if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          var kBtn = shuffleArea.querySelector('.va-picker-btn[data-va-pick="kranz"]');
          if (kBtn) kBtn.click();
        }
      };
      document.addEventListener("keydown", this._keyHandler);
    },

    _removeKeyHandler: function() {
      if (this._keyHandler) {
        document.removeEventListener("keydown", this._keyHandler);
        this._keyHandler = null;
      }
    }
  };

  let players = []; // [{id, name, avatar, row}]
  let currentGameIdx = 0;
  let gameHistory = [];   // Stack of visited game indices for back-navigation
  let monteState = {}; // { rounds: {userId: {round: value}}, questionValue, totals }
  let monteOverrides = {}; // { userId: eurValue } - manuelle Überschreibungen
  let activePicker = null;

  // Shuffle + Turn state
  let gameOrder = [];       // Gemischte Spieler-Reihenfolge [{id, name, avatar, row}]
  let gameOrderOriginal = []; // Original-Reihenfolge (IDs) nach Shuffle, für Pinkelpause-Rückkehr
  let currentTurnIdx = 0;
  let pinklerSlots = [];    // [{playerId}]

  // V+A state
  let vaState = {
    phase: "volle",           // "volle" | "abraeumen" | "done"
    currentThrow: 0,          // 0-4
    volleThrows: [],          // [{val, marker}, ...] per player
    abraeumenThrows: [],      // [{fallen: [pinIds], count: n}, ...]
    standingPins: [1,2,3,4,5,6,7,8,9],
    results: {},              // {playerId: {volle, abraeumen, total}}
    directEntry: false        // toggle for shortcut mode
  };

  // Aussteigen state
  let aussteigenState = {
    remaining: [],
    eliminated: [],           // [[{id, round, cumTotal}]] groups per round
    currentRound: 1,
    currentPlayerIdx: 0,      // index into remaining[]
    roundThrows: {},          // {playerId: {val, marker}} for current round
    throwHistory: [],         // [{playerId, val, marker}] for undo
    allThrows: [],            // [{playerId, round, val, marker}] persistent across rounds for throw-log
    cumulativeTotals: {},     // {playerId: runningSum} across all rounds
    roundSnapshots: [],       // [{position, cumulatives: {id: total}, eliminatedIds: []}]
    currentPosition: 0,       // cost-column index the current round maps to
    costs: null
  };

  // 6-Tage-Rennen state
  let sechsTageState = {
    teams: [],          // [{ p1: playerObj, p2: playerObj|null, throws: {} }]
    currentDay: 1,      // aktueller Tag (1-6)
    currentTeamIdx: 0,  // aktuelles Team
    currentSlot: 1      // 1 = P1, 2 = P2
  };

  // --- Throw-Log: Einzelwürfe in DB speichern ---
  function saveThrowLog(gameType, throws) {
    if (!kladdeData || !throws.length) return;
    fetch("/kegelkladde/throw-log", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": kladdeData.dataset.csrf },
      body: JSON.stringify({
        csrfToken: kladdeData.dataset.csrf,
        gamedayId: kladdeData.dataset.gamedayId,
        gameType: gameType,
        throws: throws
      }),
      keepalive: true
    }).catch(function() {});
  }

  // --- Live State Persistence (sessionStorage) ---
  var liveStateKey = "liveState_" + gamedayId;

  function saveLiveState() {
    var game = GAMES[currentGameIdx];
    if (!game || (game.type !== "va" && game.type !== "aussteigen" && game.type !== "monte" && game.type !== "sechs_tage")) return;
    if (game.type === "monte") { saveMonteState(); return; }
    if (!gameOrder.length || currentTurnIdx < 0) return;

    var state = {
      version: 1,
      timestamp: Date.now(),
      gameType: game.type,
      playerIds: players.map(function(p) { return p.id; }),
      gameOrderIds: gameOrder.map(function(p) { return p.id; }),
      gameOrderOriginalIds: gameOrderOriginal.slice(),
      currentGameIdx: currentGameIdx,
      gameHistory: gameHistory.slice(),
      currentTurnIdx: currentTurnIdx,
      pinklerSlots: pinklerSlots.slice()
    };

    if (game.type === "va") {
      state.vaState = {
        phase: vaState.phase,
        round: vaState.round,
        currentThrow: vaState.currentThrow,
        volleThrows: vaState.volleThrows.slice(),
        abraeumenThrows: vaState.abraeumenThrows.slice(),
        standingPins: vaState.standingPins.slice(),
        results: JSON.parse(JSON.stringify(vaState.results)),
        directEntry: vaState.directEntry,
        throwHistory: JSON.parse(JSON.stringify(vaState.throwHistory || {}))
      };
    } else if (game.type === "aussteigen") {
      state.aussteigenState = {
        remainingIds: aussteigenState.remaining.map(function(p) { return p.id; }),
        eliminated: JSON.parse(JSON.stringify(aussteigenState.eliminated)),
        currentRound: aussteigenState.currentRound,
        currentPlayerIdx: aussteigenState.currentPlayerIdx,
        roundThrows: JSON.parse(JSON.stringify(aussteigenState.roundThrows)),
        throwHistory: JSON.parse(JSON.stringify(aussteigenState.throwHistory)),
        allThrows: JSON.parse(JSON.stringify(aussteigenState.allThrows)),
        cumulativeTotals: JSON.parse(JSON.stringify(aussteigenState.cumulativeTotals)),
        roundSnapshots: JSON.parse(JSON.stringify(aussteigenState.roundSnapshots)),
        currentPosition: aussteigenState.currentPosition
      };
    } else if (game.type === "sechs_tage") {
      state.sechsTageState = {
        teamData: sechsTageState.teams.map(function(t) {
          return {
            p1Id: t.p1.id,
            p2Id: t.p2 ? t.p2.id : null,
            throws: JSON.parse(JSON.stringify(t.throws))
          };
        }),
        currentDay: sechsTageState.currentDay,
        currentTeamIdx: sechsTageState.currentTeamIdx,
        currentSlot: sechsTageState.currentSlot
      };
    }

    try { sessionStorage.setItem(liveStateKey, JSON.stringify(state)); } catch(e) {}
  }

  function clearLiveState() {
    try { sessionStorage.removeItem(liveStateKey); } catch(e) {}
  }

  function restoreLiveState() {
    var raw;
    try { raw = sessionStorage.getItem(liveStateKey); } catch(e) { return; }
    if (!raw) return;

    var state;
    try { state = JSON.parse(raw); } catch(e) { clearLiveState(); return; }
    if (!state || state.version !== 1) { clearLiveState(); return; }

    // Rebuild players from DOM (present players)
    var table = document.querySelector(".kladde-table:not(.kladde-preview)");
    if (!table) { clearLiveState(); return; }

    var presentMap = {};
    table.querySelectorAll("tbody tr[data-member-id]").forEach(function(row) {
      var cb = row.querySelector("[data-present]");
      if (cb && cb.checked) {
        var nameEl = row.querySelector(".name-col");
        var name = nameEl && nameEl.dataset.name ? nameEl.dataset.name : (nameEl ? nameEl.textContent.trim().split("\n")[0].trim() : "?");
        var avatarImg = row.querySelector(".kladde-avatar");
        var avatar = avatarImg ? avatarImg.src : null;
        presentMap[row.dataset.memberId] = { id: row.dataset.memberId, name: name, avatar: avatar, row: row };
      }
    });

    // Validate all saved player IDs are still present
    for (var i = 0; i < state.playerIds.length; i++) {
      if (!presentMap[state.playerIds[i]]) { clearLiveState(); return; }
    }
    for (var j = 0; j < state.gameOrderIds.length; j++) {
      if (!presentMap[state.gameOrderIds[j]]) { clearLiveState(); return; }
    }

    // Rebuild player arrays with DOM refs
    players = state.playerIds.map(function(id) { return presentMap[id]; });
    gameOrder = state.gameOrderIds.map(function(id) { return presentMap[id]; });
    gameOrderOriginal = state.gameOrderOriginalIds || state.gameOrderIds.slice();

    // Restore navigation state
    currentGameIdx = state.currentGameIdx;
    gameHistory = state.gameHistory || [];
    currentTurnIdx = state.currentTurnIdx;
    pinklerSlots = state.pinklerSlots || [];

    // Restore game-specific state
    var game = GAMES[currentGameIdx];
    if (!game) { clearLiveState(); return; }

    if (game.type === "va" && state.vaState) {
      vaState = {
        phase: state.vaState.phase,
        round: state.vaState.round,
        currentThrow: state.vaState.currentThrow,
        volleThrows: state.vaState.volleThrows,
        abraeumenThrows: state.vaState.abraeumenThrows,
        standingPins: state.vaState.standingPins,
        results: state.vaState.results,
        directEntry: state.vaState.directEntry,
        throwHistory: state.vaState.throwHistory || {}
      };
    } else if (game.type === "aussteigen" && state.aussteigenState) {
      var as = state.aussteigenState;
      aussteigenState = {
        remaining: as.remainingIds.map(function(id) { return presentMap[id]; }),
        eliminated: as.eliminated,
        currentRound: as.currentRound,
        currentPlayerIdx: as.currentPlayerIdx || 0,
        roundThrows: as.roundThrows || {},
        throwHistory: as.throwHistory || [],
        allThrows: as.allThrows || [],
        cumulativeTotals: as.cumulativeTotals || {},
        roundSnapshots: as.roundSnapshots || [],
        currentPosition: as.currentPosition || 0,
        costs: null
      };
    } else if (game.type === "monte" && state.monteLive) {
      // Monte restores its data from server; just restore turn state
      // monteLive: { pickedValue, editMode }
      // actual monteState.rounds will be fetched from server in renderMonteGame()
    } else if (game.type === "sechs_tage" && state.sechsTageState) {
      var std = state.sechsTageState;
      sechsTageState.teams = std.teamData.map(function(td) {
        return {
          p1: presentMap[td.p1Id],
          p2: td.p2Id ? presentMap[td.p2Id] : null,
          throws: td.throws
        };
      });
      sechsTageState.currentDay = std.currentDay;
      sechsTageState.currentTeamIdx = std.currentTeamIdx;
      sechsTageState.currentSlot = std.currentSlot;
    } else {
      clearLiveState();
      return;
    }

    // Activate live view DOM
    renderSidebar();
    var tableShell = kladdeDataEl.querySelector(".table-shell");
    if (tableShell) tableShell.style.display = "none";
    var gamedayNav = document.getElementById("gamedayNav");
    if (gamedayNav) gamedayNav.style.display = "none";
    var guestActions = kladdeDataEl.parentElement.querySelector(".guest-actions");
    if (guestActions) guestActions.style.display = "none";
    var kladdeFooter = kladdeDataEl.parentElement.querySelector(".kladde-footer");
    if (kladdeFooter) kladdeFooter.style.display = "none";
    liveView.style.display = "flex";

    // Set up shuffle sidebar
    sidebarTitle.textContent = game.label;
    gameLabel.textContent = game.label;

    if (game.type === "monte") {
      // Monte builds its own sidebar via renderMonteGame()
      // We need to restore turn state after fetch completes
      var savedMonteLive = state.monteLive;
      var savedTurnIdx = currentTurnIdx;
      liveView.classList.add("live-shuffle-sidebar");
      shuffleArea.style.display = ""; // Clear inline style so CSS flex rule takes effect
      gameContent.innerHTML = '<div class="live-loading">Lade Monte-Daten...</div>';
      fetch("/kegelkladde/monte-rounds?gamedayId=" + encodeURIComponent(gamedayId))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          monteState = {
            rounds: {},
            questionValue: data.questionValue,
            totals: data.totals || {},
            extraWinnerId: data.extraWinnerId,
            complete: !!data.complete,
            pickedValue: savedMonteLive.pickedValue,
            editMode: savedMonteLive.editMode,
            lastPlacement: null
          };
          monteOverrides = {};
          for (var i = 0; i < (data.rounds || []).length; i++) {
            var r = data.rounds[i];
            if (!monteState.rounds[r.user_id]) monteState.rounds[r.user_id] = {};
            monteState.rounds[r.user_id][r.round_number] = r.roll_value;
          }
          players.forEach(function(p) {
            var monteInput = p.row.querySelector('[name="monte_' + p.id + '"]');
            if (monteInput) {
              var kladdeZehntel = Number(monteInput.value) || 0;
              var kladdeEur = kladdeZehntel / 10;
              var calcEur = monteState.totals[p.id] || 0;
              if (Math.abs(kladdeEur - calcEur) > 0.001 && kladdeZehntel > 0) {
                monteOverrides[p.id] = kladdeEur;
              }
            }
          });
          currentTurnIdx = savedTurnIdx;
          buildMonteSidebar();
          renderMontePlayerUI();
        })
        .catch(function() {
          gameContent.innerHTML = '<div class="live-loading">Fehler beim Laden.</div>';
        });
    } else {
      liveView.classList.add("live-shuffle-sidebar");
      shuffleArea.style.display = ""; // Clear inline style so CSS flex rule takes effect
      // V+A, Aussteigen, 6-Tage: each builds its own main + controls layout.
      addSidebarPinkelpause();
    }

    // Render the correct game phase
    if (game.type === "va") {
      if (currentTurnIdx >= gameOrder.length && vaState.round === "abraeumen") {
        renderVAResults();
      } else {
        renderVAPlayerUI();
        updateShuffleHighlight(currentTurnIdx);
      }
    } else if (game.type === "aussteigen") {
      if (aussteigenState.remaining.length <= 1) {
        renderAussteigenResults();
      } else {
        renderAussteigenUI();
      }
    } else if (game.type === "sechs_tage") {
      renderSechsTageUI();
    }

    showToast("Live-Modus fortgesetzt", "info");
  }

  // Build GAMES array from DOM
  function buildGames() {
    const games = [
      { key: "va", label: "V+A", type: "va" },
      { key: "monte", label: "Monte", type: "monte" },
      { key: "aussteigen", label: "Aussteigen", type: "aussteigen" },
      { key: "sechs_tage", label: "6-Tage-Rennen", type: "sechs_tage" }
    ];
    // Custom games
    const table = document.querySelector(".kladde-table:not(.kladde-preview)");
    if (table) {
      table.querySelectorAll("th[data-custom-game-th]").forEach(th => {
        const cgId = th.dataset.customGameTh;
        const nameInput = th.querySelector("[data-custom-game-rename]");
        const name = nameInput ? nameInput.value : "Spiel";
        games.push({ key: "cg_" + cgId, label: name, type: "custom", cgId, skipShuffle: true });
      });
    }
    return games;
  }

  const GAMES = buildGames();

  // --- Open / Close ---
  function openLiveMode(startGameKey) {
    // Collect present players
    players = [];
    const table = document.querySelector(".kladde-table:not(.kladde-preview)");
    if (!table) return;
    table.querySelectorAll("tbody tr[data-member-id]").forEach(row => {
      const cb = row.querySelector("[data-present]");
      if (cb && cb.checked) {
        const nameEl = row.querySelector(".name-col");
        const name = nameEl?.dataset.name || (nameEl ? nameEl.textContent.trim().split("\n")[0].trim() : "?");
        const avatarImg = row.querySelector(".kladde-avatar");
        const avatar = avatarImg ? avatarImg.src : null;
        players.push({ id: row.dataset.memberId, name, avatar, row });
      }
    });

    if (players.length === 0) {
      showToast("Keine anwesenden Spieler.", "warning");
      return;
    }

    renderSidebar();
    liveFx.warmup();

    // Gewähltes Spiel direkt ansteuern
    if (startGameKey) {
      const idx = GAMES.findIndex(g => g.key === startGameKey);
      if (idx !== -1) {
        currentGameIdx = idx;
        renderCurrentGame();
      } else {
        currentGameIdx = 0;
        showGameSelector();
      }
    } else {
      currentGameIdx = GAMES.findIndex(g => !isGamePlayed(g));
      if (currentGameIdx === -1) {
        currentGameIdx = 0;
        showGameSelector();
      } else {
        renderCurrentGame();
      }
    }

    const tableShell = kladdeDataEl.querySelector(".table-shell");
    if (tableShell) tableShell.style.display = "none";
    const gamedayNav = document.getElementById("gamedayNav");
    if (gamedayNav) gamedayNav.style.display = "none";
    var guestActions = kladdeDataEl.parentElement.querySelector(".guest-actions");
    if (guestActions) guestActions.style.display = "none";
    var kladdeFooter = kladdeDataEl.parentElement.querySelector(".kladde-footer");
    if (kladdeFooter) kladdeFooter.style.display = "none";
    liveView.style.display = "flex";
  }

  function closeLiveMode(opts) {
    if (!opts || !opts.keepState) clearLiveState();
    closePicker();
    hideMonteCursor();
    liveFx.stop();
    liveControls.clear();
    liveView.style.display = "none";
    sidebarTitle.textContent = "Live-Modus";
    shuffleArea.style.display = "none";
    playersContainer.style.display = "";
    liveView.classList.remove("live-shuffle-active");
    liveView.classList.remove("live-shuffle-sidebar");
    removeSidebarPinkelpause();
    const tableShell = kladdeDataEl.querySelector(".table-shell");
    if (tableShell) tableShell.style.display = "";
    const gamedayNav = document.getElementById("gamedayNav");
    if (gamedayNav) gamedayNav.style.display = "";
    var guestActions = kladdeDataEl.parentElement.querySelector(".guest-actions");
    if (guestActions) guestActions.style.display = "";
    var kladdeFooter = kladdeDataEl.parentElement.querySelector(".kladde-footer");
    if (kladdeFooter) kladdeFooter.style.display = "";
    recalcCosts();
    updateGameBtnStates();
    // Pulse the active live button if state was preserved
    if (opts && opts.keepState) highlightActiveLiveBtn();
  }

  function addSidebarPinkelpause() {
    removeSidebarPinkelpause();
    var game = GAMES[currentGameIdx];
    if (game && game.type === "monte") return; // No pinkelpause for Monte
    var header = liveView.querySelector(".live-sidebar-header");
    if (!header) return;
    var closeBtn = header.querySelector(".live-close-btn");
    var pinkBtn = document.createElement("button");
    pinkBtn.type = "button";
    pinkBtn.className = "pinkelpause-sidebar-btn";
    pinkBtn.id = "pinkelpauseSidebarBtn";
    pinkBtn.title = "Pinkelpause";
    pinkBtn.innerHTML = '<img src="/pee.png" alt="Pinkelpause" class="pinkelpause-img" />';
    if (closeBtn) {
      header.insertBefore(pinkBtn, closeBtn);
    } else {
      header.appendChild(pinkBtn);
    }
    pinkBtn.addEventListener("click", function() {
      triggerPinkelpause(function() { renderVATurn(); });
    });
  }

  function removeSidebarPinkelpause() {
    var existing = document.getElementById("pinkelpauseSidebarBtn");
    if (existing) existing.remove();
  }

  // --- Game-Buttons in Spaltenheadern ---
  function isGamePlayedDOM(game) {
    // Prüft direkt die Kladde-Tabelle, unabhängig vom players-Array
    const table = document.querySelector(".kladde-table:not(.kladde-preview)");
    if (!table) return false;
    if (game.type === "monte") {
      // Monte: prüfe ob irgendein Spieler einen Wert > 0 hat
      const inputs = table.querySelectorAll('[name^="monte_"]');
      for (const inp of inputs) {
        if (inp.type === "radio" || inp.type === "hidden") continue;
        if (Number(inp.value) > 0) return true;
      }
      return false;
    }
    const rows = table.querySelectorAll("tbody tr[data-member-id]");
    for (const row of rows) {
      const cb = row.querySelector("[data-present]");
      if (!cb || !cb.checked) continue;
      if (game.type === "custom") {
        const input = row.querySelector('[data-custom-game-id="' + game.cgId + '"]');
        if (input && Number(input.value) > 0) return true;
      } else {
        const input = row.querySelector('[name="' + game.key + '_' + row.dataset.memberId + '"]');
        if (input && Number(input.value) > 0) return true;
      }
    }
    return false;
  }

  function updateGameBtnStates() {
    gameBtns.forEach(btn => {
      const key = btn.dataset.liveStart;
      const game = GAMES.find(g => g.key === key);
      const played = game && isGamePlayedDOM(game);
      btn.classList.toggle("is-played", !!played);
      const img = btn.querySelector("img");
      if (img) {
        // Save original src from template on first run (live.png vs notlive.png)
        if (!img.dataset.origSrc) img.dataset.origSrc = img.getAttribute("src");
        img.src = played ? "/closed.png" : img.dataset.origSrc;
      }
    });
  }

  gameBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.classList.contains("is-played")) return;
      var wasPulsing = btn.classList.contains("live-btn-pulse");
      clearLiveBtnPulse();
      if (wasPulsing) {
        restoreLiveState();
      } else {
        openLiveMode(btn.dataset.liveStart);
      }
    });
  });

  if (btnClose) btnClose.addEventListener("click", function() { closeLiveMode(); });

  // Initial state
  updateGameBtnStates();

  // Escape key closes live mode (but not if an input is focused or picker is open)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && liveView.style.display !== "none") {
      if (activePicker) { closePicker(); return; }
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      closeLiveMode();
    }
  });

  // --- Sidebar (Marker-zentriert) ---
  const MARKER_TYPES = [
    { key: "pudel", label: "Pudel" },
    { key: "alle9", label: "9er" },
    { key: "kranz", label: "Kranz" },
    { key: "triclops", label: "Tri" }
  ];
  let activeMarkerTab = "pudel";

  function playerAvatarHtml(p, cssClass) {
    var cls = cssClass || "live-player-avatar";
    if (p.avatar) return '<img src="' + p.avatar + '" alt="" class="' + cls + '" />';
    var initials = getInitials(p.name);
    var color = initialColor(p.name);
    return '<span class="' + cls + ' live-player-initials" style="background:' + color + '">' + escHtml(initials) + '</span>';
  }

  function getInitials(name) {
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  var INITIAL_COLORS = ["#2f8f6d","#3a7bd5","#e67e22","#9b59b6","#e74c3c","#1abc9c","#34495e","#d35400","#8e44ad","#c0392b"];
  function initialColor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return INITIAL_COLORS[Math.abs(hash) % INITIAL_COLORS.length];
  }

  function renderSidebar() {
    let html = '<div class="live-marker-tabs">';
    MARKER_TYPES.forEach(mt => {
      html += '<button type="button" class="live-marker-tab' + (activeMarkerTab === mt.key ? ' active' : '') + '" data-marker-tab="' + mt.key + '">' + mt.label + '</button>';
    });
    html += '</div>';
    html += '<div class="live-player-grid">';
    players.forEach(p => {
      const input = p.row.querySelector('[data-marker-input="' + activeMarkerTab + '"]');
      const val = input ? Number(input.value) || 0 : 0;
      html += '<button type="button" class="live-player-btn" data-lm-member="' + p.id + '">';
      if (p.avatar) {
        html += '<img src="' + p.avatar + '" alt="" class="live-player-avatar" />';
      } else {
        var initials = getInitials(p.name);
        var color = initialColor(p.name);
        html += '<span class="live-player-avatar live-player-initials" style="background:' + color + '">' + escHtml(initials) + '</span>';
      }
      html += '<span class="live-player-btn-name">' + escHtml(p.name) + '</span>';
      html += '<span class="live-player-val">' + val + '</span>';
      html += '</button>';
    });
    html += '</div>';
    playersContainer.innerHTML = html;
  }

  // Tab clicks
  playersContainer.addEventListener("click", (e) => {
    const tab = e.target.closest(".live-marker-tab");
    if (tab) {
      activeMarkerTab = tab.dataset.markerTab;
      renderSidebar();
      return;
    }
  });

  // Player button: tap = +1, long-press = −1
  let lpTimer = null;
  let lpFired = false;

  function handlePlayerInc(btn) {
    const memberId = btn.dataset.lmMember;
    const player = players.find(p => p.id === memberId);
    if (!player) return;
    const realBtn = player.row.querySelector('.mark-btn:not(.mark-dec)[data-mark-target="' + activeMarkerTab + '"]');
    if (realBtn && !realBtn.disabled) realBtn.click();
    updatePlayerBtnVal(btn, player);
    btn.classList.add("live-player-tap");
    setTimeout(() => btn.classList.remove("live-player-tap"), 150);
  }

  function handlePlayerDec(btn) {
    const memberId = btn.dataset.lmMember;
    const player = players.find(p => p.id === memberId);
    if (!player) return;
    const realBtn = player.row.querySelector('.mark-btn.mark-dec[data-mark-target="' + activeMarkerTab + '"]');
    if (realBtn && !realBtn.disabled) realBtn.click();
    updatePlayerBtnVal(btn, player);
    btn.classList.add("live-player-longpress");
    setTimeout(() => btn.classList.remove("live-player-longpress"), 300);
  }

  function updatePlayerBtnVal(btn, player) {
    const input = player.row.querySelector('[data-marker-input="' + activeMarkerTab + '"]');
    const val = input ? Number(input.value) || 0 : 0;
    const display = btn.querySelector(".live-player-val");
    if (display) display.textContent = val;
  }

  function startLongPress(btn) {
    lpFired = false;
    lpTimer = setTimeout(() => {
      lpFired = true;
      handlePlayerDec(btn);
    }, 500);
  }

  function cancelLongPress() {
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
  }

  // Mouse events for long-press
  playersContainer.addEventListener("mousedown", (e) => {
    const btn = e.target.closest(".live-player-btn");
    if (!btn) return;
    startLongPress(btn);
  });
  playersContainer.addEventListener("mouseup", (e) => {
    const btn = e.target.closest(".live-player-btn");
    cancelLongPress();
    if (btn && !lpFired) handlePlayerInc(btn);
  });
  playersContainer.addEventListener("mouseleave", cancelLongPress);

  // Touch events for long-press
  playersContainer.addEventListener("touchstart", (e) => {
    const btn = e.target.closest(".live-player-btn");
    if (!btn) return;
    startLongPress(btn);
  }, { passive: true });
  playersContainer.addEventListener("touchend", (e) => {
    const btn = e.target.closest(".live-player-btn");
    cancelLongPress();
    if (btn && !lpFired) {
      e.preventDefault();
      handlePlayerInc(btn);
    }
  });
  playersContainer.addEventListener("touchcancel", cancelLongPress);

  // --- Game Navigation ---
  btnNext.addEventListener("click", () => {
    // Nächstes ungespieltes Spiel finden
    let next = -1;
    for (let i = currentGameIdx + 1; i < GAMES.length; i++) {
      if (!isGamePlayed(GAMES[i])) { next = i; break; }
    }
    if (next !== -1) {
      gameHistory.push(currentGameIdx);
      currentGameIdx = next;
      renderCurrentGame();
    } else {
      gameHistory.push(currentGameIdx);
      showGameSelector();
    }
  });

  btnPrev.addEventListener("click", () => {
    if (gameHistory.length > 0) {
      currentGameIdx = gameHistory.pop();
      renderCurrentGame();
    }
  });

  function updatePrevButton() {
    btnPrev.style.display = gameHistory.length > 0 ? "" : "none";
  }

  function renderCurrentGame() {
    hideMonteCursor();
    const game = GAMES[currentGameIdx];
    sidebarTitle.textContent = game.label;
    gameLabel.textContent = game.label;
    shuffleArea.innerHTML = "";
    shuffleArea.style.display = "none";
    playersContainer.style.display = "";
    liveView.classList.remove("live-shuffle-active");
    liveView.classList.remove("live-shuffle-sidebar");
    removeSidebarPinkelpause();
    liveControls.clear();

    if (game.type === "monte") {
      renderShufflePhase(game, function() { renderMonteGame(); });
    } else if (game.type === "va") {
      renderShufflePhase(game, function() { renderVAGame(); });
    } else if (game.type === "aussteigen") {
      renderShufflePhase(game, function() { renderAussteigenGame(); });
    } else if (game.type === "sechs_tage") {
      renderShufflePhase(game, function() { renderSechsTageGame(); });
    } else {
      renderSimpleGame(game);
    }
  }

  function showGameSelector() {
    let html = '<div class="live-game-selector">';
    html += '<h3>Spiel wählen</h3>';
    GAMES.forEach((g, i) => {
      const played = isGamePlayed(g);
      html += '<button type="button" class="live-game-select-btn' + (played ? ' live-game-played' : '') + '"' + (played ? ' disabled' : ' data-game-idx="' + i + '"') + '>' + escHtml(g.label) + (played ? ' \u2713' : '') + '</button>';
    });
    html += '</div>';
    gameContent.innerHTML = html;
    sidebarTitle.textContent = "Live-Modus";
    gameLabel.textContent = "Spielauswahl";
    shuffleArea.innerHTML = "";
    shuffleArea.style.display = "none";
  }

  gameContent.addEventListener("click", (e) => {
    const selectBtn = e.target.closest("[data-game-idx]");
    if (selectBtn && !selectBtn.disabled) {
      gameHistory.push(currentGameIdx);
      currentGameIdx = Number(selectBtn.dataset.gameIdx);
      renderCurrentGame();
    }
  });

  function isGamePlayed(game) {
    if (game.type === "monte") {
      // Check if any monte rounds exist
      return monteState.rounds && Object.keys(monteState.rounds).length > 0;
    }
    for (const p of players) {
      if (game.type === "custom") {
        const input = p.row.querySelector('[data-custom-game-id="' + game.cgId + '"]');
        if (input && Number(input.value) > 0) return true;
      } else {
        const input = p.row.querySelector('[name="' + game.key + '_' + p.id + '"]');
        if (input && Number(input.value) > 0) return true;
      }
    }
    return false;
  }

  // --- Simple Games (V+A, Aussteigen, 6-Tage, Custom) ---
  function renderSimpleGame(game) {
    let html = '<div class="live-simple-game">';
    players.forEach(p => {
      let val = 0;
      if (game.type === "custom") {
        const input = p.row.querySelector('[data-custom-game-id="' + game.cgId + '"]');
        val = input ? Number(input.value) || 0 : 0;
      } else {
        const input = p.row.querySelector('[name="' + game.key + '_' + p.id + '"]');
        val = input ? Number(input.value) || 0 : 0;
      }
      html += '<div class="live-simple-row" data-live-simple-member="' + p.id + '">';
      html += playerAvatarHtml(p, "live-simple-avatar");
      html += '<span class="live-simple-name">' + escHtml(p.name) + '</span>';
      html += '<input type="number" min="0" max="999" step="1" value="' + val + '" class="live-simple-input" data-live-game="' + game.key + '" data-live-member="' + p.id + '"' + (game.type === "custom" ? ' data-live-cg="' + game.cgId + '"' : '') + ' />';
      html += '</div>';
    });
    html += '</div>';
    gameContent.innerHTML = html;
  }

  // Simple game input changes → write back to kladde table
  gameContent.addEventListener("input", (e) => {
    const input = e.target.closest(".live-simple-input");
    if (!input) return;
    const memberId = input.dataset.liveMember;
    const gameKey = input.dataset.liveGame;
    const cgId = input.dataset.liveCg;
    const player = players.find(p => p.id === memberId);
    if (!player) return;

    let realInput;
    if (cgId) {
      realInput = player.row.querySelector('[data-custom-game-id="' + cgId + '"]');
    } else {
      realInput = player.row.querySelector('[name="' + gameKey + '_' + memberId + '"]');
    }
    if (realInput) {
      realInput.value = input.value;
      realInput.dispatchEvent(new Event("input", { bubbles: true }));
      realInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  // =============================================
  // --- Shuffle-System ---
  // =============================================
  function fisherYatesShuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderShufflePhase(game, onReady) {
    gameOrder = [];

    // Build initial list + buttons layout
    var html = '<div class="shuffle-layout">';
    html += '<div class="shuffle-list-col">';
    html += '<div class="shuffle-list" id="shuffleList">';
    players.forEach(function(p, i) {
      var initials = getInitials(p.name);
      var color = initialColor(p.name);
      html += '<div class="shuffle-list-item" data-player-id="' + p.id + '">';
      if (p.avatar) {
        html += '<img src="' + p.avatar + '" class="shuffle-card-avatar" />';
      } else {
        html += '<span class="shuffle-card-avatar shuffle-card-initials" style="background:' + color + '">' + escHtml(initials) + '</span>';
      }
      html += '<span class="shuffle-name">' + escHtml(p.name) + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
    html += '<div class="shuffle-btn-col">';
    html += '<button type="button" class="shuffle-start-btn" id="shuffleStartBtn">';
    html += '<img src="/start.png" alt="Mischen" class="shuffle-start-img" />';
    html += '</button>';
    html += '<div class="shuffle-start-label">Mischen!</div>';
    html += '<button type="button" class="shuffle-go-btn" id="shuffleGoBtn" style="display:none">Los geht\'s &#9654;</button>';
    html += '</div></div>';

    shuffleArea.innerHTML = html;
    shuffleArea.style.display = "block";
    playersContainer.style.display = "none";
    gameContent.innerHTML = "";
    liveView.classList.add("live-shuffle-active");

    var shuffleBtn = document.getElementById("shuffleStartBtn");
    var goBtn = document.getElementById("shuffleGoBtn");
    var listEl = document.getElementById("shuffleList");

    // Prepare DOM refs for animation
    var itemEls = {};
    players.forEach(function(p) {
      var el = listEl.querySelector('[data-player-id="' + p.id + '"]');
      if (el) itemEls[p.id] = el;
    });

    goBtn.addEventListener("click", function() {
      liveView.classList.remove("live-shuffle-active");
      liveView.classList.add("live-shuffle-sidebar");
      shuffleArea.style.display = ""; // Clear inline style so CSS flex takes effect
      // Each game type sets up its own main/controls layout.
      // V+A, Monte, Aussteigen, and 6-Tage each build their own layout in onReady().
      addSidebarPinkelpause();
      currentTurnIdx = 0;
      pinklerSlots = [];
      gameOrderOriginal = gameOrder.map(function(p) { return p.id; });
      onReady();
    });

    // Monte: load standings, show points, auto-sort if data exists
    var monteStandings = null;
    if (game.type === "monte") {
      shuffleBtn.disabled = true;
      fetch("/kegelkladde/monte-standings")
        .then(function(r) { return r.json(); })
        .then(function(data) {
          monteStandings = data.standings || {};
          var hasStandings = Object.keys(monteStandings).length > 0;
          if (hasStandings) {
            // Show points next to each player name
            players.forEach(function(p) {
              var pts = monteStandings[p.id] || 0;
              var el = itemEls[p.id];
              if (el) {
                var ptsSpan = document.createElement("span");
                ptsSpan.className = "shuffle-pts";
                ptsSpan.textContent = pts + " Pkt.";
                el.appendChild(ptsSpan);
              }
            });
            // Replace shuffle button with info text
            shuffleBtn.style.display = "none";
            var labelEl = shuffleBtn.parentNode.querySelector(".shuffle-start-label");
            if (labelEl) labelEl.textContent = "Reihenfolge wird gesetzt\u2026";
            // Auto-trigger sort after short delay
            setTimeout(function() { doShuffle(); }, 600);
          } else {
            shuffleBtn.disabled = false;
          }
        })
        .catch(function(err) {
          console.error("[Monte Standings Error]", err);
          monteStandings = {};
          shuffleBtn.disabled = false;
        });
    }

    shuffleBtn.addEventListener("click", doShuffle);

    function sortByMonteStandings(arr) {
      if (!monteStandings) return fisherYatesShuffle(arr);
      // Group by points
      var grouped = {};
      arr.forEach(function(p) {
        var pts = monteStandings[p.id] || 0;
        if (!grouped[pts]) grouped[pts] = [];
        grouped[pts].push(p);
      });
      // Sort groups: highest points first
      var sortedKeys = Object.keys(grouped).map(Number).sort(function(a, b) { return b - a; });
      var result = [];
      sortedKeys.forEach(function(pts) {
        var group = grouped[pts];
        // Shuffle within tied groups
        if (group.length > 1) group = fisherYatesShuffle(group);
        result = result.concat(group);
      });
      return result;
    }

    var hasShuffled = false;
    function doShuffle() {
      if (hasShuffled && !confirm("Wirklich erneut mischen?")) return;
      hasShuffled = true;
      gameOrder = (game.type === "monte") ? sortByMonteStandings(players) : fisherYatesShuffle(players);
      shuffleBtn.disabled = true;
      shuffleBtn.classList.add("shuffle-spinning");
      goBtn.style.display = "none";

      // Measure item height + gap
      var items = listEl.querySelectorAll('.shuffle-list-item');
      var gap = parseFloat(getComputedStyle(listEl).gap) || 5;
      var itemH = items[0].offsetHeight + gap;

      // Switch to absolute positioning if not already
      if (!listEl.classList.contains('shuffle-physics')) {
        listEl.classList.add('shuffle-physics');
        listEl.style.height = (players.length * itemH - gap) + 'px';
        players.forEach(function(p, i) {
          var el = itemEls[p.id];
          el.style.position = 'absolute';
          el.style.left = '0';
          el.style.right = '0';
          el.style.top = (i * itemH) + 'px';
        });
      }

      var isMonteSorted = (game.type === "monte" && monteStandings && Object.keys(monteStandings).length > 0);
      var roundTimings = isMonteSorted ? [600] : [280, 200, 150, 120, 120, 150, 200, 300, 500];
      var totalRounds = roundTimings.length;
      var currentRound = 0;

      function runRound() {
        var isLast = currentRound === totalRounds - 1;
        var duration = roundTimings[currentRound];
        var newOrder = isLast ? gameOrder : fisherYatesShuffle(players);

        newOrder.forEach(function(p, newIdx) {
          var el = itemEls[p.id];
          var currentTop = parseFloat(el.style.top) || 0;
          var targetTop = newIdx * itemH;
          var delta = targetTop - currentTop;
          var arcX = delta !== 0 ? (delta > 0 ? 1 : -1) * (6 + Math.random() * 14) : 0;

          el.style.transition = 'top ' + duration + 'ms cubic-bezier(.4,0,.2,1), transform ' + duration + 'ms cubic-bezier(.25,.46,.45,.94)';
          el.style.top = targetTop + 'px';
          el.style.transform = 'translateX(' + arcX + 'px)';
        });

        currentRound++;

        setTimeout(function() {
          var snapDur = Math.max(duration * 0.25, 60);
          newOrder.forEach(function(p) {
            var el = itemEls[p.id];
            el.style.transition = 'transform ' + snapDur + 'ms ease-out';
            el.style.transform = 'translateX(0)';
          });

          if (currentRound < totalRounds) {
            setTimeout(runRound, snapDur + 20);
          } else {
            setTimeout(function() {
              newOrder.forEach(function(p, i) {
                setTimeout(function() {
                  var el = itemEls[p.id];
                  el.style.transition = 'transform 0.3s cubic-bezier(.34,1.56,.64,1)';
                  el.style.transform = 'scale(1.05)';
                  setTimeout(function() {
                    el.style.transition = 'transform 0.25s ease';
                    el.style.transform = 'scale(1)';
                  }, 180);
                }, i * 70);
              });

              var delay = newOrder.length * 70 + 400;
              setTimeout(function() {
                shuffleBtn.disabled = false;
                shuffleBtn.classList.remove("shuffle-spinning");
                goBtn.style.display = "";
                goBtn.classList.add("shuffle-go-animate");

                // For pair games (6-Tage): show team pairings visually
                if (game.type === "sechs_tage") {
                  showShuffleTeamPairs(newOrder, itemEls, itemH, gap, listEl);
                }
              }, delay);
            }, 250);
          }
        }, duration);
      }

      setTimeout(runRound, 150);
    }
  }

  function showShuffleTeamPairs(order, itemEls, itemH, gap, listEl) {
    // Remove any existing team markers
    listEl.querySelectorAll(".shuffle-team-bracket").forEach(function(el) { el.remove(); });
    listEl.querySelectorAll(".shuffle-list-item").forEach(function(el) {
      el.classList.remove("shuffle-team-top", "shuffle-team-bottom", "shuffle-team-solo");
    });

    for (var i = 0; i < order.length; i += 2) {
      var el1 = itemEls[order[i].id];
      var hasPair = (i + 1 < order.length);

      if (hasPair) {
        var el2 = itemEls[order[i + 1].id];
        el1.classList.add("shuffle-team-top");
        el2.classList.add("shuffle-team-bottom");

        // Add team bracket
        var bracket = document.createElement("div");
        bracket.className = "shuffle-team-bracket";
        var topPos = parseFloat(el1.style.top) || (i * itemH);
        bracket.style.top = topPos + "px";
        bracket.style.height = (itemH * 2 - gap) + "px";
        listEl.appendChild(bracket);
      } else {
        el1.classList.add("shuffle-team-solo");
      }
    }
  }

  // =============================================
  // --- Turn-System + Pinkelpause ---
  // =============================================
  function renderTurnHeader(container) {
    if (currentTurnIdx >= gameOrder.length) return '';
    var current = gameOrder[currentTurnIdx];
    var nextIdx = getNextTurnIdx(currentTurnIdx);
    var next = nextIdx >= 0 ? gameOrder[nextIdx] : null;

    var html = '<div class="turn-header">';
    html += '<div class="turn-current">';
    html += '<span class="turn-label">Am Zug:</span>';
    html += playerAvatarHtml(current, "turn-avatar");
    html += '<span class="turn-name">' + escHtml(current.name) + '</span>';
    html += '</div>';
    html += '<div class="turn-actions">';
    html += '<button type="button" class="pinkelpause-btn" id="pinkelpauseBtn" title="Pinkelpause"><img src="/pee.png" alt="Pinkelpause" class="pinkelpause-img" /></button>';
    html += '</div>';
    if (next) {
      html += '<div class="turn-next">';
      html += playerAvatarHtml(next, "turn-avatar-sm");
      html += '<span class="turn-next-label">' + escHtml(next.name) + '</span>';
      html += '</div>';
    }
    // Show pinkler info
    if (pinklerSlots.length > 0) {
      html += '<div class="turn-pinkler-info">';
      pinklerSlots.forEach(function(ps) {
        var p = gameOrder.find(function(g) { return g.id === ps.playerId; });
        if (p) html += '<span class="pinkler-badge">' + escHtml(p.name) + ' \uD83D\uDEBD</span>';
      });
      html += '</div>';
    }
    html += '</div>';

    if (container) {
      var existing = container.querySelector(".turn-header");
      if (existing) {
        existing.outerHTML = html;
      } else {
        container.insertAdjacentHTML("afterbegin", html);
      }
    }
    return html;
  }

  function getNextTurnIdx(fromIdx) {
    if (fromIdx + 1 < gameOrder.length) return fromIdx + 1;
    return -1;
  }

  // Phase 1: Capture old positions + update data (before re-render)
  // Phase 2: playPinklerFlip() applies INVERT+PLAY on fresh DOM (after re-render)
  var pendingPinklerFlip = null;

  function restorePinklerIfNeeded() {
    var current = gameOrder[currentTurnIdx];
    if (!current) return;
    var currentId = current.id;

    // Check if current player is a pinkler
    var psIdx = -1;
    for (var pi = 0; pi < pinklerSlots.length; pi++) {
      if (pinklerSlots[pi].playerId === currentId) { psIdx = pi; break; }
    }
    if (psIdx === -1) return; // Not a pinkler, nothing to do

    // Remove from pinkler tracking
    pinklerSlots.splice(psIdx, 1);

    // Find where the player should go based on original order
    var origIdx = gameOrderOriginal.indexOf(currentId);
    var currentPos = currentTurnIdx;

    // Calculate target insert position (where pinkler belongs in original order)
    var targetIdx = 0;
    for (var i = 0; i < gameOrder.length; i++) {
      if (i === currentPos) continue; // Skip the pinkler's current position
      if (gameOrderOriginal.indexOf(gameOrder[i].id) < origIdx) targetIdx++;
    }

    // FIRST: Capture positions of all sidebar rows before DOM change
    var table = document.getElementById("shuffleSidebarTable");
    var firstRects = {};
    if (table) {
      var tbody = table.querySelector("tbody");
      if (tbody) {
        tbody.querySelectorAll(".sst-row").forEach(function(row) {
          firstRects[row.dataset.playerId] = row.getBoundingClientRect();
        });
      }
    }

    // Update gameOrder: remove from current position, insert at target
    if (targetIdx !== currentPos) {
      var pinklerEntry = gameOrder.splice(currentPos, 1)[0];
      // Adjust targetIdx if removal shifted it
      if (currentPos < targetIdx) targetIdx--;
      gameOrder.splice(targetIdx, 0, pinklerEntry);
      // Pinkler is the current player — update currentTurnIdx to follow them
      currentTurnIdx = targetIdx;
    }

    // Store FLIP data for Phase 2 (after re-render rebuilds the DOM)
    pendingPinklerFlip = { firstRects: firstRects, pinklerId: currentId };

    saveLiveState();
  }

  function playPinklerFlip() {
    if (!pendingPinklerFlip) return;
    var data = pendingPinklerFlip;
    pendingPinklerFlip = null;

    var table = document.getElementById("shuffleSidebarTable");
    if (!table) return;
    var tbody = table.querySelector("tbody");
    if (!tbody) return;

    // If no old positions captured, skip animation
    if (!Object.keys(data.firstRects).length) return;

    var pinklerRow = tbody.querySelector('.sst-row[data-player-id="' + data.pinklerId + '"]');

    // INVERT: Calculate position differences and apply inverse transforms
    var rows = tbody.querySelectorAll(".sst-row");
    var animatedRows = [];
    rows.forEach(function(row) {
      var pid = row.dataset.playerId;
      if (!data.firstRects[pid]) return;
      var newRect = row.getBoundingClientRect();
      var deltaY = data.firstRects[pid].top - newRect.top;
      if (deltaY === 0 && pid !== data.pinklerId) return;

      // Temporarily disable transition, set inverse transform
      row.style.transition = "none";
      if (pid === data.pinklerId) {
        row.style.transform = "translateY(" + deltaY + "px) scale(1.08)";
        row.classList.add("pinkler-returning");
      } else {
        row.style.transform = "translateY(" + deltaY + "px)";
      }
      animatedRows.push(row);
    });

    if (!animatedRows.length) return;

    // PLAY: Remove transforms in next frame → CSS transition animates to final position
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        animatedRows.forEach(function(row) {
          row.style.transition = "";
          if (row.dataset.playerId === data.pinklerId) {
            row.style.transform = "scale(1.08)";
          } else {
            row.style.transform = "";
          }
        });

        // After main slide animation (500ms), scale pinkler back to normal
        if (pinklerRow) {
          setTimeout(function() {
            pinklerRow.style.transition = "transform 300ms ease, box-shadow 300ms ease";
            pinklerRow.style.transform = "";
            pinklerRow.classList.remove("pinkler-returning");
            // Clean up inline styles
            setTimeout(function() {
              pinklerRow.style.transition = "";
            }, 350);
          }, 500);
        }
      });
    });
  }

  function triggerPinkelpause(onTurnChange) {
    var current = gameOrder[currentTurnIdx];

    // Track as pinkler (only once)
    if (!pinklerSlots.some(function(ps) { return ps.playerId === current.id; })) {
      pinklerSlots.push({ playerId: current.id });
    }

    showToast(current.name + " ist auf Pinkelpause \uD83D\uDEBD", "info");

    // Swap with next NON-PINKLER player (skip other pinklers to avoid infinite swapping)
    var swapIdx = -1;
    for (var i = currentTurnIdx + 1; i < gameOrder.length; i++) {
      var isPinkler = pinklerSlots.some(function(ps) { return ps.playerId === gameOrder[i].id; });
      if (!isPinkler) { swapIdx = i; break; }
    }

    if (swapIdx !== -1) {
      var temp = gameOrder[currentTurnIdx];
      gameOrder[currentTurnIdx] = gameOrder[swapIdx];
      gameOrder[swapIdx] = temp;
    }
    // If no non-pinkler found, pinkler stays (all remaining players are also pinklers)

    // currentTurnIdx stays — now points to the swapped-in non-pinkler
    if (onTurnChange) onTurnChange();
  }

  // =============================================
  // --- V+A (Volle und Abräumen) ---
  // =============================================
  function renderVAGame() {
    // Reset V+A state
    vaState = {
      phase: "volle",
      round: "volle",           // "volle" → alle Spieler Volle, dann "abraeumen" → alle Abräumen
      currentThrow: 0,
      volleThrows: [],
      abraeumenThrows: [],
      standingPins: [1,2,3,4,5,6,7,8,9],
      results: {},
      directEntry: false,
      throwHistory: {}          // {playerId: {volleThrows, abraeumenThrows}}
    };

    // Initialize results for all players
    gameOrder.forEach(function(p) {
      vaState.results[p.id] = { volle: 0, abraeumen: 0, total: 0 };
    });

    currentTurnIdx = 0;
    renderVATurn();
  }

  function buildShuffleSidebarHtml() {
    var html = '<div class="shuffle-sidebar-table-wrap">';
    html += '<table class="shuffle-sidebar-table" id="shuffleSidebarTable">';
    html += '<thead><tr>';
    html += '<th class="sst-player">Spieler</th>';
    html += '<th class="sst-marker" data-sst-col="alle9">9</th>';
    html += '<th class="sst-marker" data-sst-col="kranz">K</th>';
    html += '<th class="sst-marker" data-sst-col="triclops">T</th>';
    html += '<th class="sst-marker" data-sst-col="pudel">P</th>';
    html += '<th class="sst-game">V</th>';
    html += '<th class="sst-game">A</th>';
    html += '</tr></thead><tbody>';
    gameOrder.forEach(function(p, i) {
      var initials = getInitials(p.name);
      var color = initialColor(p.name);
      var avatarHtml = p.avatar
        ? '<img src="' + p.avatar + '" class="sst-avatar" />'
        : '<span class="sst-avatar sst-initials" style="background:' + color + '">' + escHtml(initials) + '</span>';
      html += '<tr class="sst-row" data-player-id="' + p.id + '">';
      html += '<td class="sst-player-cell">';
      html += '<span class="sst-num">' + (i + 1) + '.</span>';
      html += avatarHtml;
      html += '<span class="sst-name">' + escHtml(p.name) + '</span>';
      html += '</td>';
      html += '<td class="sst-marker-cell" data-sst-col="alle9"></td>';
      html += '<td class="sst-marker-cell" data-sst-col="kranz"></td>';
      html += '<td class="sst-marker-cell" data-sst-col="triclops"></td>';
      html += '<td class="sst-marker-cell" data-sst-col="pudel"></td>';
      html += '<td class="sst-game-cell" data-sst-col="volle"></td>';
      html += '<td class="sst-game-cell" data-sst-col="abraeumen"></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function buildShuffleSidebar() {
    shuffleArea.innerHTML = buildShuffleSidebarHtml();
  }

  // Editable V+A sidebar cells — handler works on both containers
  // (score table is in gameContent for V+A, in shuffleArea for Aussteigen)
  function handleSstCellClick(e) {
    var cell = e.target.closest(".sst-game-cell");
    if (!cell || cell.querySelector("input")) return;

    var row = cell.closest(".sst-row");
    if (!row) return;
    var playerId = row.dataset.playerId;
    var col = cell.dataset.sstCol; // "volle" or "abraeumen"
    if (!playerId || !col) return;
    if (!vaState || !vaState.results || !vaState.results[playerId]) return;

    var currentVal = col === "volle" ? vaState.results[playerId].volle : vaState.results[playerId].abraeumen;
    var input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "999";
    input.step = "1";
    input.className = "sst-inline-edit";
    input.value = currentVal;
    cell.textContent = "";
    cell.appendChild(input);
    input.focus();
    input.select();

    function commit() {
      var newVal = Number(input.value) || 0;
      if (col === "volle") {
        vaState.results[playerId].volle = newVal;
      } else {
        vaState.results[playerId].abraeumen = newVal;
      }
      vaState.results[playerId].total = vaState.results[playerId].volle + vaState.results[playerId].abraeumen;
      var player = gameOrder.find(function(p) { return p.id === playerId; });
      if (player && vaState.results[playerId].abraeumen > 0) {
        syncVAPlayerToKladde(player, vaState.results[playerId].total);
      }
      updateShuffleScores();
      saveLiveState();
    }

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", function(ev) {
      if (ev.key === "Enter") { input.blur(); }
      if (ev.key === "Escape") { input.value = currentVal; input.blur(); }
    });
  }
  shuffleArea.addEventListener("click", handleSstCellClick);
  gameContent.addEventListener("click", handleSstCellClick);

  function getPlayerMarkerVal(player, markerType) {
    var input = player.row ? player.row.querySelector('[data-marker-input="' + markerType + '"]') : null;
    return input ? (Number(input.value) || 0) : 0;
  }

  function updateShuffleHighlight(idx) {
    var table = document.getElementById("shuffleSidebarTable");
    if (!table) return;
    var rows = table.querySelectorAll(".sst-row");
    rows.forEach(function(r) { r.classList.remove("shuffle-active-player"); });
    if (idx >= 0 && idx < gameOrder.length) {
      var activeRow = table.querySelector('.sst-row[data-player-id="' + gameOrder[idx].id + '"]');
      if (activeRow) {
        activeRow.classList.add("shuffle-active-player");
        activeRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
    updateShuffleScores();
  }

  function updateShuffleScores() {
    var table = document.getElementById("shuffleSidebarTable");
    if (!table) return;
    // Highlight active game column header + column cells
    var ths = table.querySelectorAll("th.sst-game");
    ths.forEach(function(th) { th.classList.remove("sst-game-active"); });
    table.querySelectorAll(".sst-col-active").forEach(function(c) { c.classList.remove("sst-col-active"); });
    if (vaState && vaState.round) {
      var activeIdx = vaState.round === "volle" ? 0 : 1;
      if (ths[activeIdx]) ths[activeIdx].classList.add("sst-game-active");
      var colName = vaState.round === "volle" ? "volle" : "abraeumen";
      table.querySelectorAll('.sst-game-cell[data-sst-col="' + colName + '"]').forEach(function(c) {
        c.classList.add("sst-col-active");
      });
    }

    gameOrder.forEach(function(p, i) {
      var row = table.querySelector('.sst-row[data-player-id="' + p.id + '"]');
      if (!row) return;

      // Marker values from Kladde
      var markers = ["alle9", "kranz", "triclops", "pudel"];
      markers.forEach(function(m) {
        var cell = row.querySelector('[data-sst-col="' + m + '"]');
        if (cell) {
          var val = getPlayerMarkerVal(p, m);
          cell.textContent = val > 0 ? val : "";
        }
      });

      // V+A scores
      if (vaState && vaState.results && vaState.results[p.id]) {
        var r = vaState.results[p.id];
        var volleCell = row.querySelector('[data-sst-col="volle"]');
        var abraeumenCell = row.querySelector('[data-sst-col="abraeumen"]');
        if (volleCell) {
          var showVolle = r.volle > 0 || (vaState.round === "abraeumen") || (vaState.round === "volle" && i < currentTurnIdx);
          volleCell.textContent = showVolle ? r.volle : "";
        }
        if (abraeumenCell) {
          var showAbr = r.abraeumen > 0 || (vaState.round === "abraeumen" && i < currentTurnIdx);
          abraeumenCell.textContent = showAbr ? r.abraeumen : "";
        }
      }

      // Pinkler badge
      var nameCell = row.querySelector(".sst-name");
      if (nameCell) {
        var badge = nameCell.querySelector(".shuffle-pinkler-badge");
        var isPinkler = pinklerSlots.some(function(ps) { return ps.playerId === p.id; });
        if (isPinkler && !badge) {
          nameCell.insertAdjacentHTML("beforeend", '<span class="shuffle-pinkler-badge"> \uD83D\uDEBD</span>');
        } else if (!isPinkler && badge) {
          badge.remove();
        }
      }
    });
  }

  function renderVATurn() {
    if (currentTurnIdx >= gameOrder.length) {
      if (vaState.round === "volle") {
        // Alle haben Volle geworfen → jetzt Abräumen-Runde starten
        vaState.round = "abraeumen";
        currentTurnIdx = 0;
        renderVATurn();
        return;
      }
      // Abräumen auch fertig → Ergebnis zeigen
      updateShuffleHighlight(-1);
      renderVAResults();
      return;
    }

    updateShuffleHighlight(currentTurnIdx);

    var player = gameOrder[currentTurnIdx];
    vaState.phase = vaState.round;
    vaState.currentThrow = 0;
    vaState.directEntry = false;

    if (vaState.round === "volle") {
      vaState.volleThrows = [];
    } else {
      vaState.abraeumenThrows = [];
      vaState.standingPins = [1,2,3,4,5,6,7,8,9];
    }

    renderVAPlayerUI();
  }

  function renderVAScoreboard() {
    var html = '<div class="va-scoreboard">';
    html += '<table class="va-scoreboard-table"><thead><tr><th>Spieler</th><th>Volle</th><th>Abr.</th><th>&sum;</th></tr></thead><tbody>';
    gameOrder.forEach(function(p, i) {
      var r = vaState.results[p.id];
      var isCurrent = i === currentTurnIdx;
      var volleStr = r.volle > 0 || (vaState.round === "abraeumen") || (vaState.round === "volle" && i < currentTurnIdx) ? String(r.volle) : "";
      var abraeumenStr = r.abraeumen > 0 || (vaState.round === "abraeumen" && i < currentTurnIdx) ? String(r.abraeumen) : "";
      var totalStr = r.total > 0 ? String(r.total) : (volleStr && abraeumenStr ? "0" : "");
      html += '<tr' + (isCurrent ? ' class="va-sb-current"' : '') + '>';
      html += '<td class="va-sb-name-cell">' + playerAvatarHtml(p, "va-sb-avatar") + ' ' + escHtml(p.name) + '</td>';
      html += '<td>' + volleStr + '</td>';
      html += '<td>' + abraeumenStr + '</td>';
      html += '<td class="va-sb-total">' + totalStr + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderVAPlayerUI() {
    var player = gameOrder[currentTurnIdx];
    var mainHtml = '';

    // Player heading always on main side (LEFT)
    mainHtml += '<div class="va-player-heading">' + escHtml(player.name) + '</div>';

    if (vaState.directEntry) {
      mainHtml += renderVADirectEntry(player);
      mainHtml += buildShuffleSidebarHtml();
      gameContent.innerHTML = mainHtml;
      liveControls.clear();
      attachVADirectEntryHandlers();
    } else if (vaState.phase === "volle") {
      mainHtml += '<button type="button" class="va-direct-btn" id="vaDirectBtn">Direkt eingeben \u270F\uFE0F</button>';
      mainHtml += buildShuffleSidebarHtml();
      gameContent.innerHTML = mainHtml;
      liveControls.renderVolle({
        onPick: vaOnVollePick,
        onUndo: vaOnVolleUndo,
        canUndo: vaState.currentThrow > 0 || currentTurnIdx > 0,
        headerHtml: renderVAVolleMain(player)
      });
    } else if (vaState.phase === "abraeumen") {
      mainHtml += '<button type="button" class="va-direct-btn" id="vaDirectBtn">Direkt eingeben \u270F\uFE0F</button>';
      mainHtml += buildShuffleSidebarHtml();
      gameContent.innerHTML = mainHtml;
      liveControls.renderAbraeumen({
        onConfirm: vaOnAbraeumenConfirm,
        onUndo: vaOnAbraeumenUndo,
        onInvert: vaOnAbraeumenInvert,
        canUndo: vaState.abraeumenThrows.length > 0,
        canInvert: vaState.standingPins.length === 9,
        fallenCount: 0,
        throwNum: vaState.abraeumenThrows.length + 1,
        headerHtml: renderVAAbraeumenMain(player)
      });
    }

    // "Direkt eingeben" handler (now on LEFT side)
    var directBtn = document.getElementById("vaDirectBtn");
    if (directBtn) {
      directBtn.addEventListener("click", function() {
        vaState.directEntry = true;
        renderVAPlayerUI();
      });
    }

    updateShuffleHighlight(currentTurnIdx);
    updateShuffleScores();
    saveLiveState();

    // Phase 2 der Pinkler-Rückkehr-Animation (INVERT+PLAY auf frischem DOM)
    playPinklerFlip();
  }

  // Returns header HTML for Volle phase (phase title + throw slots) — rendered on RIGHT side via liveControls
  function renderVAVolleMain(player) {
    var sum = vaState.volleThrows.reduce(function(a, b) { return a + b.val; }, 0);
    var html = '<div class="va-phase-title">5 in die Vollen, Wurf ' + (vaState.currentThrow + 1) + '/5:</div>';
    html += '<div class="va-throw-slots">';
    for (var i = 0; i < 5; i++) {
      var entry = vaState.volleThrows[i];
      var filled = entry !== undefined;
      var isCurrent = i === vaState.currentThrow;
      var displayVal = '';
      if (filled) {
        if (entry.marker === "kranz") displayVal = 'K(12)';
        else if (entry.marker === "pudel") displayVal = 'P';
        else if (entry.marker === "triclops") displayVal = 'T(3)';
        else if (entry.marker === "alle9") displayVal = '9';
        else displayVal = String(entry.val);
      }
      html += '<div class="va-throw-slot' + (filled ? ' filled' : '') + (isCurrent ? ' current' : '') + '">';
      html += '<div class="va-throw-val">' + displayVal + '</div>';
      html += '</div>';
    }
    html += '<div class="va-throw-sum">= ' + sum + '</div>';
    html += '</div>';
    return html;
  }

  // Returns header HTML for Abräumen phase (phase title + previous throws) — rendered on RIGHT side via liveControls
  function renderVAAbraeumenMain(player) {
    var throwNum = vaState.abraeumenThrows.length;
    var html = '<div class="va-phase-title">5 Abr\u00e4umen, Wurf ' + (throwNum + 1) + '/5:</div>';
    if (vaState.abraeumenThrows.length > 0) {
      html += '<div class="va-prev-throws">Bisherige W\u00fcrfe: ';
      vaState.abraeumenThrows.forEach(function(t) {
        html += '<span class="va-prev-throw-badge">' + t.count + '</span>';
      });
      html += '</div>';
    }
    return html;
  }

  // --- V+A Volle callbacks ---
  function vaOnVollePick(throwVal, marker, btn) {
    vaState.volleThrows.push({ val: throwVal, marker: marker });
    vaState.currentThrow = vaState.volleThrows.length;

    // Bei erstem Wurf: Pinkler zurück an Originalposition animieren
    if (vaState.volleThrows.length === 1) restorePinklerIfNeeded();

    // Trigger marker if applicable
    if (marker) triggerAutoMarker(gameOrder[currentTurnIdx], marker, 1);

    // Visual effects
    if (marker === "kranz") {
      liveFx.stop(); liveFx.confetti(btn);
      setTimeout(function() { liveFx.fireworks(20000); }, 600);
    } else if (marker === "alle9") {
      liveFx.fireworks(20000);
    } else if (marker === "pudel") {
      liveFx.stop(); liveFx.explosion(btn, "brown");
    } else if (marker === "triclops") {
      liveFx.stop(); liveFx.explosion(btn, "purple");
    }

    // Flying Sheep bei 9er/Kranz
    if ((marker === "alle9" || marker === "kranz") && window.flyingSheep) {
      var p = gameOrder[currentTurnIdx];
      if (p) {
        var rect = btn.getBoundingClientRect();
        window.flyingSheep.spawn(rect.left + rect.width / 2, rect.top, p.id, p.name.charAt(0).toUpperCase(), p.name);
      }
    }

    if (vaState.currentThrow >= 5) {
      // Volle done for this player -> next
      var player = gameOrder[currentTurnIdx];
      vaState.results[player.id].volle = vaState.volleThrows.reduce(function(a,b) { return a + b.val; }, 0);
      vaState.throwHistory[player.id] = vaState.throwHistory[player.id] || {};
      vaState.throwHistory[player.id].volleThrows = vaState.volleThrows.slice();
      currentTurnIdx++;
      renderVATurn();
      return;
    }
    renderVAPlayerUI();
  }

  function vaOnVolleUndo() {
    if (vaState.volleThrows.length > 0) {
      var lastEntry = vaState.volleThrows.pop();
      vaState.currentThrow = vaState.volleThrows.length;
      if (lastEntry.marker) triggerAutoMarker(gameOrder[currentTurnIdx], lastEntry.marker, -1);
    } else if (currentTurnIdx > 0) {
      // Cross-player undo
      currentTurnIdx--;
      var prevPlayer = gameOrder[currentTurnIdx];
      var hist = vaState.throwHistory[prevPlayer.id];
      if (hist && hist.volleThrows && hist.volleThrows.length > 0) {
        vaState.volleThrows = hist.volleThrows.slice();
        if (vaState.volleThrows[0] && vaState.volleThrows[0].direct) {
          vaState.directEntry = true;
          vaState.volleThrows = [];
          vaState.currentThrow = 0;
        } else {
          var lastEntry = vaState.volleThrows.pop();
          vaState.currentThrow = vaState.volleThrows.length;
          if (lastEntry.marker) triggerAutoMarker(prevPlayer, lastEntry.marker, -1);
        }
        vaState.results[prevPlayer.id].volle = vaState.volleThrows.reduce(function(a,b) { return a + b.val; }, 0);
      } else {
        vaState.volleThrows = [];
        vaState.currentThrow = 0;
      }
      vaState.phase = "volle";
      updateShuffleHighlight(currentTurnIdx);
    }
    renderVAPlayerUI();
  }

  // --- V+A Abräumen callbacks ---
  function vaOnAbraeumenConfirm(fallenPins) {
    var standingPinsBefore = vaState.standingPins.slice();

    // Remove fallen pins from standing
    vaState.standingPins = vaState.standingPins.filter(function(p) {
      return fallenPins.indexOf(p) === -1;
    });

    var wasAlle9 = vaState.standingPins.length === 0;
    var wasKranz = vaState.standingPins.length === 1 && vaState.standingPins[0] === 5;
    var rebuild = wasAlle9 || wasKranz;
    var fromFull = standingPinsBefore.length === 9;
    var count = (wasKranz && fromFull) ? 12 : fallenPins.length;

    var confirmBtn = document.getElementById("vaConfirmThrow");
    if (wasAlle9 && fromFull) {
      triggerAutoMarker(gameOrder[currentTurnIdx], "alle9", 1);
      liveFx.fireworks(20000);
      // Flying Sheep bei 9er im Abräumen
      if (window.flyingSheep) {
        var p = gameOrder[currentTurnIdx];
        if (p && confirmBtn) {
          var rect = confirmBtn.getBoundingClientRect();
          window.flyingSheep.spawn(rect.left + rect.width / 2, rect.top, p.id, p.name.charAt(0).toUpperCase(), p.name);
        }
      }
    } else if (wasKranz && fromFull) {
      triggerAutoMarker(gameOrder[currentTurnIdx], "kranz", 1);
      if (confirmBtn) liveFx.confetti(confirmBtn);
      // Flying Sheep bei Kranz im Abräumen
      if (window.flyingSheep) {
        var p = gameOrder[currentTurnIdx];
        if (p && confirmBtn) {
          var rect = confirmBtn.getBoundingClientRect();
          window.flyingSheep.spawn(rect.left + rect.width / 2, rect.top, p.id, p.name.charAt(0).toUpperCase(), p.name);
        }
      }
    } else if (count > 0 && confirmBtn) {
      liveFx.explosion(confirmBtn, "accent", count * 5);
    }

    if (rebuild) {
      vaState.standingPins = [1,2,3,4,5,6,7,8,9];
    }

    vaState.abraeumenThrows.push({ fallen: fallenPins, count: count, standingPinsBefore: standingPinsBefore, wasAlle9: wasAlle9, wasKranz: wasKranz, fromFull: fromFull });

    // Bei erstem Wurf: Pinkler zurück an Originalposition animieren
    if (vaState.abraeumenThrows.length === 1) restorePinklerIfNeeded();

    if (vaState.abraeumenThrows.length >= 5) {
      finishVAPlayer();
    } else {
      renderVAPlayerUI();
    }
  }

  function vaOnAbraeumenUndo() {
    if (vaState.abraeumenThrows.length > 0) {
      var lastThrow = vaState.abraeumenThrows.pop();
      vaState.standingPins = lastThrow.standingPinsBefore;
      if (lastThrow.wasAlle9 && lastThrow.fromFull) triggerAutoMarker(gameOrder[currentTurnIdx], "alle9", -1);
      if (lastThrow.wasKranz && lastThrow.fromFull) triggerAutoMarker(gameOrder[currentTurnIdx], "kranz", -1);
    }
    renderVAPlayerUI();
  }

  function vaOnAbraeumenInvert() {
    shuffleArea.querySelectorAll(".pin-btn").forEach(function(btn) {
      if (btn.classList.contains("pin-selected")) {
        btn.classList.remove("pin-selected");
        btn.classList.add("pin-standing");
      } else if (btn.classList.contains("pin-standing")) {
        btn.classList.remove("pin-standing");
        btn.classList.add("pin-selected");
      }
    });
    updateFallenCount();
  }

  function renderPinDiamond() {
    // Kegel-Aufstellung (Raute von oben gesehen):
    //     1
    //    2 3
    //   4 5 6
    //    7 8
    //     9
    var rows = [[1], [2,3], [4,5,6], [7,8], [9]];
    var html = '<div class="pin-diamond">';
    rows.forEach(function(row) {
      html += '<div class="pin-row">';
      row.forEach(function(pin) {
        var standing = vaState.standingPins.indexOf(pin) !== -1;
        html += '<button type="button" class="pin-btn' + (standing ? ' pin-standing' : ' pin-fallen') + '" data-pin="' + pin + '">' + pin + '</button>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderVAPicker() {
    // 2-row × 7-column grid:
    // Row 1: [0]     [1][2][3][4]  [ ][9er]
    // Row 2: [Pudel] [5][6][7][8]  [Tri][K]
    var html = '<div class="va-picker-grid">';
    // Row 1
    html += '<button type="button" class="va-picker-btn" data-va-pick="0">0</button>';
    html += '<button type="button" class="va-picker-btn" data-va-pick="1">1</button>';
    html += '<button type="button" class="va-picker-btn" data-va-pick="2">2</button>';
    html += '<button type="button" class="va-picker-btn" data-va-pick="3">3</button>';
    html += '<button type="button" class="va-picker-btn" data-va-pick="4">4</button>';
    html += '<span class="va-picker-spacer"></span>';
    html += '<button type="button" class="va-picker-btn va-picker-9er" data-va-pick="9er">9</button>';
    // Row 2
    html += '<button type="button" class="va-picker-btn va-picker-pudel" data-va-pick="pudel">Pudel</button>';
    html += '<button type="button" class="va-picker-btn" data-va-pick="5">5</button>';
    html += '<button type="button" class="va-picker-btn" data-va-pick="6">6</button>';
    html += '<button type="button" class="va-picker-btn" data-va-pick="7">7</button>';
    html += '<button type="button" class="va-picker-btn" data-va-pick="8">8</button>';
    html += '<button type="button" class="va-picker-btn va-picker-tri" data-va-pick="triclops"><span class="tri-pins"><span></span><span></span><span></span></span></button>';
    html += '<button type="button" class="va-picker-btn va-picker-kranz" data-va-pick="kranz">12</button>';
    html += '</div>';
    return html;
  }

  function renderVADirectEntry(player) {
    var html = '<div class="va-direct-container">';
    if (vaState.round === "volle") {
      var volleSum = vaState.results[player.id] ? vaState.results[player.id].volle : 0;
      if (vaState.volleThrows.length > 0) {
        volleSum = vaState.volleThrows.reduce(function(a,b) { return a + b.val; }, 0);
      }
      html += '<h3 class="va-direct-title">Volle direkt eingeben</h3>';
      html += '<div class="va-direct-fields">';
      html += '<div class="va-direct-field">';
      html += '<label>Volle</label>';
      html += '<input type="number" min="0" max="999" step="1" id="vaDirectVolle" value="' + volleSum + '" class="va-direct-input" autofocus />';
      html += '</div>';
      html += '</div>';
    } else {
      var abraeumenSum = vaState.results[player.id] ? vaState.results[player.id].abraeumen : 0;
      html += '<h3 class="va-direct-title">Abr\u00e4umen direkt eingeben</h3>';
      html += '<div class="va-direct-fields">';
      html += '<div class="va-direct-field">';
      html += '<label>Abr\u00e4umen</label>';
      html += '<input type="number" min="0" max="999" step="1" id="vaDirectAbraeumen" value="' + abraeumenSum + '" class="va-direct-input" autofocus />';
      html += '</div>';
      html += '</div>';
    }
    html += '<div class="va-direct-actions">';
    html += '<button type="button" class="va-direct-save" id="vaDirectSave">\u00dcbernehmen \u2713</button>';
    html += '<button type="button" class="va-direct-back" id="vaDirectBack">Wurf f\u00fcr Wurf \u25B6</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function attachVADirectEntryHandlers() {
    // Direct entry back to throw-by-throw
    var backBtn = document.getElementById("vaDirectBack");
    if (backBtn) {
      backBtn.addEventListener("click", function() {
        vaState.directEntry = false;
        renderVAPlayerUI();
      });
    }

    // Direct entry save
    var saveBtn = document.getElementById("vaDirectSave");
    if (saveBtn) {
      saveBtn.addEventListener("click", function() {
        var player = gameOrder[currentTurnIdx];
        vaState.throwHistory[player.id] = vaState.throwHistory[player.id] || {};
        if (vaState.round === "volle") {
          var volleVal = Number(document.getElementById("vaDirectVolle").value) || 0;
          vaState.results[player.id].volle = volleVal;
          vaState.throwHistory[player.id].volleThrows = [{ val: volleVal, marker: null, direct: true }];
        } else {
          var abraeumenVal = Number(document.getElementById("vaDirectAbraeumen").value) || 0;
          vaState.results[player.id].abraeumen = abraeumenVal;
          vaState.results[player.id].total = vaState.results[player.id].volle + abraeumenVal;
          syncVAPlayerToKladde(player, vaState.results[player.id].total);
          vaState.throwHistory[player.id].abraeumenThrows = [{ fallen: [], count: abraeumenVal, direct: true }];
        }
        currentTurnIdx++;
        renderVATurn();
      });
    }
  }

  function updateFallenCount() {
    var count = shuffleArea.querySelectorAll(".pin-btn.pin-selected").length;
    var el = document.getElementById("vaFallenCount");
    if (el) el.textContent = "Getroffen: " + count;
  }

  function finishVAPlayer() {
    var player = gameOrder[currentTurnIdx];
    var abraeumenSum = vaState.abraeumenThrows.reduce(function(a,b) { return a + b.count; }, 0);
    vaState.results[player.id].abraeumen = abraeumenSum;
    vaState.results[player.id].total = vaState.results[player.id].volle + abraeumenSum;

    vaState.throwHistory[player.id] = vaState.throwHistory[player.id] || {};
    vaState.throwHistory[player.id].abraeumenThrows = vaState.abraeumenThrows.map(function(t) {
      return { fallen: t.fallen.slice(), count: t.count, standingPinsBefore: t.standingPinsBefore ? t.standingPinsBefore.slice() : [], wasAlle9: !!t.wasAlle9 };
    });

    // Write to Kladde
    syncVAPlayerToKladde(player, vaState.results[player.id].total);

    currentTurnIdx++;
    renderVATurn();
  }

  function syncVAPlayerToKladde(player, total) {
    var input = player.row.querySelector('[name="va_' + player.id + '"]');
    if (input) {
      input.value = total;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function triggerAutoMarker(player, markerType, delta) {
    // delta: +1 or -1
    var selector = delta > 0
      ? '.mark-btn:not(.mark-dec)[data-mark-target="' + markerType + '"]'
      : '.mark-btn.mark-dec[data-mark-target="' + markerType + '"]';
    var btn = player.row.querySelector(selector);
    if (btn && !btn.disabled) btn.click();

    // Update old sidebar display (for non-V+A modes)
    var sidebarBtn = playersContainer.querySelector('[data-lm-member="' + player.id + '"]');
    if (sidebarBtn && activeMarkerTab === markerType) {
      updatePlayerBtnVal(sidebarBtn, player);
    }
    // Update shuffle sidebar table marker cell
    var table = document.getElementById("shuffleSidebarTable");
    if (table) {
      var row = table.querySelector('.sst-row[data-player-id="' + player.id + '"]');
      if (row) {
        var cell = row.querySelector('[data-sst-col="' + markerType + '"]');
        if (cell) {
          var val = getPlayerMarkerVal(player, markerType);
          cell.textContent = val > 0 ? val : "";
        }
      }
    }
  }

  function calcVARankCosts(scoreKey) {
    var sorted = gameOrder.slice().sort(function(a, b) {
      return (vaState.results[a.id][scoreKey] || 0) - (vaState.results[b.id][scoreKey] || 0);
    });
    var n = sorted.length;
    var losers = Math.ceil(n / 2);
    var costs = {};
    sorted.forEach(function(p, i) {
      if (i < losers) {
        if (i > 0 && vaState.results[p.id][scoreKey] === vaState.results[sorted[i - 1].id][scoreKey]) {
          costs[p.id] = costs[sorted[i - 1].id];
        } else {
          costs[p.id] = (losers - i) * 2;
        }
      } else {
        costs[p.id] = 0;
      }
    });
    return costs;
  }

  function renderVAResults() {
    // Throw-Log: Einzelwürfe in DB speichern
    var throwLogEntries = [];
    gameOrder.forEach(function(p) {
      var hist = vaState.throwHistory[p.id];
      if (!hist) return;
      if (hist.volleThrows && hist.volleThrows.length > 0 && !hist.volleThrows[0].direct) {
        hist.volleThrows.forEach(function(t, i) {
          throwLogEntries.push({
            userId: p.id, phase: "volle", roundNum: null,
            throwNum: i + 1, throwValue: t.val, marker: t.marker || null,
            fallenPins: null
          });
        });
      }
      if (hist.abraeumenThrows && hist.abraeumenThrows.length > 0 && !(hist.abraeumenThrows[0] && hist.abraeumenThrows[0].direct)) {
        hist.abraeumenThrows.forEach(function(t, i) {
          var marker = null;
          if (t.wasAlle9) marker = "alle9";
          throwLogEntries.push({
            userId: p.id, phase: "abraeumen", roundNum: null,
            throwNum: i + 1, throwValue: t.count,
            marker: marker,
            fallenPins: t.fallen ? JSON.stringify(t.fallen) : null
          });
        });
      }
    });
    saveThrowLog("va", throwLogEntries);

    // Kosten separat für Volle und Abräumen berechnen
    var volleCosts = calcVARankCosts("volle");
    var abraeumenCosts = calcVARankCosts("abraeumen");
    var costs = {};
    gameOrder.forEach(function(p) {
      costs[p.id] = (volleCosts[p.id] || 0) + (abraeumenCosts[p.id] || 0);
    });

    // Sort by total descending for display
    var display = gameOrder.slice().sort(function(a, b) {
      return vaState.results[b.id].total - vaState.results[a.id].total;
    });

    var fmtCost = function(z) { return z > 0 ? (z / 10).toFixed(2).replace(".", ",") + " \u20ac" : "\u2014"; };

    var html = '<div class="va-results">';
    html += '<h3 class="va-results-title">Volle + Abräumen \u2014 Ergebnis</h3>';
    html += '<table class="va-results-table">';
    html += '<thead><tr><th>#</th><th>Spieler</th><th class="va-gap"></th><th class="va-block-v">V</th><th class="va-block-v">€</th><th class="va-gap"></th><th class="va-block-a">A</th><th class="va-block-a">€</th><th class="va-gap"></th><th class="va-block-sum">&sum; €</th></tr></thead>';
    html += '<tbody>';
    display.forEach(function(p, i) {
      var r = vaState.results[p.id];
      var cost = costs[p.id];
      var vC = volleCosts[p.id] || 0;
      var aC = abraeumenCosts[p.id] || 0;
      html += '<tr' + (cost > 0 ? ' class="va-result-loser"' : '') + '>';
      html += '<td>' + (i + 1) + '.</td>';
      html += '<td class="va-sb-name-cell">' + playerAvatarHtml(p, "va-sb-avatar") + ' ' + escHtml(p.name) + '</td>';
      html += '<td class="va-gap"></td>';
      html += '<td class="va-block-v">' + r.volle + '</td>';
      html += '<td class="va-block-v va-result-cost">' + fmtCost(vC) + '</td>';
      html += '<td class="va-gap"></td>';
      html += '<td class="va-block-a">' + r.abraeumen + '</td>';
      html += '<td class="va-block-a va-result-cost">' + fmtCost(aC) + '</td>';
      html += '<td class="va-gap"></td>';
      html += '<td class="va-block-sum va-result-cost va-result-total" data-va-cost-id="' + p.id + '">' + fmtCost(cost) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<div class="va-results-actions">';
    html += '<button type="button" class="va-results-accept" id="vaAcceptBtn">\u00dcbernehmen \u2713</button>';
    html += '<button type="button" class="va-results-edit" id="vaEditCostsBtn">Kosten anpassen \u270F\uFE0F</button>';
    html += '</div>';
    html += '</div>';

    gameContent.innerHTML = html;
    liveControls.clear(); // Clear controls panel for results view

    // Store costs for later
    vaState.costs = costs;

    document.getElementById("vaAcceptBtn").addEventListener("click", function() {
      syncVACostsToKladde();
      showToast("V+A \u00fcbernommen!", "success");
      closeLiveMode();
    });

    document.getElementById("vaEditCostsBtn").addEventListener("click", function() {
      // Make cost cells editable
      gameContent.querySelectorAll("[data-va-cost-id]").forEach(function(td) {
        var pid = td.dataset.vaCostId;
        var zehntel = vaState.costs[pid] || 0;
        td.innerHTML = '<input type="number" min="0" max="999" step="1" class="va-cost-input" data-va-cost-edit="' + pid + '" value="' + zehntel + '" />';
      });
      // Replace edit button with save
      document.getElementById("vaEditCostsBtn").textContent = "Speichern";
      document.getElementById("vaEditCostsBtn").addEventListener("click", function() {
        gameContent.querySelectorAll("[data-va-cost-edit]").forEach(function(inp) {
          vaState.costs[inp.dataset.vaCostEdit] = Number(inp.value) || 0;
        });
        renderVAResults(); // re-render with new costs
      }, { once: true });
    });

    saveLiveState();
  }

  function syncVACostsToKladde() {
    gameOrder.forEach(function(p) {
      var total = vaState.results[p.id] ? vaState.results[p.id].total : 0;
      syncVAPlayerToKladde(p, total);
    });
    recalcCosts();
  }

  // =============================================
  // --- Aussteigen (Throw-based, V+A Layout) ---
  // =============================================
  function renderAussteigenGame() {
    var cumInit = {};
    gameOrder.forEach(function(p) { cumInit[p.id] = 0; });
    aussteigenState = {
      remaining: gameOrder.slice(),
      eliminated: [],
      currentRound: 1,
      currentPlayerIdx: 0,
      roundThrows: {},
      throwHistory: [],
      allThrows: [],
      cumulativeTotals: cumInit,
      roundSnapshots: [],
      currentPosition: 0,
      costs: null
    };
    renderAussteigenUI();
  }

  // Compute which cost-column positions are skipped due to ties
  function aussteigenSkippedPositions() {
    var skipped = {};
    var pos = 0;
    for (var i = 0; i < aussteigenState.roundSnapshots.length; i++) {
      var snap = aussteigenState.roundSnapshots[i];
      var elimCount = snap.eliminatedIds.length;
      // Position pos is used. If elimCount > 1, skip the next (elimCount-1) positions.
      for (var s = 1; s < elimCount; s++) {
        skipped[pos + s] = true;
      }
      pos += elimCount;
    }
    return skipped;
  }

  function buildAussteigenTableHtml() {
    var n = gameOrder.length;
    var skipped = aussteigenSkippedPositions();

    // Build snapshot lookup: position → snapshot
    var snapByPos = {};
    aussteigenState.roundSnapshots.forEach(function(snap) {
      snapByPos[snap.position] = snap;
    });

    // Build eliminated map: playerId → {position, cumTotal}
    var elimMap = {};
    aussteigenState.roundSnapshots.forEach(function(snap) {
      snap.eliminatedIds.forEach(function(id) {
        elimMap[id] = { position: snap.position, cumTotal: snap.cumulatives[id] };
      });
    });

    // Current round partial cumulatives (for players who have thrown this round)
    var partialCum = {};
    aussteigenState.remaining.forEach(function(p) {
      var rt = aussteigenState.roundThrows[p.id];
      if (rt) {
        partialCum[p.id] = (aussteigenState.cumulativeTotals[p.id] || 0) + rt.val;
      }
    });

    // Find lowest partial cumulative (the player currently in danger)
    var partialKeys = Object.keys(partialCum);
    var minPartialCum = Infinity;
    if (partialKeys.length > 1) {
      partialKeys.forEach(function(id) {
        if (partialCum[id] < minPartialCum) minPartialCum = partialCum[id];
      });
    }

    var html = '<div class="aussteigen-table-wrap">';
    html += '<table class="aussteigen-table" id="aussteigenTable">';
    html += '<thead><tr>';
    html += '<th class="ast-player">Spieler</th>';
    html += '<th class="ast-marker" data-ast-col="alle9">9</th>';
    html += '<th class="ast-marker" data-ast-col="kranz">K</th>';
    html += '<th class="ast-marker" data-ast-col="triclops">T</th>';
    html += '<th class="ast-marker" data-ast-col="pudel">P</th>';
    // Cost columns: position 0 (highest cost) → position n-1 (0,00)
    for (var pos = 0; pos < n; pos++) {
      var costZehntel = n - 1 - pos;
      var eur = (costZehntel / 10).toFixed(2).replace(".", ",");
      var isSkipped = !!skipped[pos];
      var isCurrent = pos === aussteigenState.currentPosition && aussteigenState.remaining.length > 1;
      html += '<th class="ast-cost' + (isSkipped ? ' ast-skipped' : '') + (isCurrent ? ' ast-col-active' : '') + '">' + eur + '</th>';
    }
    html += '</tr></thead><tbody>';

    gameOrder.forEach(function(p) {
      var isEliminated = !!elimMap[p.id];
      var isRemaining = aussteigenState.remaining.some(function(r) { return r.id === p.id; });
      var isCurrentPlayer = isRemaining && aussteigenState.remaining[aussteigenState.currentPlayerIdx] &&
                            aussteigenState.remaining[aussteigenState.currentPlayerIdx].id === p.id;
      var initials = getInitials(p.name);
      var color = initialColor(p.name);
      var avatarHtml = p.avatar
        ? '<img src="' + p.avatar + '" class="ast-avatar" />'
        : '<span class="ast-avatar ast-initials" style="background:' + color + '">' + escHtml(initials) + '</span>';

      html += '<tr class="ast-row' + (isEliminated ? ' ast-out' : '') + (isCurrentPlayer ? ' ast-active' : '') + '" data-player-id="' + p.id + '">';
      html += '<td class="ast-player-cell">';
      html += avatarHtml;
      html += '<span class="ast-name">' + escHtml(p.name) + '</span>';
      html += '</td>';

      // Marker columns: 9, K, T, P
      var markers = ["alle9", "kranz", "triclops", "pudel"];
      markers.forEach(function(m) {
        var val = getPlayerMarkerVal(p, m);
        html += '<td class="ast-marker-cell">' + (val > 0 ? val : '') + '</td>';
      });

      // Cost columns
      for (var pos = 0; pos < n; pos++) {
        var isSkipped = !!skipped[pos];
        var isCurrent = pos === aussteigenState.currentPosition && aussteigenState.remaining.length > 1;
        var cellContent = '';
        var cellClass = 'ast-cost-cell';

        if (isSkipped) {
          cellClass += ' ast-skipped';
        } else {
          // Past completed rounds: show cumulative for this player if they were in that round
          var snap = snapByPos[pos];
          if (snap && snap.cumulatives[p.id] !== undefined) {
            var cumVal = snap.cumulatives[p.id];
            // Find previous snapshot's cumulative for this player to derive single throw
            var prevCumVal = 0;
            for (var si = 0; si < aussteigenState.roundSnapshots.length; si++) {
              if (aussteigenState.roundSnapshots[si].position === pos) break;
              if (aussteigenState.roundSnapshots[si].cumulatives[p.id] !== undefined) {
                prevCumVal = aussteigenState.roundSnapshots[si].cumulatives[p.id];
              }
            }
            var singleThrow = cumVal - prevCumVal;
            if (prevCumVal > 0) {
              cellContent = '<span class="ast-throw-hint">(+' + singleThrow + ')</span>' + cumVal;
            } else {
              cellContent = String(cumVal);
            }
            if (snap.eliminatedIds.indexOf(p.id) !== -1) {
              cellClass += ' ast-cost-elim';
            }
          }
          // Current round: show partial cumulative for players who have thrown
          if (isCurrent && partialCum[p.id] !== undefined) {
            var rt = aussteigenState.roundThrows[p.id];
            var prevCum = aussteigenState.cumulativeTotals[p.id] || 0;
            if (prevCum > 0 && rt) {
              cellContent = '<span class="ast-throw-hint">(+' + rt.val + ') </span>' + partialCum[p.id];
            } else {
              cellContent = String(partialCum[p.id]);
            }
            // Mark the current lowest (danger zone)
            if (partialKeys.length > 1 && partialCum[p.id] === minPartialCum) {
              cellClass += ' ast-danger';
            }
          }
          // Winner in final column
          if (pos === n - 1 && !isEliminated && isRemaining && aussteigenState.remaining.length === 1) {
            cellContent = '\uD83C\uDFC6';
          }
        }

        if (isCurrent && !isSkipped) cellClass += ' ast-col-active';
        if (isCurrentPlayer && isCurrent && !isSkipped) cellClass += ' ast-cell-current';
        html += '<td class="' + cellClass + '">' + cellContent + '</td>';
      }

      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  function renderAussteigenUI() {
    if (aussteigenState.remaining.length <= 1) {
      renderAussteigenResults();
      return;
    }

    var currentPlayer = aussteigenState.remaining[aussteigenState.currentPlayerIdx];

    var mainHtml = '';
    mainHtml += '<div class="va-player-heading">' + escHtml(currentPlayer ? currentPlayer.name : '') + '</div>';
    mainHtml += '<div class="va-phase-title">Aussteigen \u2014 Runde ' + aussteigenState.currentRound +
                ', Wurf ' + (aussteigenState.currentPlayerIdx + 1) + '/' + aussteigenState.remaining.length + '</div>';
    mainHtml += buildAussteigenTableHtml();
    gameContent.innerHTML = mainHtml;

    liveControls.renderVolle({
      onPick: aussteigenOnPick,
      onUndo: aussteigenOnUndo,
      canUndo: aussteigenState.throwHistory.length > 0
    });

    saveLiveState();
  }

  function aussteigenOnPick(throwVal, marker, btn) {
    var player = aussteigenState.remaining[aussteigenState.currentPlayerIdx];
    if (!player) return;

    // Store throw
    aussteigenState.roundThrows[player.id] = { val: throwVal, marker: marker };
    aussteigenState.throwHistory.push({ playerId: player.id, val: throwVal, marker: marker });
    aussteigenState.allThrows.push({ playerId: player.id, round: aussteigenState.currentRound, val: throwVal, marker: marker });

    // Trigger auto-markers
    if (marker) triggerAutoMarker(player, marker, 1);

    // Visual effects
    if (marker === "kranz") {
      liveFx.stop(); liveFx.confetti(btn);
      setTimeout(function() { liveFx.fireworks(20000); }, 600);
    } else if (marker === "alle9") {
      liveFx.fireworks(20000);
    } else if (marker === "pudel") {
      liveFx.stop(); liveFx.explosion(btn, "brown");
    } else if (marker === "triclops") {
      liveFx.stop(); liveFx.explosion(btn, "purple");
    }

    // Flying Sheep bei 9er/Kranz
    if ((marker === "alle9" || marker === "kranz") && window.flyingSheep) {
      var rect = btn.getBoundingClientRect();
      window.flyingSheep.spawn(rect.left + rect.width / 2, rect.top, player.id, player.name.charAt(0).toUpperCase(), player.name);
    }

    // Advance to next player
    aussteigenState.currentPlayerIdx++;

    // Check if all remaining players have thrown this round
    if (aussteigenState.currentPlayerIdx >= aussteigenState.remaining.length) {
      aussteigenEliminateLowest();
    } else {
      renderAussteigenUI();
    }
  }

  function aussteigenOnUndo() {
    if (aussteigenState.throwHistory.length === 0) return;

    var lastThrow = aussteigenState.throwHistory.pop();
    if (aussteigenState.allThrows.length > 0) aussteigenState.allThrows.pop();
    var playerId = lastThrow.playerId;

    // Remove this player's round throw
    delete aussteigenState.roundThrows[playerId];

    // Undo marker
    if (lastThrow.marker) {
      var player = gameOrder.find(function(p) { return p.id === playerId; });
      if (player) triggerAutoMarker(player, lastThrow.marker, -1);
    }

    // Move cursor back
    aussteigenState.currentPlayerIdx = Math.max(0, aussteigenState.currentPlayerIdx - 1);
    renderAussteigenUI();
  }

  function aussteigenEliminateLowest() {
    // Update cumulative totals for all remaining players
    aussteigenState.remaining.forEach(function(p) {
      var rt = aussteigenState.roundThrows[p.id];
      if (rt) {
        aussteigenState.cumulativeTotals[p.id] = (aussteigenState.cumulativeTotals[p.id] || 0) + rt.val;
      }
    });

    // Find the lowest cumulative total among remaining players
    var minCum = Infinity;
    aussteigenState.remaining.forEach(function(p) {
      var cum = aussteigenState.cumulativeTotals[p.id];
      if (cum < minCum) minCum = cum;
    });

    // Collect all players with the lowest cumulative total
    var losers = aussteigenState.remaining.filter(function(p) {
      return aussteigenState.cumulativeTotals[p.id] === minCum;
    });

    // Build snapshot: cumulatives for ALL remaining players this round
    var cumulatives = {};
    aussteigenState.remaining.forEach(function(p) {
      cumulatives[p.id] = aussteigenState.cumulativeTotals[p.id];
    });
    var eliminatedIds = losers.map(function(p) { return p.id; });
    aussteigenState.roundSnapshots.push({
      position: aussteigenState.currentPosition,
      cumulatives: cumulatives,
      eliminatedIds: eliminatedIds
    });

    // Build eliminated group
    var eliminatedGroup = losers.map(function(p) {
      return {
        id: p.id,
        round: aussteigenState.currentRound,
        cumTotal: aussteigenState.cumulativeTotals[p.id]
      };
    });
    aussteigenState.eliminated.push(eliminatedGroup);

    // Show toast with names
    var loserNames = losers.map(function(p) { return p.name; }).join(", ");
    showToast(loserNames + " raus! (Summe: " + minCum + ")", "info");

    // Remove losers from remaining
    var loserIds = losers.map(function(p) { return p.id; });
    aussteigenState.remaining = aussteigenState.remaining.filter(function(p) {
      return loserIds.indexOf(p.id) === -1;
    });

    // Advance position: skip columns for ties
    aussteigenState.currentPosition += losers.length;

    // Reset round state
    aussteigenState.roundThrows = {};
    aussteigenState.throwHistory = [];
    aussteigenState.currentPlayerIdx = 0;
    aussteigenState.currentRound++;

    // Check if game over
    if (aussteigenState.remaining.length <= 1) {
      renderAussteigenResults();
    } else {
      renderAussteigenUI();
    }
  }

  function renderAussteigenResults() {
    // Throw-Log: Einzelwürfe in DB speichern
    var throwLogEntries = aussteigenState.allThrows.map(function(t) {
      return {
        userId: t.playerId, phase: null, roundNum: t.round,
        throwNum: 1, throwValue: t.val, marker: t.marker || null,
        fallenPins: null
      };
    });
    saveThrowLog("aussteigen", throwLogEntries);

    var totalPlayers = gameOrder.length;
    var costs = calcAussteigenCosts(aussteigenState.eliminated, totalPlayers);
    var winner = aussteigenState.remaining[0];
    aussteigenState.costs = costs;

    var mainHtml = '';
    mainHtml += '<div class="aussteigen-results">';
    mainHtml += '<h3 class="aussteigen-results-title">Aussteigen \u2014 Ergebnis</h3>';

    if (winner) {
      mainHtml += '<div class="aussteigen-winner">';
      mainHtml += '<span class="aussteigen-trophy">\uD83C\uDFC6</span> Gewinner: <strong>' + escHtml(winner.name) + '</strong> (0,00 \u20ac)';
      mainHtml += '</div>';
    }

    // Results table
    mainHtml += '<table class="va-results-table">';
    mainHtml += '<thead><tr><th>Rang</th><th>Spieler</th><th>Kosten</th></tr></thead><tbody>';
    if (winner) {
      mainHtml += '<tr><td>1</td><td>' + escHtml(winner.name) + '</td><td>0,00 \u20ac</td></tr>';
    }
    for (var i = aussteigenState.eliminated.length - 1; i >= 0; i--) {
      var group = aussteigenState.eliminated[i];
      group.forEach(function(e) {
        var p = gameOrder.find(function(g) { return g.id === e.id; });
        var cost = costs[e.id] || 0;
        var costStr = (cost / 10).toFixed(2).replace(".", ",") + " \u20ac";
        var rank = totalPlayers - (costs[e.id] || 0);
        mainHtml += '<tr><td>' + rank + '</td><td>' + escHtml(p ? p.name : "?") + '</td><td>' + costStr + '</td></tr>';
      });
    }
    mainHtml += '</tbody></table>';

    mainHtml += '<div class="aussteigen-results-actions">';
    mainHtml += '<button type="button" class="aussteigen-accept-btn" id="aussteigenAcceptBtn">\u00dcbernehmen \u2713</button>';
    mainHtml += '<button type="button" class="aussteigen-edit-btn" id="aussteigenEditBtn">Kosten anpassen \u270F\uFE0F</button>';
    mainHtml += '</div>';
    mainHtml += '</div>';

    gameContent.innerHTML = mainHtml;
    liveControls.clear();

    document.getElementById("aussteigenAcceptBtn").addEventListener("click", function() {
      syncAussteigenToKladde();
      showToast("Aussteigen \u00fcbernommen!", "success");
      closeLiveMode();
    });

    document.getElementById("aussteigenEditBtn").addEventListener("click", function() {
      var editHtml = '<div class="aussteigen-edit-costs">';
      editHtml += '<h3>Kosten anpassen (Zehntel-Euro)</h3>';
      gameOrder.forEach(function(p) {
        var cost = costs[p.id] || 0;
        editHtml += '<div class="aussteigen-edit-row">';
        editHtml += '<span class="aussteigen-edit-name">' + playerAvatarHtml(p, "aussteigen-edit-avatar") + ' ' + escHtml(p.name) + '</span>';
        editHtml += '<input type="number" min="0" max="999" step="1" class="aussteigen-cost-input" data-aussteigen-cost-id="' + p.id + '" value="' + cost + '" />';
        editHtml += '</div>';
      });
      editHtml += '<div class="aussteigen-edit-actions">';
      editHtml += '<button type="button" id="aussteigenSaveCosts">Speichern \u2713</button>';
      editHtml += '</div>';
      editHtml += '</div>';
      gameContent.innerHTML = editHtml;

      document.getElementById("aussteigenSaveCosts").addEventListener("click", function() {
        gameContent.querySelectorAll("[data-aussteigen-cost-id]").forEach(function(inp) {
          aussteigenState.costs[inp.dataset.aussteigenCostId] = Number(inp.value) || 0;
        });
        costs = aussteigenState.costs;
        renderAussteigenResults();
      });
    });

    saveLiveState();
  }

  function calcAussteigenCosts(eliminatedGroups, totalPlayers) {
    var costs = {};
    var position = 0;
    for (var i = 0; i < eliminatedGroups.length; i++) {
      var group = eliminatedGroups[i];
      var costZehntel = totalPlayers - 1 - position;
      if (costZehntel < 0) costZehntel = 0;
      for (var j = 0; j < group.length; j++) {
        costs[group[j].id] = costZehntel;
      }
      position += group.length;
    }
    return costs;
  }

  function syncAussteigenToKladde() {
    var costs = aussteigenState.costs;
    gameOrder.forEach(function(p) {
      var zehntel = costs[p.id] || 0;
      var input = p.row.querySelector('[name="aussteigen_' + p.id + '"]');
      if (input) {
        input.value = zehntel;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    recalcCosts();
  }

  // =============================================
  // --- 6-Tage-Rennen Game (Live Mode) ---
  // =============================================

  function renderSechsTageGame() {
    // Pair players from gameOrder into teams of 2
    sechsTageState.teams = [];
    for (var i = 0; i < gameOrder.length; i += 2) {
      var throwsInit = {};
      for (var d = 1; d <= 6; d++) {
        throwsInit[d] = { p1: null, p2: null };
      }
      sechsTageState.teams.push({
        p1: gameOrder[i],
        p2: (i + 1 < gameOrder.length) ? gameOrder[i + 1] : null,
        throws: throwsInit
      });
    }
    sechsTageState.currentDay = 1;
    sechsTageState.currentTeamIdx = 0;
    sechsTageState.currentSlot = 1;
    renderSechsTageUI();
  }

  function sechsTageIsFinished() {
    var teams = sechsTageState.teams;
    for (var t = 0; t < teams.length; t++) {
      for (var d = 1; d <= 6; d++) {
        if (teams[t].throws[d].p1 === null) return false;
        if (teams[t].throws[d].p2 === null) return false;
      }
    }
    return true;
  }

  function sechsTageWeighted(raw, day) {
    return (raw === null || raw === undefined) ? null : raw * day;
  }

  function calcSechsTageTeamTotal(team) {
    var total = 0;
    for (var d = 1; d <= 6; d++) {
      var p1 = team.throws[d].p1;
      var p2 = team.throws[d].p2;
      if (p1 !== null) total += p1 * d;
      if (p2 !== null) total += p2 * d;
    }
    return total;
  }

  function calcSechsTageCosts() {
    var teams = sechsTageState.teams;
    var ranked = teams.map(function(t, idx) {
      return { idx: idx, total: calcSechsTageTeamTotal(t) };
    });
    ranked.sort(function(a, b) { return b.total - a.total; });
    var costs = {};
    var rank = 1;
    for (var i = 0; i < ranked.length; i++) {
      if (i > 0 && ranked[i].total === ranked[i - 1].total) {
        // Same rank as previous (tie)
      } else {
        rank = i + 1;
      }
      var costZehntel = (rank - 1) * 2;
      var team = teams[ranked[i].idx];
      costs[team.p1.id] = costZehntel;
      if (team.p2) costs[team.p2.id] = costZehntel;
    }
    return costs;
  }

  // Renders team cards into gameContent (LEFT) and picker into shuffleArea (RIGHT)
  function renderSechsTageUI() {
    if (sechsTageIsFinished()) {
      renderSechsTageResults();
      return;
    }

    var teams = sechsTageState.teams;
    var curDay = sechsTageState.currentDay;
    var curTeam = sechsTageState.currentTeamIdx;
    var curSlot = sechsTageState.currentSlot;

    var activeTeam = teams[curTeam];
    var activePlayer = curSlot === 1 ? activeTeam.p1 : (activeTeam.p2 || activeTeam.p1);
    var isSolo = !activeTeam.p2;

    // === LEFT side (gameContent): team cards ===
    var html = '<div class="st-container">';

    // Team cards
    html += '<div class="st-cards">';
    for (var t = 0; t < teams.length; t++) {
      var team = teams[t];
      var solo = !team.p2;
      var isActiveTeam = (t === curTeam);

      html += '<div class="st-card' + (isActiveTeam ? ' st-card-active' : '') + '">';
      if (solo) {
        html += '<div class="st-card-header"><span class="st-solo-tag">Solo</span></div>';
      }

      html += '<div class="st-grid">';

      // Column headers
      html += '<div class="st-label"></div>';
      for (var d = 1; d <= 6; d++) {
        html += '<div class="st-header">&times;' + d + '</div>';
      }
      html += '<div class="st-header st-header-total">Ges.</div>';

      // P1 row
      html += '<div class="st-label st-name">' + playerAvatarHtml(team.p1, "st-row-avatar") + ' ' + escHtml(solo ? team.p1.name : team.p1.name.split(' ')[0]) + '</div>';
      var p1Total = 0;
      for (var d = 1; d <= 6; d++) {
        var val = team.throws[d].p1;
        var weighted = sechsTageWeighted(val, d);
        if (weighted !== null) p1Total += weighted;
        var isActive = isActiveTeam && d === curDay && curSlot === 1;
        html += '<div class="st-cell' + (isActive ? ' st-active' : '') + (val === null ? ' st-empty' : '') + '">';
        html += val !== null ? weighted : '';
        html += '</div>';
      }
      html += '<div class="st-cell st-cell-total">' + p1Total + '</div>';

      // Running sum row
      html += '<div class="st-label st-sum-label">Summe</div>';
      var runSum = 0;
      for (var d = 1; d <= 6; d++) {
        var v1 = team.throws[d].p1;
        var v2 = team.throws[d].p2;
        if (v1 !== null) runSum += v1 * d;
        if (v2 !== null) runSum += v2 * d;
        html += '<div class="st-cell st-sum">' + runSum + '</div>';
      }
      var teamTotal = calcSechsTageTeamTotal(team);
      html += '<div class="st-cell st-sum st-cell-total">' + teamTotal + '</div>';

      // P2 row
      var p2Player = solo ? team.p1 : team.p2;
      var p2Name = solo ? 'Wurf 2' : team.p2.name.split(' ')[0];
      html += '<div class="st-label st-name">' + (solo ? '' : playerAvatarHtml(p2Player, "st-row-avatar") + ' ') + escHtml(p2Name) + '</div>';
      var p2Total = 0;
      for (var d = 1; d <= 6; d++) {
        var val = team.throws[d].p2;
        var weighted = sechsTageWeighted(val, d);
        if (weighted !== null) p2Total += weighted;
        var isActive = isActiveTeam && d === curDay && curSlot === 2;
        html += '<div class="st-cell' + (isActive ? ' st-active' : '') + (val === null ? ' st-empty' : '') + '">';
        html += val !== null ? weighted : '';
        html += '</div>';
      }
      html += '<div class="st-cell st-cell-total">' + p2Total + '</div>';

      html += '</div>'; // .st-grid
      html += '</div>'; // .st-card
    }
    html += '</div>'; // .st-cards
    html += '</div>'; // .st-container

    gameContent.innerHTML = html;

    // === RIGHT side (shuffleArea): VA picker via liveControls ===
    // Player heading on LEFT side (inside gameContent)
    var headingHtml = '<div class="va-player-heading">' + escHtml(activePlayer.name) + '</div>';
    headingHtml += '<div class="st-picker-info">';
    headingHtml += '<span class="st-day-badge">Tag ' + curDay + ' / 6</span>';
    if (isSolo) headingHtml += ' <span class="st-solo-badge">(Solo ' + (curSlot === 1 ? 'W1' : 'W2') + ')</span>';
    headingHtml += '</div>';
    gameContent.insertAdjacentHTML("afterbegin", headingHtml);

    liveControls.renderVolle({
      onPick: function(throwVal, marker, btn) {
        onSechsTageValue(throwVal);
        // Flying Sheep bei 9er/Kranz
        if ((marker === "alle9" || marker === "kranz") && window.flyingSheep && activePlayer) {
          var rect = btn.getBoundingClientRect();
          window.flyingSheep.spawn(rect.left + rect.width / 2, rect.top, activePlayer.id, activePlayer.name.charAt(0).toUpperCase(), activePlayer.name);
        }
      },
      onUndo: function() {
        undoSechsTage();
      },
      canUndo: sechsTageCanUndo()
    });

    saveLiveState();
  }

  function sechsTageCanUndo() {
    // Can undo if any throw has been entered
    var st = sechsTageState;
    if (st.currentDay > 1 || st.currentTeamIdx > 0 || st.currentSlot > 1) return true;
    // Check if current position already has a value
    var team = st.teams[st.currentTeamIdx];
    if (team && team.throws[st.currentDay] && team.throws[st.currentDay].p1 !== null) return true;
    return false;
  }

  function undoSechsTage() {
    var st = sechsTageState;

    // Step cursor back
    if (st.currentSlot === 2) {
      // Undo P1 of current team/day (cursor was moved to P2 by advance)
      st.currentSlot = 1;
    } else if (st.currentTeamIdx > 0) {
      st.currentTeamIdx--;
      st.currentSlot = 2;
    } else if (st.currentDay > 1) {
      st.currentDay--;
      st.currentTeamIdx = st.teams.length - 1;
      st.currentSlot = 2;
    } else {
      return; // Nothing to undo
    }

    // Clear the value at the new cursor position
    var team = st.teams[st.currentTeamIdx];
    if (st.currentSlot === 1) {
      team.throws[st.currentDay].p1 = null;
    } else {
      team.throws[st.currentDay].p2 = null;
    }

    renderSechsTageUI();
  }

  function onSechsTageValue(raw) {
    var teams = sechsTageState.teams;
    var team = teams[sechsTageState.currentTeamIdx];
    var day = sechsTageState.currentDay;
    var slot = sechsTageState.currentSlot;

    if (slot === 1) {
      team.throws[day].p1 = raw;
    } else {
      team.throws[day].p2 = raw;
    }

    advanceSechsTage();
    renderSechsTageUI();
  }

  function advanceSechsTage() {
    var teams = sechsTageState.teams;
    var curSlot = sechsTageState.currentSlot;
    var curTeam = sechsTageState.currentTeamIdx;
    var curDay = sechsTageState.currentDay;

    // Within current team: P1 → P2
    if (curSlot === 1) {
      sechsTageState.currentSlot = 2;
      return;
    }

    // P2 done → next team
    if (curTeam + 1 < teams.length) {
      sechsTageState.currentTeamIdx = curTeam + 1;
      sechsTageState.currentSlot = 1;
      return;
    }

    // All teams done for this day → next day
    if (curDay < 6) {
      sechsTageState.currentDay = curDay + 1;
      sechsTageState.currentTeamIdx = 0;
      sechsTageState.currentSlot = 1;
      return;
    }

    // Day 6 complete → finished (renderSechsTageUI will detect and show results)
  }

  function renderSechsTageResults() {
    // Throw-Log: Einzelwürfe in DB speichern
    var throwLogEntries = [];
    sechsTageState.teams.forEach(function(team) {
      for (var day = 1; day <= 6; day++) {
        var dayThrows = team.throws[day];
        if (!dayThrows) continue;
        if (dayThrows.p1 != null) {
          throwLogEntries.push({
            userId: team.p1.id, phase: null, roundNum: day,
            throwNum: 1, throwValue: dayThrows.p1, marker: null,
            fallenPins: null
          });
        }
        if (team.p2 && dayThrows.p2 != null) {
          throwLogEntries.push({
            userId: team.p2.id, phase: null, roundNum: day,
            throwNum: 1, throwValue: dayThrows.p2, marker: null,
            fallenPins: null
          });
        }
      }
    });
    saveThrowLog("sechs_tage", throwLogEntries);

    var teams = sechsTageState.teams;
    var costs = calcSechsTageCosts();

    var ranked = teams.map(function(t, idx) {
      return { team: t, total: calcSechsTageTeamTotal(t), idx: idx };
    });
    ranked.sort(function(a, b) { return b.total - a.total; });

    var html = '<div class="st-results">';
    html += '<h3 class="st-results-title">6-Tage-Rennen \u2014 Ergebnis</h3>';

    if (ranked.length > 0) {
      var winner = ranked[0].team;
      var winnerNames = winner.p2 ? (winner.p1.name + ' + ' + winner.p2.name) : winner.p1.name;
      html += '<div class="st-winner">';
      html += '<span class="st-trophy">\uD83C\uDFC6</span> Gewinner: <strong>' + escHtml(winnerNames) + '</strong> (' + ranked[0].total + ' Pkt.)';
      html += '</div>';
    }

    html += '<table class="va-results-table">';
    html += '<thead><tr>';
    html += '<th>Rang</th><th>Team</th><th>Gesamt</th><th>Kosten</th>';
    html += '</tr></thead><tbody>';

    var prevTotal = null;
    var displayRank = 0;
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].total !== prevTotal) {
        displayRank = i + 1;
      }
      prevTotal = ranked[i].total;
      var t = ranked[i].team;
      var teamName = t.p2 ? (escHtml(t.p1.name) + ' + ' + escHtml(t.p2.name)) : escHtml(t.p1.name) + ' (Solo)';
      var costZehntel = costs[t.p1.id] || 0;
      var costStr = (costZehntel / 10).toFixed(2).replace('.', ',') + ' \u20ac';

      html += '<tr>';
      html += '<td>' + displayRank + '.</td>';
      html += '<td style="text-align:left">' + teamName + '</td>';
      html += '<td>' + ranked[i].total + '</td>';
      html += '<td>' + costStr + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';

    html += '<div class="st-results-actions">';
    html += '<button type="button" class="aussteigen-accept-btn" id="stAcceptBtn">\u00dcbernehmen \u2713</button>';
    html += '<button type="button" class="aussteigen-edit-btn" id="stEditBtn">Kosten anpassen \u270F\uFE0F</button>';
    html += '</div>';
    html += '</div>';

    gameContent.innerHTML = html;
    liveControls.clear(); // Clear picker from right side

    sechsTageState.costs = costs;

    document.getElementById("stAcceptBtn").addEventListener("click", function() {
      syncSechsTageToKladde();
      showToast("6-Tage-Rennen \u00fcbernommen!", "success");
      closeLiveMode();
    });

    document.getElementById("stEditBtn").addEventListener("click", function() {
      var editHtml = '<div class="aussteigen-edit-costs">';
      editHtml += '<h3>Kosten anpassen (Zehntel-Euro)</h3>';
      gameOrder.forEach(function(p) {
        var cost = sechsTageState.costs[p.id] || 0;
        editHtml += '<div class="aussteigen-edit-row">';
        editHtml += '<span class="aussteigen-edit-name">' + playerAvatarHtml(p, "aussteigen-edit-avatar") + ' ' + escHtml(p.name) + '</span>';
        editHtml += '<input type="number" min="0" max="999" step="1" class="aussteigen-cost-input" data-st-cost-id="' + p.id + '" value="' + cost + '" />';
        editHtml += '</div>';
      });
      editHtml += '<div class="aussteigen-edit-actions">';
      editHtml += '<button type="button" id="stSaveCosts">Speichern \u2713</button>';
      editHtml += '</div>';
      editHtml += '</div>';
      gameContent.innerHTML = editHtml;

      document.getElementById("stSaveCosts").addEventListener("click", function() {
        gameContent.querySelectorAll("[data-st-cost-id]").forEach(function(inp) {
          sechsTageState.costs[inp.dataset.stCostId] = Number(inp.value) || 0;
        });
        renderSechsTageResults();
      });
    });

    saveLiveState();
  }

  function syncSechsTageToKladde() {
    var costs = sechsTageState.costs;
    gameOrder.forEach(function(p) {
      var zehntel = costs[p.id] || 0;
      var input = p.row.querySelector('[name="sechs_tage_' + p.id + '"]');
      if (input) {
        input.value = zehntel;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    recalcCosts();
  }

  // =============================================
  // --- Monte Game (Live Mode) ---
  // =============================================

  function renderMonteGame() {
    gameContent.innerHTML = '<div class="live-loading">Lade Monte-Daten...</div>';
    fetch("/kegelkladde/monte-rounds?gamedayId=" + encodeURIComponent(gamedayId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        // Build local state
        monteState = {
          rounds: {},
          questionValue: data.questionValue,
          totals: data.totals || {},
          extraWinnerId: data.extraWinnerId,
          complete: !!data.complete,
          pickedValue: null,
          editMode: false,
          lastPlacement: null
        };
        monteOverrides = {};
        for (var i = 0; i < (data.rounds || []).length; i++) {
          var r = data.rounds[i];
          if (!monteState.rounds[r.user_id]) monteState.rounds[r.user_id] = {};
          monteState.rounds[r.user_id][r.round_number] = r.roll_value;
        }
        // Detect existing manual overrides: compare kladde value vs calculated total
        players.forEach(function(p) {
          var monteInput = p.row.querySelector('[name="monte_' + p.id + '"]');
          if (monteInput) {
            var kladdeZehntel = Number(monteInput.value) || 0;
            var kladdeEur = kladdeZehntel / 10;
            var calcEur = monteState.totals[p.id] || 0;
            if (Math.abs(kladdeEur - calcEur) > 0.001 && kladdeZehntel > 0) {
              monteOverrides[p.id] = kladdeEur;
            }
          }
        });

        // Enable sidebar layout (table big, picker small)
        buildMonteSidebar();
        shuffleArea.style.display = "";
        liveView.classList.add("live-shuffle-sidebar");

        // Start turn-based flow
        currentTurnIdx = 0;
        skipFilledMontePlayers();
        renderMontePlayerUI();
      })
      .catch(function() {
        gameContent.innerHTML = '<div class="live-loading">Fehler beim Laden.</div>';
      });
  }

  function getMonteEmptyCells(uid) {
    var empty = [];
    for (var round = 1; round <= 11; round++) {
      var val = monteState.rounds[uid] ? monteState.rounds[uid][round] : undefined;
      if (val == null) empty.push(round);
    }
    return empty;
  }

  function skipFilledMontePlayers() {
    // Find minimum filled cells across all players
    var minFilled = 11;
    gameOrder.forEach(function(p) {
      var filled = 11 - getMonteEmptyCells(p.id).length;
      if (filled < minFilled) minFilled = filled;
    });

    var checked = 0;
    while (currentTurnIdx < gameOrder.length && checked < gameOrder.length) {
      var player = gameOrder[currentTurnIdx];
      var empty = getMonteEmptyCells(player.id);
      var filled = 11 - empty.length;
      // Player needs a turn if: has empty cells AND is not ahead of others
      if (empty.length > 0 && filled <= minFilled) return;
      currentTurnIdx++;
      checked++;
    }
  }

  function isMonteComplete() {
    for (var i = 0; i < gameOrder.length; i++) {
      if (getMonteEmptyCells(gameOrder[i].id).length > 0) return false;
    }
    return true;
  }

  // --- Monte Table (rendered in gameContent = LEFT side) ---
  function buildMonteSidebar() {
    var cols = [];
    for (var i = 1; i <= 10; i++) cols.push({ num: i, label: String(i) });
    cols.push({ num: 11, label: "?" });

    // Player heading + phase title + edit area (updated dynamically by renderMontePlayerUI)
    var html = '<div id="montePlayerHeading" class="va-player-heading"></div>';
    html += '<div id="montePhaseTitle" class="va-phase-title"></div>';
    html += '<div id="monteEditArea" class="monte-edit-area"></div>';

    // Monte table
    html += '<div class="monte-sidebar-wrap" id="monteSidebarWrap">';
    html += '<table class="monte-sidebar-table" id="monteSidebarTable"><thead><tr>';
    html += '<th class="mst-player">Spieler</th>';
    cols.forEach(function(c) {
      if (c.num === 11) {
        var qv = monteState.questionValue != null ? monteState.questionValue : "";
        html += '<th class="mst-q"><input type="number" min="0" max="12" step="1" class="monte-question-input" id="monteQuestionInput" value="' + qv + '" placeholder="?" /></th>';
      } else {
        html += '<th class="mst-round">' + c.label + '</th>';
      }
    });
    html += '<th class="mst-total">Ges.</th>';
    html += '</tr></thead><tbody>';

    gameOrder.forEach(function(p, idx) {
      var uid = p.id;
      var initials = getInitials(p.name);
      var color = initialColor(p.name);
      var avatarHtml = p.avatar
        ? '<img src="' + p.avatar + '" class="mst-avatar" />'
        : '<span class="mst-avatar mst-initials" style="background:' + color + '">' + escHtml(initials) + '</span>';

      html += '<tr class="mst-row" data-monte-uid="' + uid + '">';
      html += '<td class="mst-player-cell">';
      html += '<span class="mst-num">' + (idx + 1) + '.</span>';
      html += avatarHtml;
      html += '<span class="mst-name">' + escHtml(p.name) + '</span>';
      html += '</td>';
      cols.forEach(function(c) {
        var val = monteState.rounds[uid] ? monteState.rounds[uid][c.num] : undefined;
        var display = val != null ? (String(val)) : "";
        html += '<td class="monte-cell" data-monte-uid="' + uid + '" data-monte-round="' + c.num + '">' + display + '</td>';
      });
      var hasOverride = monteOverrides[uid] != null;
      var total = hasOverride ? monteOverrides[uid] : (monteState.totals[uid] || 0);
      html += '<td class="monte-total-cell' + (hasOverride ? ' monte-total-override' : '') + '" data-monte-total="' + uid + '">' + formatMonteEur(total) + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    gameContent.innerHTML = html;

    highlightMonteLosers();
    attachMonteSidebarHandlers();
  }

  function attachMonteSidebarHandlers() {
    // Question input handler
    var qInput = document.getElementById("monteQuestionInput");
    if (qInput) {
      qInput.addEventListener("change", function() {
        var raw = qInput.value.trim();
        var parsed = Number(raw);
        var val = raw === "" ? null : (isNaN(parsed) ? null : parsed);
        if (raw !== "" && isNaN(parsed)) { qInput.value = ""; }
        monteState.questionValue = val;
        fetch("/kegelkladde/monte-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csrfToken: csrfToken, gamedayId: gamedayId, questionValue: val })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.ok) {
            monteState.totals = data.totals;
            monteState.extraWinnerId = data.extraWinnerId;
            monteState.complete = !!data.complete;
            updateMonteTotals();
            highlightMonteLosers();
            syncMonteToKladde();
          }
        });
      });
    }

    // Delegated click handler for sidebar cells
    var sidebarWrap = document.getElementById("monteSidebarWrap");
    if (sidebarWrap) {
      // Column hover highlight (only if active player's cell in that column is empty)
      sidebarWrap.addEventListener("mouseover", function(e) {
        var cell = e.target.closest(".monte-cell");
        sidebarWrap.querySelectorAll(".monte-cell.monte-col-hover").forEach(function(c) {
          c.classList.remove("monte-col-hover");
        });
        if (!cell || currentTurnIdx >= gameOrder.length) return;
        var round = cell.dataset.monteRound;
        var activePlayer = gameOrder[currentTurnIdx];
        var activeVal = monteState.rounds[activePlayer.id] ? monteState.rounds[activePlayer.id][Number(round)] : undefined;
        if (activeVal != null) return; // already filled for active player
        sidebarWrap.querySelectorAll('.monte-cell[data-monte-round="' + round + '"]').forEach(function(c) {
          c.classList.add("monte-col-hover");
        });
      });
      sidebarWrap.addEventListener("mouseleave", function() {
        sidebarWrap.querySelectorAll(".monte-cell.monte-col-hover").forEach(function(c) {
          c.classList.remove("monte-col-hover");
        });
      });

      sidebarWrap.addEventListener("click", function(e) {
        // Click on monte cell
        var cell = e.target.closest(".monte-cell");
        if (cell) {
          var uid = cell.dataset.monteUid;
          var round = Number(cell.dataset.monteRound);

          if (monteState.editMode) {
            // Edit mode: open modal picker for any cell
            showPicker(cell);
            return;
          }

          // Normal turn-based mode: click anywhere in the column → place in active player's cell
          if (monteState.pickedValue != null && currentTurnIdx < gameOrder.length) {
            var activePlayer = gameOrder[currentTurnIdx];
            var activeCell = sidebarWrap.querySelector('.monte-cell[data-monte-uid="' + activePlayer.id + '"][data-monte-round="' + round + '"]');
            if (activeCell) {
              var val = monteState.rounds[activePlayer.id] ? monteState.rounds[activePlayer.id][round] : undefined;
              if (val == null) {
                placeMonteValue(activePlayer.id, round, activeCell);
              }
            }
          }
          return;
        }

        // Click on total cell → inline edit for manual override
        var totalCell = e.target.closest(".monte-total-cell");
        if (totalCell && !totalCell.querySelector(".monte-total-input")) {
          var tuid = totalCell.dataset.monteTotal;
          var hasOverride = monteOverrides[tuid] != null;
          var currentVal = hasOverride ? monteOverrides[tuid] : (monteState.totals[tuid] || 0);
          var zehntel = Math.round(currentVal * 10);

          var input = document.createElement("input");
          input.type = "number";
          input.min = "0";
          input.max = "999";
          input.step = "1";
          input.value = zehntel;
          input.className = "monte-total-input";
          input.title = "Wert in Zehntel-Euro (z.B. 15 = 1,50 \u20ac). Leer = automatisch berechnen";
          totalCell.textContent = "";
          totalCell.appendChild(input);
          input.focus();
          input.select();

          var cancelled = false;
          function commitOverride() {
            if (cancelled) return;
            var rawVal = input.value.trim();
            if (rawVal === "" || rawVal === "0") {
              delete monteOverrides[tuid];
            } else {
              var z = Number(rawVal) || 0;
              monteOverrides[tuid] = Math.round(z) / 10;
            }
            updateMonteTotals();
            syncMonteToKladde();
          }
          input.addEventListener("blur", commitOverride);
          input.addEventListener("keydown", function(ev) {
            if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
            if (ev.key === "Escape") {
              ev.stopPropagation();
              cancelled = true;
              input.remove();
              updateMonteTotals();
            }
          });
        }
      });
    }
  }

  function updateMonteSidebarHighlight() {
    var table = document.getElementById("monteSidebarTable");
    if (!table) return;
    var rows = table.querySelectorAll(".mst-row");
    rows.forEach(function(r) { r.classList.remove("monte-active-player"); });

    // Clear all placeable highlights
    table.querySelectorAll(".monte-cell").forEach(function(c) {
      c.classList.remove("monte-placeable");
    });

    if (monteState.editMode) return;
    if (currentTurnIdx >= gameOrder.length) return;

    var activePlayer = gameOrder[currentTurnIdx];
    var activeRow = table.querySelector('.mst-row[data-monte-uid="' + activePlayer.id + '"]');
    if (activeRow) {
      activeRow.classList.add("monte-active-player");
      activeRow.scrollIntoView({ block: "nearest", behavior: "smooth" });

      // If a value is picked, highlight empty non-skipped cells
      if (monteState.pickedValue != null) {
        activeRow.querySelectorAll(".monte-cell").forEach(function(c) {
          var val = monteState.rounds[activePlayer.id] ? monteState.rounds[activePlayer.id][Number(c.dataset.monteRound)] : undefined;
          if (val == null) {
            c.classList.add("monte-placeable");
          }
        });
      }
    }
  }

  // --- Monte Player UI (picker in shuffleArea = RIGHT side) ---
  function renderMontePlayerUI() {
    if (monteState.editMode) {
      renderMonteEditUI();
      return;
    }

    if (currentTurnIdx >= gameOrder.length || isMonteComplete()) {
      renderMonteDone();
      return;
    }

    var player = gameOrder[currentTurnIdx];
    var playerNum = currentTurnIdx + 1;
    var totalPlayers = gameOrder.length;

    // Update heading in gameContent (LEFT side, above Monte table)
    var headingEl = document.getElementById("montePlayerHeading");
    var titleEl = document.getElementById("montePhaseTitle");
    if (headingEl) headingEl.textContent = player.name;
    if (titleEl) titleEl.textContent = 'Monte, Spieler ' + playerNum + '/' + totalPlayers + ':';

    // "Bearbeiten" button on LEFT side
    var editArea = document.getElementById("monteEditArea");
    if (editArea) {
      editArea.innerHTML = '<button type="button" class="va-direct-btn" id="monteEditBtn">Bearbeiten \u270F\uFE0F</button>';
      document.getElementById("monteEditBtn").addEventListener("click", function() {
        monteState.editMode = true;
        monteState.pickedValue = null;
        monteState.pickedMarker = null;
        renderMontePlayerUI();
      });
    }

    // RIGHT side: unified Volle picker
    var canUndo = monteState.pickedValue != null || monteState.lastPlacement != null;
    liveControls.renderVolle({
      onPick: monteOnPick,
      onUndo: monteOnUndo,
      canUndo: canUndo
    });

    // Highlight previously picked value
    if (monteState.pickedValue != null) {
      liveControls.highlightPick(monteState.pickedValue);
    }

    updateMonteSidebarHighlight();
    saveMonteState();
  }

  // --- Monte cursor follower ---
  var monteCursorEl = null;

  function showMonteCursor(val) {
    if (!monteCursorEl) {
      monteCursorEl = document.createElement("div");
      monteCursorEl.className = "monte-cursor-val";
      document.body.appendChild(monteCursorEl);
      document.addEventListener("mousemove", moveMonteCursor);
    }
    monteCursorEl.textContent = String(val);
    monteCursorEl.style.display = "block";
  }

  function hideMonteCursor() {
    if (monteCursorEl) {
      monteCursorEl.style.display = "none";
    }
  }

  function moveMonteCursor(e) {
    if (monteCursorEl && monteCursorEl.style.display !== "none") {
      monteCursorEl.style.left = (e.clientX - 1) + "px";
      monteCursorEl.style.top = (e.clientY + 18)+ "px";
    }
  }

  // --- Monte callbacks for unified picker ---
  function monteOnPick(val, marker, btn) {
    monteState.pickedValue = val;
    monteState.pickedMarker = marker;
    liveControls.highlightPick(val);
    showMonteCursor(val);
    updateMonteSidebarHighlight();

    // Visual effects for special markers
    if (marker === "kranz") {
      liveFx.stop(); liveFx.confetti(btn);
      setTimeout(function() { liveFx.fireworks(20000); }, 600);
    } else if (marker === "alle9") {
      liveFx.fireworks(20000);
    } else if (marker === "pudel") {
      liveFx.stop(); liveFx.explosion(btn, "brown");
    } else if (marker === "triclops") {
      liveFx.stop(); liveFx.explosion(btn, "purple");
    }
  }

  function monteOnUndo() {
    if (monteState.pickedValue != null) {
      monteState.pickedValue = null;
      monteState.pickedMarker = null;
      hideMonteCursor();
      renderMontePlayerUI();
    } else if (monteState.lastPlacement) {
      var lp = monteState.lastPlacement;
      selectMonteValue(lp.uid, lp.round, null, null);
      monteState.lastPlacement = null;
      if (currentTurnIdx > 0) currentTurnIdx--;
      var prevPlayer = gameOrder[currentTurnIdx];
      if (prevPlayer && String(prevPlayer.id) !== String(lp.uid)) {
        for (var i = 0; i < gameOrder.length; i++) {
          if (String(gameOrder[i].id) === String(lp.uid)) {
            currentTurnIdx = i;
            break;
          }
        }
      }
      renderMontePlayerUI();
    }
  }

  function renderMonteEditUI() {
    // Update heading in gameContent (LEFT side)
    var headingEl = document.getElementById("montePlayerHeading");
    var titleEl = document.getElementById("montePhaseTitle");
    if (headingEl) { headingEl.textContent = "Bearbeiten"; headingEl.style.fontSize = "1.4rem"; }
    if (titleEl) titleEl.textContent = 'Klicke auf eine Zelle in der Tabelle, um den Wert zu \u00e4ndern.';

    // "Fertig" button on LEFT side
    var editArea = document.getElementById("monteEditArea");
    if (editArea) {
      editArea.innerHTML = '<button type="button" class="va-confirm-throw" id="monteEditDoneBtn">Fertig \u2713</button>';
      document.getElementById("monteEditDoneBtn").addEventListener("click", function() {
        monteState.editMode = false;
        monteState.pickedValue = null;
        monteState.pickedMarker = null;
        if (headingEl) headingEl.style.fontSize = "";
        skipFilledMontePlayers();
        renderMontePlayerUI();
      });
    }

    liveControls.clear();
    updateMonteSidebarHighlight();
  }

  function renderMonteDone() {
    // Update heading in gameContent (LEFT side)
    var headingEl = document.getElementById("montePlayerHeading");
    var titleEl = document.getElementById("montePhaseTitle");
    if (headingEl) { headingEl.textContent = "Monte abgeschlossen"; headingEl.style.fontSize = "1.4rem"; }
    if (titleEl) titleEl.textContent = 'Alle Werte eingetragen.';

    // "Bearbeiten" button on LEFT side
    var editArea = document.getElementById("monteEditArea");
    if (editArea) {
      editArea.innerHTML = '<button type="button" class="va-direct-btn" id="monteEditBtn2">Bearbeiten \u270F\uFE0F</button>';
      document.getElementById("monteEditBtn2").addEventListener("click", function() {
        monteState.editMode = true;
        monteState.pickedValue = null;
        monteState.pickedMarker = null;
        if (headingEl) headingEl.style.fontSize = "";
        renderMontePlayerUI();
      });
    }

    liveControls.clear();
    updateMonteSidebarHighlight();
  }

  function placeMonteValue(uid, round, cell) {
    var value = monteState.pickedValue;
    var marker = monteState.pickedMarker;
    if (value == null) return;

    // Save placement for undo
    monteState.lastPlacement = { uid: uid, round: round, value: value };
    monteState.pickedValue = null;
    monteState.pickedMarker = null;
    hideMonteCursor();

    // Flying Sheep bei 9er/Kranz — erst beim tatsächlichen Setzen
    if ((marker === "alle9" || marker === "kranz") && window.flyingSheep) {
      var p = null;
      for (var gi = 0; gi < gameOrder.length; gi++) {
        if (String(gameOrder[gi].id) === String(uid)) { p = gameOrder[gi]; break; }
      }
      if (p) {
        var rect = cell ? cell.getBoundingClientRect() : { left: W / 2, top: H / 2, width: 0 };
        window.flyingSheep.spawn(rect.left + rect.width / 2, rect.top, p.id, p.name.charAt(0).toUpperCase(), p.name);
      }
    }

    // Update local state + cell display + server
    selectMonteValue(uid, round, value, cell);

    // Advance turn
    currentTurnIdx++;
    skipFilledMontePlayers();

    // Check if we wrapped past end
    if (currentTurnIdx >= gameOrder.length) {
      // Reset to beginning and check if any empty cells remain
      currentTurnIdx = 0;
      skipFilledMontePlayers();
    }

    renderMontePlayerUI();
  }

  // --- Monte Modal Picker (for edit mode) ---
  function showPicker(cell) {
    closePicker();
    var uid = cell.dataset.monteUid;
    var round = Number(cell.dataset.monteRound);

    var player = players.find(function(p) { return p.id === String(uid); });
    var playerName = player ? player.name : "";
    var roundLabel = round === 11 ? "?" : String(round);

    var modalOverlay = document.createElement("div");
    modalOverlay.className = "monte-picker-overlay";

    var modal = document.createElement("div");
    modal.className = "monte-picker-modal";

    var header = document.createElement("div");
    header.className = "monte-picker-header";
    header.textContent = playerName + " \u2013 Runde " + roundLabel;
    modal.appendChild(header);

    var grid = document.createElement("div");
    grid.className = "monte-picker-grid";

    var values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, null];
    var labels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "12", "\u00D7"];
    var currentVal = monteState.rounds[uid] ? monteState.rounds[uid][round] : undefined;

    values.forEach(function(v, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "monte-picker-btn";
      if (v === currentVal) btn.classList.add("monte-picker-selected");
      if (v === null) btn.classList.add("monte-picker-clear");
      btn.textContent = labels[i];
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        selectMonteValue(uid, round, v, cell);
        closePicker();
      });
      grid.appendChild(btn);
    });

    modal.appendChild(grid);
    modalOverlay.appendChild(modal);

    modalOverlay.addEventListener("click", function(e) {
      if (e.target === modalOverlay) closePicker();
    });

    liveView.appendChild(modalOverlay);
    activePicker = { overlay: modalOverlay, cell: cell };
  }

  function closePicker() {
    if (activePicker) {
      activePicker.overlay.remove();
      activePicker = null;
    }
  }

  function selectMonteValue(uid, round, value, cell) {
    if (!monteState.rounds[uid]) monteState.rounds[uid] = {};
    if (value === null) {
      delete monteState.rounds[uid][round];
    } else {
      monteState.rounds[uid][round] = value;
    }

    // Update cell display in Monte table
    if (cell) {
      cell.textContent = value != null ? (String(value)) : "";
    } else {
      // Find cell in Monte table (now in gameContent)
      var monteWrap = document.getElementById("monteSidebarWrap");
      var searchEl = monteWrap || gameContent;
      var foundCell = searchEl.querySelector('.monte-cell[data-monte-uid="' + uid + '"][data-monte-round="' + round + '"]');
      if (foundCell) foundCell.textContent = value != null ? (String(value)) : "";
    }

    fetch("/kegelkladde/monte-round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrfToken: csrfToken, gamedayId: gamedayId, memberId: uid, roundNumber: round, rollValue: value })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        monteState.totals = data.totals;
        monteState.extraWinnerId = data.extraWinnerId;
        monteState.complete = !!data.complete;
        updateMonteTotals();
        highlightMonteLosers();
        syncMonteToKladde();
      }
    });
  }

  function updateMonteTotals() {
    var monteWrap = document.getElementById("monteSidebarWrap");
    gameOrder.forEach(function(p) {
      var el = monteWrap ? monteWrap.querySelector('[data-monte-total="' + p.id + '"]') : null;
      if (el) {
        var hasOverride = monteOverrides[p.id] != null;
        var total = hasOverride ? monteOverrides[p.id] : (monteState.totals[p.id] || 0);
        if (!el.querySelector(".monte-total-input")) {
          el.textContent = formatMonteEur(total);
        }
        el.classList.toggle("monte-total-override", hasOverride);
      }
    });
  }

  function highlightMonteLosers() {
    var presentIds = gameOrder.map(function(p) { return Number(p.id); });
    var totalPlayers = presentIds.length;
    var container = document.getElementById("monteSidebarWrap") || gameContent;

    container.querySelectorAll(".monte-cell").forEach(function(c) {
      c.classList.remove("monte-loser", "monte-loser-final", "monte-safe", "monte-winner");
    });

    for (var col = 1; col <= 10; col++) {
      var cells = container.querySelectorAll('[data-monte-round="' + col + '"]');

      var entries = [];
      cells.forEach(function(c) {
        var uid = Number(c.dataset.monteUid);
        var val = monteState.rounds[uid] ? monteState.rounds[uid][col] : undefined;
        if (val != null && presentIds.indexOf(uid) !== -1) {
          entries.push({ cell: c, uid: uid, val: val });
        }
      });

      if (entries.length === 0) continue;

      var colComplete = entries.length === totalPlayers;
      var minVal = Math.min.apply(null, entries.map(function(e) { return e.val; }));
      var losers = entries.filter(function(e) { return e.val === minVal; });
      var safe = entries.filter(function(e) { return e.val !== minVal; });
      var cls = colComplete ? "monte-loser-final" : "monte-loser";
      losers.forEach(function(e) { e.cell.classList.add(cls); });
      safe.forEach(function(e) { e.cell.classList.add("monte-safe"); });
    }

    // "?" column (round 11)
    if (monteState.questionValue != null) {
      var qCells = container.querySelectorAll('[data-monte-round="11"]');
      var qEntries = [];
      qCells.forEach(function(c) {
        var uid = Number(c.dataset.monteUid);
        var val = monteState.rounds[uid] ? monteState.rounds[uid][11] : undefined;
        if (val != null && presentIds.indexOf(uid) !== -1) {
          qEntries.push({ cell: c, uid: uid, val: val });
        }
      });

      if (qEntries.length > 0) {
        var qComplete = qEntries.length === totalPlayers;
        var qMinVal = Math.min.apply(null, qEntries.map(function(e) { return e.val; }));
        var qMaxVal = Math.max.apply(null, qEntries.map(function(e) { return e.val; }));
        var qCls = qComplete ? "monte-loser-final" : "monte-loser";
        qEntries.filter(function(e) { return e.val === qMinVal; }).forEach(function(e) { e.cell.classList.add(qCls); });
        if (qComplete) {
          var winners = qEntries.filter(function(e) { return e.val === qMaxVal; });
          if (winners.length === 1) winners[0].cell.classList.add("monte-winner");
        }
      }
    }

    // Re-apply placeable highlights after loser calculation
    updateMonteSidebarHighlight();
  }

  function syncMonteToKladde() {
    // Erst zur Kladde synchronisieren wenn Monte komplett ist
    // (sonst sehen Teilwerte in der Kladde wie "beendet" aus)
    if (!monteState.complete) return;

    players.forEach(function(p) {
      var hasOverride = monteOverrides[p.id] != null;
      var total = hasOverride ? monteOverrides[p.id] : (monteState.totals[p.id] || 0);
      var monteInput = p.row.querySelector('[name="monte_' + p.id + '"]');
      if (monteInput) {
        var zehntel = Math.round(total * 10);
        monteInput.value = zehntel;
        monteInput.dispatchEvent(new Event("input", { bubbles: true }));
        monteInput.dispatchEvent(new Event("change", { bubbles: true }));
      }

      var extraRadio = p.row.querySelector('.monte-extra-radio');
      if (extraRadio) {
        extraRadio.checked = monteState.extraWinnerId == p.id;
      }
    });

    if (monteState.extraWinnerId) {
      fetch("/kegelkladde/monte-extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken: csrfToken, gamedayId: gamedayId, memberId: monteState.extraWinnerId })
      });
    }

    recalcCosts();
  }

  // --- Monte State Persistence ---
  function saveMonteState() {
    var game = GAMES[currentGameIdx];
    if (!game || game.type !== "monte") return;
    if (!gameOrder.length) return;

    var state = {
      version: 1,
      timestamp: Date.now(),
      gameType: "monte",
      playerIds: players.map(function(p) { return p.id; }),
      gameOrderIds: gameOrder.map(function(p) { return p.id; }),
      gameOrderOriginalIds: gameOrderOriginal.slice(),
      currentGameIdx: currentGameIdx,
      gameHistory: gameHistory.slice(),
      currentTurnIdx: currentTurnIdx,
      pinklerSlots: [],
      monteLive: {
        pickedValue: monteState.pickedValue,
        editMode: monteState.editMode
      }
    };
    try { sessionStorage.setItem(liveStateKey, JSON.stringify(state)); } catch(e) {}
  }

  // --- Helpers ---
  function formatMonteEur(value) {
    return value > 0 ? value.toFixed(2).replace(".", ",") + " \u20ac" : "\u2014";
  }

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // --- Live button pulse (paused game indicator) ---
  function highlightActiveLiveBtn() {
    try {
      var raw = sessionStorage.getItem(liveStateKey);
      if (!raw) return;
      var state = JSON.parse(raw);
      if (!state || state.version !== 1) return;
      var gameIdx = state.currentGameIdx;
      if (gameIdx == null || !GAMES[gameIdx]) return;
      var gameKey = GAMES[gameIdx].key;
      var btn = kladdeDataEl.querySelector('.live-game-btn[data-live-start="' + gameKey + '"]');
      if (btn) {
        btn.classList.add("live-btn-pulse");
        var img = btn.querySelector("img");
        if (img) img.src = "/live.png";
      }
    } catch(e) {}
  }

  function clearLiveBtnPulse() {
    kladdeDataEl.querySelectorAll(".live-btn-pulse").forEach(function(b) {
      b.classList.remove("live-btn-pulse");
      var img = b.querySelector("img");
      if (img && img.dataset.origSrc) img.src = img.dataset.origSrc;
    });
  }

  // Intercept "Kegelbuch" nav clicks: exit live view without page reload
  document.querySelectorAll('a[href="/kegelkladde"]').forEach(function(link) {
    link.addEventListener("click", function(e) {
      if (liveView && liveView.style.display !== "none") {
        e.preventDefault();
        closeLiveMode({ keepState: true });
      }
    });
  });

  // Restore live state after all declarations — but NOT after a fresh login
  var flashEl = document.getElementById("flashData");
  var isLogin = false;
  if (flashEl) {
    try { var fd = JSON.parse(flashEl.textContent); isLogin = fd && fd.message && fd.message.indexOf("Willkommen") !== -1; } catch(e) {}
  }
  if (isLogin) {
    clearLiveState();
  } else {
    restoreLiveState();
  }
})();

/* ═══ Sheep Graveyard Canvas Renderer ═══ */
(function() {
  var canvases = document.querySelectorAll('.gy-sheep-canvas');
  if (!canvases.length) return;

  var TORSO_W = 17, TORSO_H = 14;
  var HEAD_W = 12, HEAD_H = 12;
  var LEG_W = 2, LEG_H = 8;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawSheepOnCanvas(canvas) {
    var raw = canvas.dataset.traits;
    if (!raw) return;
    var tr;
    try { tr = JSON.parse(decodeURIComponent(raw)); } catch(e) { return; }
    var sizeMul = parseFloat(canvas.dataset.size) || 1;
    var letter = canvas.dataset.letter || '';

    var ctx = canvas.getContext('2d');
    var cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    var baseScale = 2.2;
    var s = baseScale * Math.min(sizeMul, 1.8);
    ctx.save();
    ctx.translate(cw / 2, ch / 2 + 2);
    ctx.scale(s, s);

    var tw = TORSO_W * (tr.chub || 1);
    var th = TORSO_H;
    var hw = HEAD_W * (tr.headMul || 1);
    var hh = HEAD_H * (tr.headMul || 1);
    var lh = LEG_H * (tr.legMul || 1);

    var woolColor = tr.woolColor || 'white';
    var borderColor = tr.borderColor || '#444';
    var skinColor = tr.skinColor || '#444';
    var earColor = tr.isBlack ? '#2a2a2a' : '#f4c7b0';
    var eyeColor = tr.isBlack ? '#eee' : '#222';

    // Legs (behind torso)
    ctx.fillStyle = skinColor;
    if (tr.legs && tr.legs.length === 4) {
      // Back legs first
      for (var li = 2; li < 4; li++) {
        var leg = tr.legs[li];
        ctx.fillRect(leg.lx - LEG_W / 2, leg.ly - 2, LEG_W, lh);
      }
      // Front legs
      for (var li = 0; li < 2; li++) {
        var leg = tr.legs[li];
        ctx.fillRect(leg.lx - LEG_W / 2, leg.ly - 2, LEG_W, lh);
      }
      // Shoes
      if (tr.accessory === 'shoes' && tr.accColor) {
        ctx.fillStyle = tr.accColor;
        for (var li = 0; li < 4; li++) {
          var leg = tr.legs[li];
          ctx.fillRect(leg.lx - LEG_W / 2 - 0.5, leg.ly - 2 + lh - 2, LEG_W + 1, 2.5);
        }
      }
    } else {
      // Fallback legs
      ctx.fillRect(-4, 4, LEG_W, lh);
      ctx.fillRect(2, 4, LEG_W, lh);
      ctx.fillRect(-3, 5, LEG_W, lh);
      ctx.fillRect(3, 5, LEG_W, lh);
    }

    // Tail
    var tailSize = tr.tailSize || 4;
    ctx.fillStyle = woolColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(tw / 2 + tailSize / 2, 0, tailSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Torso
    ctx.fillStyle = woolColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.8;
    roundRect(ctx, -tw / 2, -th / 2, tw, th, 4);
    ctx.fill();
    ctx.stroke();

    // Letter on torso
    if (letter) {
      ctx.fillStyle = tr.isBlack ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.25)';
      ctx.font = 'bold 6px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, 0, 0);
    }

    // Bowtie (on torso, under head)
    if (tr.accessory === 'bowtie' && tr.accColor) {
      var btx = -tw / 2 - 1;
      var bty = -1;
      ctx.fillStyle = tr.accColor;
      ctx.beginPath();
      ctx.moveTo(btx, bty);
      ctx.lineTo(btx - 3.5, bty - 2.5);
      ctx.lineTo(btx - 3.5, bty + 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(btx, bty);
      ctx.lineTo(btx + 3.5, bty - 2.5);
      ctx.lineTo(btx + 3.5, bty + 2.5);
      ctx.closePath();
      ctx.fill();
    }

    // Head
    var headX = -tw / 2 - hw * 0.6;
    var headY = -th / 2 - hh * 0.2;
    ctx.fillStyle = woolColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.8;
    roundRect(ctx, headX, headY, hw, hh, 3);
    ctx.fill();
    ctx.stroke();

    // Ears
    ctx.fillStyle = earColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    // Left ear
    ctx.beginPath();
    ctx.ellipse(headX + 1, headY + 2, 2, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Right ear
    ctx.beginPath();
    ctx.ellipse(headX + hw - 1, headY + 2, 2, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = eyeColor;
    var eyeY = headY + hh * 0.42;
    ctx.beginPath();
    ctx.arc(headX + hw * 0.3, eyeY, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headX + hw * 0.7, eyeY, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = tr.isBlack ? '#1a1a1a' : '#666';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    var mouthY = headY + hh * 0.68;
    ctx.arc(headX + hw / 2, mouthY, 1.5, 0.1, Math.PI - 0.1);
    ctx.stroke();

    // Accessories
    if (tr.accessory === 'tophat') {
      var hatColor = tr.isBlack ? '#555' : '#222';
      ctx.fillStyle = hatColor;
      ctx.fillRect(headX + hw * 0.15, headY - 7, hw * 0.7, 7);
      ctx.fillRect(headX + hw * 0.05, headY - 1, hw * 0.9, 2);
    } else if (tr.accessory === 'partyhat' && tr.accColor) {
      ctx.fillStyle = tr.accColor;
      ctx.beginPath();
      ctx.moveTo(headX + hw / 2, headY - 8);
      ctx.lineTo(headX + hw * 0.2, headY);
      ctx.lineTo(headX + hw * 0.8, headY);
      ctx.closePath();
      ctx.fill();
    } else if (tr.accessory === 'crown') {
      ctx.fillStyle = '#ffd700';
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 0.5;
      var cy = headY - 1;
      ctx.beginPath();
      ctx.moveTo(headX + hw * 0.15, cy);
      ctx.lineTo(headX + hw * 0.2, cy - 5);
      ctx.lineTo(headX + hw * 0.35, cy - 2);
      ctx.lineTo(headX + hw * 0.5, cy - 6);
      ctx.lineTo(headX + hw * 0.65, cy - 2);
      ctx.lineTo(headX + hw * 0.8, cy - 5);
      ctx.lineTo(headX + hw * 0.85, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (tr.accessory === 'beanie' && tr.accColor) {
      ctx.fillStyle = tr.accColor;
      ctx.beginPath();
      ctx.arc(headX + hw / 2, headY + 1, hw * 0.45, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = tr.accColor;
      ctx.beginPath();
      ctx.arc(headX + hw / 2, headY - hw * 0.35, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (tr.accessory === 'glasses') {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.6;
      var gy = headY + hh * 0.42;
      ctx.beginPath();
      ctx.arc(headX + hw * 0.3, gy, 2.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(headX + hw * 0.7, gy, 2.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(headX + hw * 0.3 + 2.2, gy);
      ctx.lineTo(headX + hw * 0.7 - 2.2, gy);
      ctx.stroke();
    } else if (tr.accessory === 'bell') {
      ctx.fillStyle = '#d4a017';
      ctx.beginPath();
      ctx.arc(headX + hw / 2, headY + hh + 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(headX + hw / 2, headY + hh + 3, 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else if (tr.accessory === 'flower' && tr.accColor) {
      ctx.fillStyle = tr.accColor;
      for (var pi = 0; pi < 5; pi++) {
        var pa = (pi / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(headX + hw * 0.75 + Math.cos(pa) * 2, headY + 1 + Math.sin(pa) * 2, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(headX + hw * 0.75, headY + 1, 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (tr.accessory === 'scarf' && tr.accColor) {
      ctx.fillStyle = tr.accColor;
      ctx.fillRect(headX + 1, headY + hh - 2, hw - 2, 3);
      ctx.fillRect(headX + hw * 0.3, headY + hh + 1, 2, 4);
    }

    ctx.restore();
  }

  canvases.forEach(drawSheepOnCanvas);
})();
