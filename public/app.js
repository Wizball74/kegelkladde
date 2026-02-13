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

    // Zu zahlen / Rest berechnen
    const contribution = isPresent ? 4.00 : 0;
    const penalties = Number(row.querySelector('[name^="penalties_"]')?.value || 0);
    const carryover = Number(row.querySelector("[data-carryover]")?.value || 0);
    const paid = Number(row.querySelector("[data-paid]")?.value || 0);
    const toPay = isPresent ? contribution + penalties + costPudel + costOthers + carryover : carryover;
    const rest = toPay - paid;

    const toPayEl = row.querySelector("[data-topay]");
    if (toPayEl) toPayEl.textContent = formatEuroCost(toPay) + " €";

    const restEl = row.querySelector("[data-rest]");
    if (restEl) {
      restEl.textContent = formatEuroCost(rest) + " €";
      restEl.style.color = rest > 0 ? "var(--error)" : rest < 0 ? "var(--success)" : "";
    }
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
    if ((i + 1) % 4 === 0 && (i + 1 < fives || rest > 0)) html += '<span class="tally-break"></span>';
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
  row.style.opacity = cb.checked ? "" : "0.3";
  cb.addEventListener("change", () => {
    row.style.opacity = cb.checked ? "" : "0.3";
    row.classList.toggle("row-inactive", !cb.checked);
    row.querySelectorAll("[data-field], [data-field-btn]").forEach((el) => {
      el.disabled = !cb.checked;
    });
    recalcCosts();
  });
});

// Recalc on any number input change (Strafen, Übertrag, Gezahlt)
document.querySelectorAll(".kladde-table .no-spin").forEach((input) => {
  input.addEventListener("input", () => recalcCosts());
});

// Initialize server-side flash messages as toasts and cost display
document.addEventListener("DOMContentLoaded", () => {
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
