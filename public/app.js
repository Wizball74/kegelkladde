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

// Marker controls for alle9 and kranz
function renderMarkers(displayEl, value, target) {
  const safe = Math.max(0, Math.min(999, value || 0));
  const marker = target === "kranz" ? "│" : "●";
  displayEl.textContent = marker.repeat(Math.min(safe, 15));
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
      const step = Number(input.step) || 1;
      const min = Number(input.min) || 0;
      const max = Number(input.max) || 999;
      const current = Number(input.value) || 0;

      let next = e.key === "ArrowUp" ? current + step : current - step;
      next = Math.max(min, Math.min(max, next));
      input.value = next;
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

// Initialize server-side flash messages as toasts
document.addEventListener("DOMContentLoaded", () => {
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
