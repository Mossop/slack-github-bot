import EventEmitter from "events";

import HttpListener from "./listener"
import config from "../config";

const eventStream = new EventEmitter();
function emit(source, payload) {
  eventStream.emit(source, payload);
}

new HttpListener(emit, config.port, config.uuid);

eventStream.on("http", (payload) => {
  let data = JSON.stringify(payload);
  if (data.length > (72)) {
    data = data.substr(0, 33) + " ... " + data.substr(-33, 33);
  }

  console.log("http " + data);
});
