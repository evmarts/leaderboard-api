var express = require("express");
var router = express.Router();
var cors = require("cors");
const knex = require("../../database");
var Client = require("instagram-private-api").V1;
var storage = new Client.CookieFileStorage("./cookies/cookies.json");
const Promise = require("bluebird");

router.use(cors());

router.get("/", async (req, res) => {
  leaderboard({
    acc1: {
      username: req.query.username,
      password: req.query.password,
      target: req.query.target
    }
  });
});

leaderboard = async USER_CREDS => {
  var device = new Client.Device(USER_CREDS.acc1.username);
  const session = await getSesh(USER_CREDS.acc1, device);

  const accountName = USER_CREDS.acc1.target;
  const accountID = await getUserIdFromUsername(session, accountName);
  const recentMedias = await getRecentMedia(session, accountID);
  const recentMediaIds = recentMedias.map(rm => rm.id);

  let likersMap = {};
  let allComments = [];
  for (mid of recentMediaIds) {
    let likers = await getLikersOfMedia(session, mid);
    for (l of likers) {
      likersMap[l._params.username] = likersMap[l._params.username] + 1 || 1;
    }

    let comments = await getComments(session, mid);
    allComments = allComments.concat(comments);
  }

  let map = {};
  for (comment of allComments) {
    let username = comment._params.user.username;
    let text = comment._params.text;
    map[username] = map[username] ? map[username] + ", " + text : text;
  }
  const commenterObjs = [];
  for (commenterComment of Object.entries(map)) {
    let commenter = commenterComment[0];
    let comment = commenterComment[1];

    let mentioned = extractUserNames(comment);
    mentioned = [...new Set(mentioned)];
    let commentObj = { [commenter]: mentioned };
    if (mentioned.length > 0) {
      commenterObjs.push(commentObj);
    }
  }

  let commentObj = commenterObjs;

  let inArr = [];
  for (user of commentObj) {
    inArr.push({
      username: Object.keys(user)[0],
      users_tagged: Object.values(user)[0].length
    });
  }

  let likeObj = likersMap;

  await knex.raw("delete from leaderboard where 1 = 1");

  let inputArr = [];
  for (user of Object.entries(likeObj)) {
    inputArr.push({ username: user[0], likes: user[1] });
  }
  await knex("leaderboard").insert(inputArr);

  for (input of inArr) {
    await knex.raw(`insert into leaderboard (username, users_tagged) values ('${
      input.username
    }', ${input.users_tagged})
    on conflict (username) do update set users_tagged = ${
      input.users_tagged
    } where leaderboard.username = '${input.username}'`);
  }

  console.log(
    await knex.raw("UPDATE leaderboard SET points = likes + 2*users_tagged")
  );
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

const getRecentMedia = async (session, userID) => {
  return await new Promise((resolve, reject) => {
    let feed = new Client.Feed.UserMedia(session, userID);
    feed.get().then(data => {
      resolve(data);
    });
  });
};

module.exports = router;
