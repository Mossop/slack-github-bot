import HttpListener from "./listener"
import config from "../config";

new HttpListener(null, config.port);
