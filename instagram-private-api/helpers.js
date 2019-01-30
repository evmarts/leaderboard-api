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
