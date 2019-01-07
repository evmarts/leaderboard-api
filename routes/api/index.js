var express = require('express');
var router = express.Router();
var leaderboardRoute = require('./leaderboard');

router.use('/leaderboard', leaderboardRoute);

module.exports = router;