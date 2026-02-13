function sanitize(str, max = 150) {
  return String(str || "").trim().slice(0, max);
}

function parsePhones(raw) {
  const phones = String(raw || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  return phones;
}

function formatEuro(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

module.exports = {
  sanitize,
  parsePhones,
  formatEuro,
  formatDate,
  formatDateTime
};
