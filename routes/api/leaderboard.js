var express = require("express");
var router = express.Router();
var cors = require("cors");
const knex = require("../../database");

router.use(cors());

router.get("/", async (req, res) => {
  console.log('HHHHHEEEEEYYYYYY')
  // let r = await knex
  //   .select("users_small.username", "users_small.points")
  //   .from("users_small");
  // res.send(r);
  res.send('HEY')
});

module.exports = router;
