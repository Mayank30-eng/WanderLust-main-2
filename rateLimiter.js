const { rateLimit } = require("express-rate-limit");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash("429 error", "Too many login attempts. Please try again in 15 minutes.");
    res.redirect(303, "/login");
  },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
 handler: (req, res) => {
    req.flash("429 error", "Too many signup attempts. Please try again in an hour.");
    res.redirect(303, "/signup");
  },
});

const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
    handler: (req, res) => {
    req.flash("429 error", "Too many requests. Please try again in a minute.");
    res.redirect(303, req.originalUrl);
    }
});

module.exports = { loginLimiter, signupLimiter, queryLimiter };
