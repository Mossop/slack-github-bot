import http from "http";
import path from "path";
import url from "url";

// Github's maximum payload is 5MB, be a little generous
const MAX_PAYLOAD = 1024 * 1024 * 6;

function isLocal(socket) {
  return (socket.localAddress == "::1" || socket.localAddress == "127.0.0.1");
}

class HttpListener {
  constructor(emitter, port, uuid) {
    this.emitter = emitter;
    this.uuid = uuid;
    this.server = http.createServer(this.handler.bind(this));
    this.server.listen(port);
  }

  destroy() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  handler(request, response) {
    let urlPath = url.parse(request.url).pathname;
    if (!urlPath.startsWith(`/${this.uuid}/`)) {
      return;
    }
    urlPath = urlPath.substring(this.uuid.length + 1);

    if (urlPath == "/kill") {
      this.emitter("destroy");
      this.destroy();
      response.writeHead(200);
      response.end();
      return;
    }

    let body = "";
    request.on("data", (data) => {
      body += data;

      if (body.length > MAX_PAYLOAD) {
        console.error("Terminating request for sending too much data");
        response.writeHead(500);
        response.end("Too much data");
      }
    });

    request.on("end", () => {
      try {
        let payload = JSON.parse(body);
        this.emitter("http", {
          path: urlPath,
          payload
        });
        response.writeHead(200);
        response.end();
      }
      catch (e) {
        console.error(e);
        response.writeHead(500);
        response.end(e);
      }
    });
  }
}

export default HttpListener;
