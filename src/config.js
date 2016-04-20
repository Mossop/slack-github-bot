import fs from "fs";
import path from "path";

const CONFIG = {
  eventRules: {
    rules: {}
  }
};

const configFile = path.join(path.dirname(path.resolve(__dirname)), "prefs.json");

function loadConfig() {
  try {
    let settings = fs.readFileSync(configFile, { encoding: "utf8" });
    let newConfig = JSON.parse(settings);

    for (let name of Object.keys(CONFIG)) {
      delete CONFIG[name];
    }

    for (let name of Object.keys(newConfig)) {
      CONFIG[name] = newConfig[name];
    }
  } catch (e) {
    console.error("Failed to load preferences.", e);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(configFile, JSON.stringify(CONFIG));
  } catch (e) {
    console.error("Failed to save preferences.", e);
  }
}

function getEventsForRules(events, prefix, config) {
  for (let key of Object.keys(config.rules)) {
    getEventsForRules(events, prefix.concat(key), config.rules[key]);
  }

  if ("default" in config) {
    events.push(prefix.concat(config.default ? "on" : "off"));
  }
}

function getEventsForChannel(channel) {
  let events = [];
  if (channel.id in CONFIG.eventRules.rules) {
    getEventsForRules(events, [], CONFIG.eventRules.rules[channel.id]);
    if (!("default" in CONFIG.eventRules.rules[channel.id])) {
      events.push("off");
    }
  } else {
    events.push("off");
  }

  return events;
}

function setEventEnabledForPath(enabled, config, path) {
  if (path.length == 0) {
    if (enabled === undefined) {
      delete config.default;
    } else {
      config.default = enabled;
    }
    return;
  }

  if (!(path[0] in config.rules)) {
    config.rules[path[0]] = {
      rules: {}
    };
  }

  setEventEnabledForPath(enabled, config.rules[path[0]], path.slice(1));
}

function setEventEnabledForChannel(enabled, channel, ...args) {
  setEventEnabledForPath(enabled, CONFIG.eventRules, [channel.id, ...args]);

  saveConfig();
}

function isEventEnabledForPath(config, path) {
  if (path.length > 0 && path[0] in config.rules) {
    let result = isEventEnabledForPath(config.rules[path[0]], path.slice(1));
    if (result !== undefined) {
      return result;
    }
  }

  if ("default" in config) {
    return config.default;
  }

  return undefined;
}

function isEventEnabledForChannel(channel, ...args) {
  let result = isEventEnabledForPath(CONFIG.eventRules, [channel.id, ...args]);

  if (result !== undefined) {
    return result;
  }

  return false;
}

function setConfigAtPath(config, path, value) {
  if (path.length == 1) {
    if (value === undefined) {
      delete config[path[0]];
    } else {
      config[path[0]] = value;
    }

    return;
  }

  if (!(path[0] in config)) {
    config[path[0]] = {};
  }

  setConfigAtPath(config[path[0]], path.slice(1), value);
}

function setConfig(key, value) {
  if (key == "") {
    throw new Error("Cannot override the root config");
  }

  let path = key.split(".");
  setConfigAtPath(CONFIG, path, value);

  saveConfig();
}

function getConfigAtPath(config, path, defaultValue = undefined) {
  if (path.length == 0) {
    return config;
  }

  if (path[0] in config) {
    return getConfigAtPath(config[path[0]], path.slice(0));
  }

  return defaultValue;
}

function getConfig(key, defaultValue) {
  if (key == "") {
    return CONFIG;
  }

  let path = key.split(".");
  return getConfigAtPath(CONFIG, path, defaultValue);
}

loadConfig();

export { getEventsForChannel, isEventEnabledForChannel, setEventEnabledForChannel, setConfig, getConfig };
