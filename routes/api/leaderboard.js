var express = require("express");
var router = express.Router();
var cors = require("cors");
const knex = require("../../database");
var Client = require("instagram-private-api").V1;
var storage = new Client.CookieFileStorage("./cookies/cookies.json");
const Promise = require("bluebird");

router.use(cors());

router.get("/", async (req, res) => {
  let r = await knex
    .select("username", "points", "likes", "users_tagged", "support_a_creator")
    .from("leaderboard")
    .orderBy("points", "desc")
    .limit(100);
  res.send(r);
});

router.patch("/", async (req, res) => {
  console.log("receieved a patch request with body:", req.body);
  const USER_CREDS = {
    acc1: {
      username: req.body.user,
      password: req.body.password,
      target: req.body.target
    }
  };

  // set up
  var device = new Client.Device(USER_CREDS.acc1.username);
  const session = await getSesh(USER_CREDS.acc1, device);
  const accountName = USER_CREDS.acc1.target;
  const accountID = await getUserIdFromUsername(session, accountName);

  // get all the medias of the account after the specified start date
  const mediaIds = (await getMedia(session, accountID))
    .filter(m => m._params.takenAt > parseInt(req.body.startDate))
    .map(m => m.id);

  // todo should consider creating a endpoint that updates a 'likes'
  //    table and do a select to that table here
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
  // clear likes table
  await knex("likes").del();
  // insert into likes table
  await knex("likes").insert(rowsLikes);

  // grab all the comment tuples that are validated
  const validComments = await knex("tagged")
    .select("*")
    .where("validated", true);
  let taggerMap = {};

  // create a dic that counts number of occurences each user has tagged a friend
  for (comment of validComments) {
    let u = comment.username;
    taggerMap[u] = taggerMap[u] ? taggerMap[u] + 1 : 1;
  }

  // reset the leaderboard
  await knex.raw("delete from leaderboard where 1 = 1");

  // insert rows of likers
  await knex("leaderboard").insert(rowsLikes);

  const rowsComments = await knex.raw(
    "select username, count(*) as tagged from tagged group by username;"
  );
  console.log('here 1')

  for (row of rowsComments.rows) {
    await knex.raw(`insert into leaderboard (username, users_tagged) values ('${
      row.username
    }', '${row.tagged}')
    on conflict (username) do update set users_tagged = '${
      row.tagged
    }' where leaderboard.username = '${row.username}'`);
  }

  console.log('here 2')

  await knex.raw(
    `
    update leaderboard
    set is_supporter = support_a_creator.is_supporter
    from support_a_creator
    where support_a_creator.username = leaderboard.username
    `
  );

  console.log('here 3')

  console.log(
    await knex.raw(
      "UPDATE leaderboard SET points = 100*likes + 200*users_tagged + 500*is_supporter"
    )
  );

  console.log('here 4')

  res.send("response here");
});

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

function union_arrays(x, y) {
  var obj = {};
  for (var i = x.length - 1; i >= 0; --i) obj[x[i]] = x[i];
  for (var i = y.length - 1; i >= 0; --i) obj[y[i]] = y[i];
  var res = [];
  for (var k in obj) {
    if (obj.hasOwnProperty(k))
      // <-- optional
      res.push(obj[k]);
  }
  return res;
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
