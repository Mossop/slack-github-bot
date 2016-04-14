import http from "http";
import config from "../config"
import tokens from "../tokens"

http.request({
  port: config.port,
  path: `/${tokens.UUID}/kill`
}).end();
