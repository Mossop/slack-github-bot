import EventEmitter from "events";

import HttpListener from "./listener"
import config from "../config";

const eventStream = new EventEmitter();
function emit(source, payload) {
  eventStream.emit(source, payload);
}

new HttpListener(emit, config.port, config.uuid);
