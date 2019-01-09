var express = require("express");
var router = express.Router();
var leaderboardRoute = require("./leaderboard");
var updateRoute = require("./update");

router.use("/leaderboard", leaderboardRoute);
router.use("/update", updateRoute);

module.exports = router;
