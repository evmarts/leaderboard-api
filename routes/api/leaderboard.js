var express = require("express");
var router = express.Router();
var cors = require("cors");
const knex = require("../../database");

router.use(cors());

router.get("/", async (req, res) => {
  let r = await knex
    .select("users_small.username", "users_small.points")
    .from("users_small");
  res.send(r);
});

module.exports = router;
