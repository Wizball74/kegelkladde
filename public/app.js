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
    warning: "⚠"
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

// Gameday navigation (Prev/Next + Dropdown)
const gamedaySelect = document.getElementById("gamedaySelect");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");

if (gamedaySelect) {
  function updateNavButtons() {
    if (btnPrev) btnPrev.disabled = gamedaySelect.selectedIndex === 0;
    if (btnNext) btnNext.disabled = gamedaySelect.selectedIndex === gamedaySelect.options.length - 1;
  }

  function navigateToSelected() {
    const val = gamedaySelect.value;
    window.location = "/kegelkladde?gamedayId=" + encodeURIComponent(val);
  }

  gamedaySelect.addEventListener("change", navigateToSelected);

  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (gamedaySelect.selectedIndex > 0) {
        gamedaySelect.selectedIndex--;
        navigateToSelected();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (gamedaySelect.selectedIndex < gamedaySelect.options.length - 1) {
        gamedaySelect.selectedIndex++;
        navigateToSelected();
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
    const va = Number(row.querySelector('[name^="va_"]')?.value || 0);
    const monte = Number(row.querySelector('[name^="monte_"]')?.value || 0);
    const aussteigen = Number(row.querySelector('[name^="aussteigen_"]')?.value || 0);
    const sechs_tage = Number(row.querySelector('[name^="sechs_tage_"]')?.value || 0);
    const gameCosts = isPresent ? va + monte + aussteigen + sechs_tage : 0;

    // Custom game fields
    let customGameTotal = 0;
    if (isPresent) {
      row.querySelectorAll("[data-custom-game-field]").forEach((input) => {
        customGameTotal += Number(input.value || 0);
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
    const toPay = isPresent ? contribution + penalties + costPudel + costOthers + gameCosts + customGameTotal + carryover : contribution + penalties + carryover;
    const rest = toPay - paid;

    const toPayEl = row.querySelector("[data-topay]");
    if (toPayEl) toPayEl.textContent = formatEuroCost(toPay) + " €";

    const restEl = row.querySelector("[data-rest]");
    if (restEl) {
      restEl.textContent = formatEuroCost(rest) + " €";
      restEl.style.color = rest > 0 ? "var(--error)" : rest < 0 ? "var(--success)" : "";
    }
  });

  updateCompactCells();

  // Sync mobile "nach Spiel" display if active
  if (typeof window._syncMobileDisplay === "function") window._syncMobileDisplay();
}

// Compact cell mode: display values as text, edit on hover
function initCompactMode() {
  document.querySelectorAll(".kladde-table .money-inline .mini-number").forEach((input) => {
    if (input.hasAttribute("data-paid-field")) return;
    const display = document.createElement("span");
    display.className = "field-display";
    display.textContent = formatEuroCost(Number(input.value) || 0);
    input.after(display);
    const td = input.closest("td");
    if (td) td.classList.add("has-compact");
  });
}

function updateCompactCells() {
  // Update display spans for money inputs
  document.querySelectorAll(".kladde-table td.has-compact").forEach((td) => {
    const input = td.querySelector(".mini-number");
    const display = td.querySelector(".field-display");
    if (input && display) {
      const val = Number(input.value) || 0;
      display.textContent = formatEuroCost(val);
      const alwaysEdit = input.hasAttribute("data-always-edit");
      td.classList.toggle("cell-empty", val === 0 && !alwaysEdit);
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
      modal.remove();
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
    // Auto-Strafe: 1,00 bei Abwesenheit, 0,00 bei Reaktivierung
    const penaltyInput = row.querySelector('[name^="penalties_"]');
    if (penaltyInput && !penaltyInput.disabled) {
      const currentVal = Number(penaltyInput.value) || 0;
      if (!cb.checked && currentVal === 0) {
        penaltyInput.value = "1.00";
      } else if (cb.checked && currentVal === 1) {
        penaltyInput.value = "0.00";
      }
    }
    recalcCosts();
    autoSaveRow(row);
  });
});

// Recalc on any number input change (Strafen)
document.querySelectorAll(".kladde-table .no-spin").forEach((input) => {
  input.addEventListener("input", () => recalcCosts());
});

// Auto-save attendance row via AJAX
const kladdeData = document.getElementById("kladdeData");
const kladdeStatus = Number(kladdeData?.dataset.status || 0);

function autoSaveRow(row) {
  if (!kladdeData || kladdeStatus >= 3) return;

  const csrfToken = kladdeData.dataset.csrf;
  const gamedayId = kladdeData.dataset.gamedayId;
  const memberId = row.dataset.memberId;

  if (!csrfToken || !gamedayId || !memberId) return;

  const payload = { csrfToken, gamedayId, memberId };

  if (kladdeStatus <= 1) {
    payload.present = row.querySelector("[data-present]")?.checked ? 1 : 0;
    payload.penalties = row.querySelector(`[name="penalties_${memberId}"]`)?.value || 0;
    payload.pudel = row.querySelector('[data-marker-input="pudel"]')?.value || 0;
    payload.alle9 = row.querySelector('[data-marker-input="alle9"]')?.value || 0;
    payload.kranz = row.querySelector('[data-marker-input="kranz"]')?.value || 0;
    payload.triclops = row.querySelector('[data-marker-input="triclops"]')?.value || 0;
    payload.va = row.querySelector(`[name="va_${memberId}"]`)?.value || 0;
    payload.monte = row.querySelector(`[name="monte_${memberId}"]`)?.value || 0;
    payload.aussteigen = row.querySelector(`[name="aussteigen_${memberId}"]`)?.value || 0;
    payload.sechs_tage = row.querySelector(`[name="sechs_tage_${memberId}"]`)?.value || 0;
  } else if (kladdeStatus === 2) {
    payload.paid = row.querySelector(`[name="paid_${memberId}"]`)?.value || 0;
  }

  showSaving();

  fetch("/kegelkladde/attendance-auto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then((r) => r.json())
  .then((data) => {
    if (data.ok) {
      showSaved();
    } else {
      showToast(data.error || "Fehler beim Speichern", "error");
    }
  })
  .catch(() => showToast("Fehler beim Speichern", "error"));
}

// Trigger auto-save on blur for number inputs
document.querySelectorAll(".kladde-table .no-spin").forEach((input) => {
  input.addEventListener("change", () => {
    const row = input.closest("tr");
    if (row) autoSaveRow(row);
  });
});

// Game field inputs: recalc + auto-save
document.querySelectorAll(".kladde-table [data-game-field]").forEach((input) => {
  input.addEventListener("input", () => recalcCosts());
  input.addEventListener("change", () => {
    const row = input.closest("tr");
    if (row) autoSaveRow(row);
  });
});

// Custom game value inputs: recalc + AJAX save
document.querySelectorAll(".kladde-table [data-custom-game-field]").forEach((input) => {
  input.addEventListener("input", () => recalcCosts());
  input.addEventListener("change", () => {
    recalcCosts();
    if (!kladdeData || kladdeStatus > 1) return;
    const row = input.closest("tr");
    if (!row) return;
    const csrfToken = kladdeData.dataset.csrf;
    const gamedayId = kladdeData.dataset.gamedayId;
    const memberId = row.dataset.memberId;
    const customGameId = input.dataset.customGameId;
    const amount = input.value || 0;

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

// Paid field inputs (status 2): recalc rest + auto-save
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

// Inline-Edit für Rekorde/Kurioses
document.querySelectorAll(".btn-edit").forEach((btn) => {
  btn.addEventListener("click", () => {
    const row = btn.closest("tr");
    if (row.classList.contains("editing")) return;

    const titleCell = row.querySelector(".record-title");
    const holderCell = row.querySelector(".record-holder");
    const actionsCell = row.querySelector(".actions");
    const actionBtns = actionsCell.querySelector(".action-btns");
    const editForm = actionsCell.querySelector(".edit-form");

    const origTitle = titleCell.textContent.trim();
    const origHolder = holderCell.textContent.trim();

    row.classList.add("editing");

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
      const newTitle = titleCell.querySelector("input").value.trim();
      const newHolder = holderCell.querySelector("input").value.trim();
      if (!newTitle || !newHolder) {
        showToast("Beide Felder müssen ausgefüllt sein.", "error");
        return;
      }
      editForm.querySelector(".edit-title-val").value = newTitle;
      editForm.querySelector(".edit-holder-val").value = newHolder;
      editForm.submit();
    }

    function doCancel() {
      row.classList.remove("editing");
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

  const members = rows.map(row => ({
    id: row.dataset.memberId,
    name: row.querySelector(".name-col")?.textContent?.trim() || "",
    row
  }));

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
      r.innerHTML = '<span class="gcn">' + m.name + '</span>' +
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
      r.innerHTML = '<span class="gcn">' + m.name + '</span>' +
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
    { prefix: "penalties", label: "Strafen" },
    { prefix: "va", label: "V+A" },
    { prefix: "monte", label: "Monte" },
    { prefix: "aussteigen", label: "Aussteigen" },
    { prefix: "sechs_tage", label: "6-Tage" }
  ].forEach(({ prefix, label }) => {
    const { card, body } = makeCard(label);
    let any = false;
    members.forEach(m => {
      const ti = m.row.querySelector('[name="' + prefix + '_' + m.id + '"]');
      if (!ti) return;
      any = true;
      const r = makeRow(m);
      r.innerHTML = '<span class="gcn">' + m.name + '</span>' +
        '<span class="money-inline"><input type="number" min="0" max="999" step="0.10" value="' + ti.value +
        '" class="mini-number no-spin" data-mi="' + prefix + '_' + m.id + '"' +
        (ti.disabled ? " disabled" : "") + ' />&euro;</span>';
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
        r.innerHTML = '<span class="gcn">' + m.name + '</span>' +
          '<span class="money-inline"><input type="number" min="0" max="999" step="0.10" value="' + ti.value +
          '" class="mini-number no-spin" data-mcg="' + cgId + '_' + m.id + '"' +
          (ti.disabled ? " disabled" : "") + ' />&euro;</span>';
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
            body: JSON.stringify({ csrfToken, gamedayId, memberId: m.id, customGameId: cgId, amount: inp.value || 0 })
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
      r.innerHTML = '<span class="gcn">' + m.name + '</span>' +
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
      let h = '<span class="gcn">' + m.name + '</span>' +
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
        // Re-enable inputs/buttons (respect row-inactive state)
        const isInactive = row.classList.contains("row-inactive");
        row.querySelectorAll("input, button").forEach((el) => {
          if (isInactive && el.hasAttribute("data-field") && !el.hasAttribute("data-always-edit")) {
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

// Initialize server-side flash messages as toasts and cost display
document.addEventListener("DOMContentLoaded", () => {
  initCompactMode();
  initKladdeTabNav();
  initMobileByGame();
  initMobileCards();
  initEditLocks();
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
});
