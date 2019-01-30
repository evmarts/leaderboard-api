var express = require("express");
var router = express.Router();
var cors = require("cors");
router.use(cors());
const knex = require("../../database");
var Client = require("instagram-private-api").V1;
const {
  getSesh,
  getMedia,
  getLikersOfMedia,
  getUserIdFromUsername
} = require("../../helpers/helpers.js");

// TODOs
// todo: should consider creating a endpoint that updates a 'likes' table and do a select to that table here
// todo: add try/catch blocks

// returns the current leaderboard
router.get("/", async (req, res) => {
  console.log("RECEIVED: GET leaderboard-api/api/leaderboard");

  let leaderboardRows = await knex
    .select("username", "points", "likes", "users_tagged", "support_a_creator")
    .from("leaderboard")
    .orderBy("points", "desc")
    .limit(100);
  console.log("RESPOND: GET leaderboard-api/api/leaderboard");
  res.send(leaderboardRows);
});

// PATCH api/leaderboard
router.patch("/", async (req, res) => {
  console.log("RECEIVED: PATCH leaderboard-api/api/leaderboard");

  // create instagram-private-api session
  var device = new Client.Device(req.body.user);
  const session = await getSesh(
    {
      username: req.body.user,
      password: req.body.password
    },
    device
  );
  const accountName = req.body.target;
  const accountID = await getUserIdFromUsername(session, accountName);

  // get all the medias of the account after the specified start date
  const mediaIds = (await getMedia(session, accountID))
    .filter(m => m._params.takenAt > parseInt(req.body.startDate))
    .map(m => m.id);

  // get all likers of your media
  let likersMap = {};
  for (mid of mediaIds) {
    let likers = await getLikersOfMedia(session, mid);
    // create a dict that counts number of occurrences of a like on your media
    for (l of likers) {
      likersMap[l._params.username] = likersMap[l._params.username] + 1 || 1;
    }
  }

  // create an array of rows to be inserted into 'likes' table
  let likeObj = likersMap;
  let rowsLikes = [];
  for (user of Object.entries(likeObj)) {
    rowsLikes.push({ username: user[0], likes: user[1] });
  }

  // clear 'likes' table then insert new rows into likes table
  await knex("likes").del();
  await knex("likes").insert(rowsLikes);

  // grab all the comment tuples that are validated
  const validComments = await knex("tagged")
    .select("*")
    .where("validated", true);
  let taggerMap = {};

  // create a object array that counts number of occurences each user has
  // tagged a friend
  for (comment of validComments) {
    let u = comment.username;
    taggerMap[u] = taggerMap[u] ? taggerMap[u] + 1 : 1;
  }

  // reset the leaderboard and insert new rows of likers
  await knex.raw("delete from leaderboard where 1 = 1");
  await knex("leaderboard").insert(rowsLikes);

  // get the the number of tagged friends each user has done
  const rowsComments = await knex.raw(
    "select username, count(*) as tagged from tagged group by username;"
  );

  // for each (username, tagCount) tuple, update the user's tagged column if they
  // already have a record OR create a new record if they don't already have a record
  for (row of rowsComments.rows) {
    await knex.raw(`insert into leaderboard (username, users_tagged) values ('${
      row.username
    }', '${row.tagged}')
    on conflict (username) do update set users_tagged = '${
      row.tagged
    }' where leaderboard.username = '${row.username}'`);
  }

  // insert any support a creator records into the leaderboard
  await knex.raw(
    `
    update leaderboard
    set is_supporter = support_a_creator.is_supporter
    from support_a_creator
    where support_a_creator.username = leaderboard.username
    `
  );

  // calculate points from the other columns in the leaderboard
  await knex.raw(
    "UPDATE leaderboard SET points = 100*likes + 200*users_tagged + 500*is_supporter"
  );

  let message = {
    status: 200,
    message: `total likers: ${rowsLikes.length}, total taggers: ${
      rowsComments.rows.length
    }`
  };
  console.log(
    "RESPOND: PATCH leaderboard-api/api/leaderboard",
    JSON.stringify(message)
  );
  res.send(message);
});

module.exports = router;
