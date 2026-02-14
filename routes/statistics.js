const express = require("express");
const { db } = require("../models/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/statistik", requireAuth, (req, res) => {
  // Total gamedays
  const totalGamedays = db.prepare("SELECT COUNT(*) as count FROM gamedays").get().count;
  const settledGamedays = db.prepare("SELECT COUNT(*) as count FROM gamedays WHERE settled = 1").get().count;

  // Total contributions
  const totalContributions = db.prepare("SELECT COALESCE(SUM(contribution), 0) as total FROM attendance").get().total;
  const totalPenalties = db.prepare("SELECT COALESCE(SUM(penalties), 0) as total FROM attendance").get().total;

  // Member count
  const memberCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_guest = 0").get().count;
  const guestCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_guest = 1").get().count;

  // Top attendance (most present)
  const topAttendance = db.prepare(`
    SELECT u.first_name, u.last_name, COUNT(*) as games
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.present = 1
    GROUP BY a.user_id
    ORDER BY games DESC
    LIMIT 5
  `).all();

  // Top contributions
  const topContributors = db.prepare(`
    SELECT u.first_name, u.last_name, COALESCE(SUM(a.contribution), 0) as total
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    GROUP BY a.user_id
    ORDER BY total DESC
    LIMIT 5
  `).all();

  // Top alle9
  const topAlle9 = db.prepare(`
    SELECT u.first_name, u.last_name, COALESCE(SUM(a.alle9), 0) as total
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT 5
  `).all();

  // Top kranz
  const topKranz = db.prepare(`
    SELECT u.first_name, u.last_name, COALESCE(SUM(a.kranz), 0) as total
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT 5
  `).all();

  // Most pudel
  const mostPudel = db.prepare(`
    SELECT u.first_name, u.last_name, COALESCE(SUM(a.pudel), 0) as total
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT 5
  `).all();

  // Recent gamedays
  const recentGamedays = db.prepare(`
    SELECT id, match_date, note, settled
    FROM gamedays
    ORDER BY match_date DESC
    LIMIT 5
  `).all();

  // Monthly summary (current year)
  const currentYear = new Date().getFullYear();
  const monthlySummary = db.prepare(`
    SELECT
      strftime('%m', g.match_date) as month,
      COUNT(DISTINCT g.id) as gamedays,
      COALESCE(SUM(a.contribution), 0) as contributions,
      COALESCE(SUM(a.penalties), 0) as penalties
    FROM gamedays g
    LEFT JOIN attendance a ON g.id = a.gameday_id AND a.present = 1
    WHERE strftime('%Y', g.match_date) = ?
    GROUP BY strftime('%m', g.match_date)
    ORDER BY month
  `).all(String(currentYear));

  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const formattedMonthlySummary = monthlySummary.map(m => ({
    ...m,
    monthName: monthNames[parseInt(m.month, 10) - 1]
  }));

  // Per-member 9er/Kranz stats with averages
  const neunerKraenze = db.prepare(`
    SELECT u.first_name, u.last_name,
      COALESCE(SUM(a.alle9), 0) as total_alle9,
      COALESCE(SUM(a.kranz), 0) as total_kranz,
      COUNT(*) as games,
      ROUND(CAST(COALESCE(SUM(a.alle9), 0) AS REAL) / COUNT(*), 2) as avg_alle9,
      ROUND(CAST(COALESCE(SUM(a.kranz), 0) AS REAL) / COUNT(*), 2) as avg_kranz
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.present = 1
    GROUP BY a.user_id
    ORDER BY total_alle9 + total_kranz DESC
  `).all();

  res.render("statistics", {
    totalGamedays,
    settledGamedays,
    totalContributions,
    totalPenalties,
    memberCount,
    guestCount,
    topAttendance,
    topContributors,
    topAlle9,
    topKranz,
    mostPudel,
    recentGamedays,
    monthlySummary: formattedMonthlySummary,
    currentYear,
    neunerKraenze
  });
});

module.exports = router;
