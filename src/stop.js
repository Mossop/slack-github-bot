import http from "http";
import config from "../config"

http.request({
  port: config.port,
  path: `/${config.uuid}/kill`
}).end();
