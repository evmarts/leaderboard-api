var express = require("express");
var router = express.Router();
var cors = require("cors");
const knex = require("../../database");

router.use(cors());

router.get("/", async (req, res) => {
  let r = await knex
    .select("username", "points", "likes", "users_tagged", "support_a_creator")
    .from("leaderboard");
  res.send(r);
});

module.exports = router;
