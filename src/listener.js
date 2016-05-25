import http from "http";
import path from "path";
import url from "url";

import fs from "fs-promise";

// Github's maximum payload is 5MB, be a little generous
const MAX_PAYLOAD = 1024 * 1024 * 6;

const STATIC = path.resolve(path.join(__dirname, "..", "static"));

function isLocal(socket) {
  return (socket.localAddress == "::1" || socket.localAddress == "127.0.0.1");
}

class HttpListener {
  constructor(events) {
    this.events = events;
    this.server = http.createServer(this.handler.bind(this));
    this.server.listen(process.env.PORT);
    this.events.on("destroy", this.destroy.bind(this));
  }

  destroy() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  async handler(request, response) {
    let urlPath = url.parse(request.url).pathname;

    if (urlPath.startsWith("/static/")) {
      let file = path.resolve(path.join(STATIC, urlPath.substring(8)));
      if (!file.startsWith(STATIC)) {
        response.writeHead(500);
        response.end("Bad path");
        return;
      }

      try {
        let data = await fs.readFile(file);
        response.writeHead(200);
        response.end(data);
      } catch (e) {
        this.events.emit("error", e, e.skip);
        response.writeHead(500);
        response.end(`Error loading ${file}: ${e}`);
      }
      return;
    }

    if (!urlPath.startsWith(`/${process.env.UUID}/`)) {
      return;
    }
    urlPath = urlPath.substring(process.env.UUID.length + 1);

    if (urlPath == "/kill") {
      response.writeHead(200);
      response.end();
      this.events.emit("destroy");
      return;
    }

    let body = "";
    request.on("data", (data) => {
      body += data;

      if (body.length > MAX_PAYLOAD) {
        this.events.emit("error", "Terminating request for sending too much data");
        response.writeHead(500);
        response.end("Too much data");
      }
    });

    request.on("end", () => {
      this.events.emit("log", "http", urlPath, new Date());
      this.events.emit("http", {
        path: urlPath,
        headers: request.headers,
        body,
      });
      response.writeHead(200);
      response.end();
    });
  }
}

export default HttpListener;
