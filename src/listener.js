import http from "http";
import path from "path";
import url from "url";

function isLocal(socket) {
  return (socket.localAddress == "::1" || socket.localAddress == "127.0.0.1");
}

class HttpListener {
  constructor(store, port) {
    this.store = store;
    this.server = http.createServer(this.handler.bind(this));
    this.server.listen(port);
  }

  destroy() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  handler(req, res) {
    let urlPath = url.parse(req.url).pathname;
    console.log(req.socket.localAddress, urlPath);

    if (urlPath == "/kill") {
      res.writeHead(200);
      res.end();
      this.destroy();
    }
  }
}

export default HttpListener;
