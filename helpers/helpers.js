var Client = require("instagram-private-api").V1;
var storage = new Client.CookieFileStorage("./cookies/cookies.json");

module.exports.getSesh = async (acc, device) => {
  console.log(acc, device);
  return await new Promise((resolve, reject) => {
    resolve(Client.Session.create(device, storage, acc.username, acc.password));
  });
};

module.exports.getMedia = async (session, userID) => {
  return await new Promise((resolve, reject) => {
    let feed = new Client.Feed.UserMedia(session, userID);
    feed.all().then(data => {
      resolve(data);
    });
  });
};

// gets the likers of a media
module.exports.getLikersOfMedia = async (session, mediaID) => {
  return await new Promise((resolve, reject) => {
    resolve(Client.Media.likers(session, mediaID));
  });
};

module.exports.getUserIdFromUsername = async (session, username) => {
  return Client.Account.searchForUser(session, username)
    .then(account => {
      return account.id;
    })
    .catch(err => console.error(err.message));
};

module.exports.extractUserNames = string => {
  const matches = [];
  for (s of string.split(" ")) {
    const re = /(?:@)([A-Za-z0-9_](?:(?:[A-Za-z0-9_]|(?:\.(?!\.))){0,28}(?:[A-Za-z0-9_]))?)/;
    if (s.match(re)) {
      matches.push(s.match(re)[1]);
    }
  }
  return matches;
};

module.exports.getComments = async (session, mediaID) => {
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

module.exports.getFollowers = async (session, accountID) => {
  const feed = new Client.Feed.AccountFollowers(session, accountID);
  feed.map = item => item.id;
  return feed.all();
};
