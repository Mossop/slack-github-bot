"use strict";

const MongoClient = require("mongodb").MongoClient

const URI = process.env.MONGODB_URI;

function withDB(callback) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      MongoClient.connect(URI, function(err, db) {
        if (err) {
          reject(err);
          return;
        }

        callback(db, ...args).then(result => {
          db.close();
          resolve(result);
        }, result => {
          db.close();
          reject(result);
        });
      });
    });
  }
}

export const getConfigForPath = withDB(async function(db, path) {
  let collection = db.collection("paths");

  path = path.slice(0);
  while (path.length > 0) {
    let config = await collection.findOne({ path });
    if (config) {
      return config;
    }

    path.pop();
  }

  return null;
});

export const setConfigForPath = withDB(async function(db, path, config) {
  let collection = db.collection("paths");

  if (config) {
    let doc = {
      path,
      ...config,
    };

    await collection.findOneAndReplace({ path }, doc, { upsert: true });
  }
  else {
    await collection.findOneAndDelete({ path });
  }
});

export const getConfigForPathPrefix = withDB(async function(db, prefix) {
  let collection = db.collection("paths");

  let query = {};
  prefix.forEach((p, i) => { query[`path.${i}`] = p });

  return await collection.find(query).toArray();
});
