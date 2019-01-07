var express = require("express");
var router = express.Router();
var cors = require("cors");
const knex = require("../../database");

router.use(cors());

router.get("/", async (req, res) => {
  console.log('got a request')
});