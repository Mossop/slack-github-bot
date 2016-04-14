import HttpListener from "./listener"
import config from "../config";
import tokens from "../tokens";

new HttpListener(null, config.port, tokens.UUID);
