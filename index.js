const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");

// Import routes
const authRoutes = require("./routes/auth");
const kegelkladdeRoutes = require("./routes/kegelkladde");
const membersRoutes = require("./routes/members");
const ranglistenRoutes = require("./routes/ranglisten");
const recordsRoutes = require("./routes/records");
const statisticsRoutes = require("./routes/statistics");
const adminRoutes = require("./routes/admin");
const pinnwandRoutes = require("./routes/pinnwand");

// Import middleware
const { requireInitialized, flashMiddleware, setLocals } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Railway/Render/etc. terminieren TLS am Reverse Proxy –
// ohne trust proxy setzt Express secure-Cookies nicht korrekt
app.set("trust proxy", 1);

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Security and parsing middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads/pinnwand", express.static(path.join(__dirname, "data", "uploads", "pinnwand")));
app.use("/uploads/avatars", express.static(path.join(__dirname, "data", "uploads", "avatars")));

// Session configuration
app.use(
  session({
    name: "kc_schaf_sid",
    secret: process.env.SESSION_SECRET || "dev-only-fallback-change-me",
    proxy: true,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

// Application middleware
app.use(requireInitialized);
app.use(flashMiddleware);
app.use(setLocals);

// Routes
app.use(authRoutes);
app.use(kegelkladdeRoutes);
app.use(membersRoutes);
app.use(ranglistenRoutes);
app.use(recordsRoutes);
app.use(statisticsRoutes);
app.use(adminRoutes);
app.use(pinnwandRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error:`, err.message);
  console.error(err.stack);

  if (res.headersSent) {
    return next(err);
  }

  req.session.flash = { type: "error", message: "Ein Fehler ist aufgetreten." };
  res.status(500).redirect("back");
});

// 404 handler
app.use((req, res) => {
  res.status(404).render("not-found");
});

// Start server
app.listen(PORT, () => {
  console.log(`KC Schaf Zeilsheim laeuft auf http://localhost:${PORT}`);
});
