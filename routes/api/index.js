var express = require("express");
var router = express.Router();
const rateLimit = require("express-rate-limit");
var leaderboardRoute = require("./leaderboard");
var commentRoute = require("./comments");
var searchRoute = require("./search");
var cors = require("cors");

router.all('/', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
 });

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});

// rate limiter
router.enable("trust proxy");
router.use("/search", apiLimiter);
router.use(cors());

router.use("/leaderboard", leaderboardRoute);
router.use("/comments", commentRoute);
router.use("/search", searchRoute);

console.log("starting...");
module.exports = router;
