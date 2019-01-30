var express = require("express");
var router = express.Router();
var leaderboardRoute = require("./leaderboard");
var commentRoute = require("./comments");

router.use("/leaderboard", leaderboardRoute);
router.use("/comments", commentRoute);

console.log('starting...')
module.exports = router;