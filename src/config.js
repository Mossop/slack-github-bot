const CONFIG = {
  actionRules: {
    rules: {}
  }
};

function loadConfig() {
}

function saveConfig() {
}

function setActionEnabledForPath(enabled, config, path) {
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

  setActionEnabledForPath(enabled, config.rules[path[0]], path.slice(1));
}

function setActionEnabledForChannel(enabled, channel, ...args) {
  setActionEnabledForPath(enabled, CONFIG.actionRules, [channel.id, ...args]);

  saveConfig();
}

function isActionEnabledForPath(config, path) {
  if (path.length > 0 && path[0] in config.rules) {
    let result = isActionEnabledForPath(config.rules[path[0]], path.slice(1));
    if (result !== undefined) {
      return result;
    }
  }

  if ("default" in config) {
    return config.default;
  }

  return undefined;
}

function isActionEnabledForChannel(channel, ...args) {
  let result = isActionEnabledForPath(CONFIG.actionRules, [channel.id, ...args]);

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

function getConfigAtPath(config, path, defaultValue) {
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

export { isActionEnabledForChannel, setActionEnabledForChannel, setConfig, getConfig };