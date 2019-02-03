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

router.put("/latest", async (req, res) => {
  console.log("RECEIVED: PUT leaderboard-api/api/comments/latest");
  const device = new Client.Device(req.body.user);
  const session = await getSesh(
    {
      username: req.body.user,
      password: req.body.password
    },
    device
  );
  const accountName = req.body.target;
  const accountID = await getUserIdFromUsername(session, accountName);

  // get all the medias of the account
  const mediaIds = (await getMedia(session, accountID))
    .filter(m => m._params.takenAt > parseInt(req.body.startDate))
    .map(m => m.id);

  // get the comments of each media
  firstTenMapping = {};
  for (mid of mediaIds) {
    // add comments of this media to a accumulator list of comments
    let comments = await getComments(session, mid);

    // loop through all comments of a media, incrementing the counter on each
    // unique user, do not keep the comments when u > 10
    let users = [];
    let u = 0;
    for (comment of comments) {
      if (!users.includes(c._params.user.username) && u <= 10) {
        users.push(c._params.username);
        u = u + 1;
      }
    }
    // count the number of first comments each user has
    for (user of users) {
      firstTenMapping[user] = firstTenMapping[user] + 1 || 1;
    }
  }

  let rows = [];
  for (user of Object.entries(firstTenMapping)) {
    rows.push({ username: user[0], count: user[1] });
  }

  await knex("early_commenters").del();
  await knex("early_commenters").insert(rows);
  res.send({ code: 200, message: "inserted some first commenters" });
});

// gets all instances where a user has tagged another user from the comment
// section of each post after the specified start date
router.put("/", async (req, res) => {
  console.log("RECEIVED: PUT leaderboard-api/api/comments");

  // create instagram-private-api session
  const device = new Client.Device(req.body.user);
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

  // merge the two mappings
  // TODO this could probably be more efficient than it is
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

  // reset the tagged table, then insert the new rows
  await knex("tagged").del();
  await knex("tagged").insert(newRows);

  let message = { status: 200, message: `${newRows.length} tags in the table` };
  console.log(
    "RESPOND: PUT leaderboard-api/api/comments",
    JSON.stringify(message)
  );
  res.send(message);
});

// check all rows with validated = false in the 'tagged' database
// remove those rows that do not pass validation
router.patch("/", async (req, res) => {
  console.log("RECEIVED: PATCH leaderboard-api/api/comments");

  var device = new Client.Device(req.body.user);
  const session = await getSesh(
    {
      username: req.body.user,
      password: req.body.password
    },
    device
  );

  // get all the tags that need to be validated
  const tagged = await knex("tagged")
    .select("*")
    .where("validated", false);

  if (tagged.length < 1) {
    let message = { status: 200, message: "no tags to validate" };
    console.log(
      "RESPOND: PATCH leaderboard-api/api/comments:",
      JSON.stringify(message)
    );
    res.send(message);
    return;
  }
  // for each of the unvalidated tags, attempt to validate it
  let mapping = {};
  let updated = [];
  for (tag of tagged) {
    const userID = await getUserIdFromUsername(session, tag.username);
    const taggedID = await getUserIdFromUsername(session, tag.tagged);
    let followers = [];
    if (!mapping[userID]) {
      followers = await getFollowers(session, userID);
    } else {
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
      console.log(
        "tag tuple:",
        JSON.stringify(tag),
        "is either invalid or could not be validated."
      );
    }
  }

  // delete all rows that were previously unvalidated, insert all rows that
  // were just validated
  await knex("tagged")
    .where("validated", false)
    .del();
  await knex("tagged").insert(updated);

  // TODO need to send error codes if they occur
  let message = { code: 200, message: `${updated.length} tags are valid` };
  console.log(
    "RESPOND: PATCH leaderboard-api/api/comments",
    JSON.stringify(message)
  );
  res.send(message);
});

module.exports = router;
