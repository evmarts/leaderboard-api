var express = require("express");
var router = express.Router();
var cors = require("cors");
router.use(cors());
const knex = require("../../database");

router.get("/", async (req, res) => {
  console.log("RECEIVED: GET leaderboard-api/api/search");

  const topTen = (await knex.raw(
    "select username, points from leaderboard order by points desc limit 10"
  )).rows;

  const searchedUser = await knex("leaderboard")
    .select("username", "points")
    .where("username", req.query.username);

  if (!searchedUser[0]) {
    console.log("RESPOND: GET leaderboard-api/api/search user not found");
    return res.sendStatus(404);
  }
  let chanceToWin = 0;
  let totalPointsTopTen = topTen
    .map(user => user.points)
    .reduce((a, b) => a + b, 0);
  if (
    topTen.map(user => user.username).includes(req.query.username) &&
    totalPointsTopTen > 0
  ) {
    chanceToWin = parseFloat(searchedUser[0].points) / totalPointsTopTen;
  } else {
    chanceToWin = 0;
  }

  console.log("RESPOND: GET leaderboard-api/api/search");
  res.send({
    username: req.query.username,
    points: searchedUser[0].points,
    chance: chanceToWin
  });
});

module.exports = router;
