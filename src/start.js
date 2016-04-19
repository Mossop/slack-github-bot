import EventEmitter from "events";

import HttpListener from "./listener"
import Bot from "./slack";
import Github from "./github";

const eventStream = new EventEmitter();

new HttpListener(eventStream);

eventStream.on("http", (payload) => {
  let data = JSON.stringify(payload);
  if (data.length > (72)) {
    data = data.substr(0, 33) + " ... " + data.substr(-33, 33);
  }
});

eventStream.on("log", console.log.bind(console));
eventStream.on("error", console.error.bind(console));

new Bot(eventStream);
new Github(eventStream);
