var express = require("express");
var router = express.Router();
var cors = require("cors");
const knex = require("../../database");
var Client = require("instagram-private-api").V1;
var storage = new Client.CookieFileStorage("./cookies/cookies.json");
const Promise = require("bluebird");

router.use(cors());

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

async function getUserIdFromUsername(session, username) {
  return Client.Account.searchForUser(session, username)
    .then(account => {
      return account.id;
    })
    .catch(err => console.error(err.message));
}

const getFollowers = async (session, accountID) => {
  const feed = new Client.Feed.AccountFollowers(session, accountID);
  feed.map = item => item.id;
  return feed.all();
};

const getComments = async (session, mediaID) => {
  let feed = new Client.Feed.MediaComments(session, mediaID);
  let comments = await new Promise((resolve, reject) => {
    resolve(feed.all());
  });
  let coms = [];
  for (c of comments) {
    coms.push(c);
  }
  return coms;
};

async function getUserIdFromUsername(session, username) {
  return Client.Account.searchForUser(session, username)
    .then(account => {
      return account.id;
    })
    .catch(err => console.error(err.message));
}

const extractUserNames = string => {
  const matches = [];
  for (s of string.split(" ")) {
    const re = /(?:@)([A-Za-z0-9_](?:(?:[A-Za-z0-9_]|(?:\.(?!\.))){0,28}(?:[A-Za-z0-9_]))?)/;
    if (s.match(re)) {
      matches.push(s.match(re)[1]);
    }
  }
  return matches;
};

// gets the likers of a media
const getLikersOfMedia = async (session, mediaID) => {
  return await new Promise((resolve, reject) => {
    resolve(Client.Media.likers(session, mediaID));
  });
};

const getSesh = async (acc, device) => {
  return await new Promise((resolve, reject) => {
    resolve(Client.Session.create(device, storage, acc.username, acc.password));
  });
};

const getMedia = async (session, userID) => {
  return await new Promise((resolve, reject) => {
    let feed = new Client.Feed.UserMedia(session, userID);
    feed.all().then(data => {
      resolve(data);
    });
  });
};

module.exports = router;
