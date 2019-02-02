var express = require("express");
var router = express.Router();
const rateLimit = require("express-rate-limit");
var leaderboardRoute = require("./leaderboard");
var commentRoute = require("./comments");
var searchRoute = require("./search");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});

// rate limiter
router.use("/search", apiLimiter);

router.use("/leaderboard", leaderboardRoute);
router.use("/comments", commentRoute);
router.use("/search", searchRoute);

console.log("starting...");
module.exports = router;
