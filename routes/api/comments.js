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
  getUserIdFromUsername,
  extractUserNames,
  getComments,
  getFollowers
} = require("../../helpers/helpers.js");

// TODO this should be idempotent!
router.put("/", async (req, res) => {
  console.log("got a PUT /api/comments request with body:", req.body);

  const device = new Client.Device(req.body.user);
  const session = await getSesh(
    {
      username: req.body.user,
      password: req.body.password
    },
    device
  );
  console.log("logged in to:", req.body.user);

  console.log("scraping media from:", req.body.target);
  const accountName = req.body.target;
  const accountID = await getUserIdFromUsername(session, accountName);

  // get all the medias of the account
  const mediaIds = (await getMedia(session, accountID))
    .filter(m => m._params.takenAt > parseInt(req.body.startDate))
    .map(m => m.id);

  console.log("considering:", mediaIds.length);
  // get the likers and comments of each media
  let likersCount = {};
  let allComments = [];
  for (mid of mediaIds) {
    // count the number of likes each user has given
    let likers = await getLikersOfMedia(session, mid);
    for (liker of likers) {
      likersCount[liker._params.username] =
        likersCount[liker._params.username] + 1 || 1;
    }
    // add comments of this media to a accumulator list of comments
    let comments = await getComments(session, mid);
    allComments = allComments.concat(comments);
  }

  // accumulate all the comments a user has given, separate each comment with a ", "
  // TODO instead of separating them with a comma, use an array
  let commentersComments = {};
  for (comment of allComments) {
    let username = comment._params.user.username;
    let text = comment._params.text;
    commentersComments[username] = commentersComments[username]
      ? commentersComments[username] + ", " + text
      : text;
  }

  // filter out invalid and duplicate tags
  // note: with this implimentation, user can only earn points
  //       once for each from they tag
  const currentCommentMapping = [];
  for (commenterComment of Object.entries(commentersComments)) {
    let commenter = commenterComment[0];
    let comment = commenterComment[1];
    let mentioned = extractUserNames(comment); // the tagged user(s) for a commenter
    // remove duplicates
    mentioned = [...new Set(mentioned)];
    if (mentioned.length > 0) {
      for (m of mentioned) {
        currentCommentMapping.push({
          username: commenter,
          tagged: m,
          validated: false
        });
      }
    }
  }
  // get the current states of (commenter, tagged) tuples from the db
  const oldCommentMapping = await knex("tagged").select("*");

  const newRows = [];
  for (ocm of oldCommentMapping) {
    if (
      currentCommentMapping
        .map(e => {
          return JSON.stringify({ username: e.username, tagged: e.tagged });
        })
        .includes(
          JSON.stringify({ username: ocm.username, tagged: ocm.tagged })
        )
    ) {
      newRows.push(ocm);
    }
  }
  for (ccm of currentCommentMapping) {
    if (
      !newRows
        .map(e => {
          return JSON.stringify({ username: e.username, tagged: e.tagged });
        })
        .includes(
          JSON.stringify({ username: ccm.username, tagged: ccm.tagged })
        )
    ) {
      newRows.push(ccm);
    }
  }

  await knex("tagged").del();
  res.send(await knex("tagged").insert(newRows));
});

// check all rows with validated = false in the 'tagged' database
// remove those rows that do not pass validation
router.patch("/", async (req, res) => {
  console.log("got a PATCH /api/comments request with body:", req.body);
  const USER_CREDS = {
    acc1: {
      username: req.body.user,
      password: req.body.password,
      target: req.body.target
    }
  };

  var device = new Client.Device(USER_CREDS.acc1.username);
  const session = await getSesh(USER_CREDS.acc1, device);

  const tagged = await knex("tagged")
    .select("*")
    .where("validated", false);
  console.log(tagged);

  let mapping = {};
  let updated = [];

  for (tag of tagged) {
    // const followers = await getFollowersOfUser(session, accountID);
    const userID = await getUserIdFromUsername(session, tag.username);
    const taggedID = await getUserIdFromUsername(session, tag.tagged);
    console.log(tag.username);
    let followers = [];
    let valid = false;
    if (!mapping[userID]) {
      console.log("havent seen");
      followers = await getFollowers(session, userID);
    } else {
      console.log("seen");
      followers = mapping[userID];
    }
    Object.assign(mapping, { [userID]: followers });
    if (followers.includes(taggedID)) {
      updated.push({
        username: tag.username,
        tagged: tag.tagged,
        validated: true
      });
    } else {
      console.log("invalid tag");
    }
  }

  await knex("tagged")
    .where("validated", false)
    .del();
  console.log(await knex("tagged").insert(updated));

  res.send(updated);
});

module.exports = router;
