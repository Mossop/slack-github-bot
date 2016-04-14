import http from "http";
import path from "path";
import url from "url";

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
    this.emitter("http", { reason: "shutdown" });
    return new Promise((resolve) => this.server.close(resolve));
  }

  handler(req, res) {
    let urlPath = url.parse(req.url).pathname;
    if (!urlPath.startsWith(`/${this.uuid}/`)) {
      return;
    }
    let source = urlPath.substring(this.uuid.length + 2);

    if (source == "kill") {
      this.destroy();
      res.writeHead(200);
      res.end();
      return;
    }
  }
}

export default HttpListener;
