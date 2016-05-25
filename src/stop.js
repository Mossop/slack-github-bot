import http from "http";

http.request({
  port: process.env.PORT,
  path: `/${process.env.UUID}/kill`
}).end();
