import { RtmClient as Client, WebClient, CLIENT_EVENTS, RTM_EVENTS } from "slack-client";
import splitargs from "splitargs";

import { isEventEnabledForChannel, setEventEnabledForChannel, setConfig, getConfig } from "./config";
import config from "../config";

function escape(text) {
  return text.replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;");
}

const SLACK_EVENT_MAP = {
  [CLIENT_EVENTS.RTM.AUTHENTICATED]: "onConnected",
  [CLIENT_EVENTS.RTM.WS_CLOSE]: "onDisconnected",
  [RTM_EVENTS.CHANNEL_JOINED]: "onChannelJoined",
  [RTM_EVENTS.GROUP_JOINED]: "onChannelJoined",
  [RTM_EVENTS.IM_CREATED]: "onChannelJoined",
  [RTM_EVENTS.CHANNEL_LEFT]: "onChannelLeft",
  [RTM_EVENTS.GROUP_LEFT]: "onChannelLeft",
  [RTM_EVENTS.TEAM_JOIN]: "onNewUser",
  [RTM_EVENTS.USER_CHANGE]: "onNewUser",
  [RTM_EVENTS.MESSAGE]: "onMessage",
};

const REPO_EVENT_MAP = {
  "pullrequest": "onPullRequestEvent",
  "issue": "onIssueEvent",
  "branch": "onBranchEvent",
};

const Commands = {
  "help": {
    info: "List commands for this bot.",
    run({ channel, user, params, respond }) {
      if (params.length > 1) {
        respond(escape("Usage: help <command>"));
        return;
      } else if (params.length == 1) {
        if (params[0] in Commands) {
          let command = Commands[params[0]];
          let response = escape(command.info);
          if (command.usage) {
            response += `\nUsage: \`${escape(params[0])} ${command.usage}\``;
          }
          respond(response);
        } else {
          respond("Unknown command");
        }
      } else {
        let response = "Here are the commands I support:";
        for (let name of Object.keys(Commands)) {
          let command = Commands[name];
          if (command.restricted && !isAdmin(config.owner, user, channel)) {
            continue;
          }
          response += "\n" + name + ": " + escape(command.info.split("\n")[0]);
        }
        respond(response);
      }
    }
  },

  "shutdown": {
    info: "Shuts down this bot.",
    run({ params, respond }) {
      respond("Bye.");
      this.events.emit("destroy");
    }
  },

  "set-config": {
    restricted: true,
    usage: "<path> <value>",
    info: "Sets a configuration entry.",
    validate({ params }) {
      return params.length == 2;
    },
    run({ params, respond }) {
      let [name, value] = params;
      if (value == "undefined") {
        value = undefined;
      } else {
        try {
          value = JSON.parse(value);
        }
        catch (e) {
        }
      }

      setConfig(name, value);
      respond("Ok.");
    }
  },

  "get-config": {
    restricted: true,
    usage: "<path>",
    info: "Gets a configuration entry.",
    validate({ params }) {
      return params.length <= 1;
    },
    run({ params, respond }) {
      let name = params.length ? params[0] : "";
      respond(escape(JSON.stringify(getConfig(name, undefined))));
    }
  },

  "event": {
    restricted: true,
    usage: "<...path> <on/off/default>",
    info: `Control reporting of events to this channel.
The path filters events. The more parts of the path you include the more specific the rule.
Useful paths:
\`branch <pushed/created/deleted> <branch name>\`
\`issue <opened/closed/reopened>\`
\`pullrequest <opened/closed/reopened>\``,
    validate({ params }) {
      if (params.length < 1 || params.length > 3) {
        return false;
      }

      let state = params[params.length - 1];
      if (state != "on" && state != "off" && state != "default") {
        return false;
      }

      return true;
    },
    run({ channel, params, respond }) {
      let state = params.pop();
      if (state == "default") {
        state = undefined;
      } else {
        state = state == "on";
      }

      setEventEnabledForChannel(state, channel, ...params);
      respond("Ok.");
    }
  },

  "test": {
    usage: "<type> <subtype>",
    info: "Test whether events will be reported to this channel.",
    validate({ params }) {
      return params.length <= 2;
    },
    run({ channel, params, respond }) {
      let result = isEventEnabledForChannel(channel, ...params);
      respond(result ? "on" : "off");
    }
  }
}

function isAdmin(user, channel) {
  if (user.id == channel.creator) {
    return true;
  }

  if (user.is_admin || user.is_owner || user.is_primary_owner) {
    return true;
  }

  return user.name == config.owner;
}

function runCommand(bot, command, args) {
  let commandObj = Commands[command];

  if (commandObj.restricted && !isAdmin(args.user, args.channel)) {
    args.respond("Sorry, you can't do that.");
    return;
  }

  if ("validate" in commandObj && !commandObj.validate.call(bot, args)) {
    args.params = [command];
    runCommand(bot, "help", args);
    return;
  }

  commandObj.run.call(bot, args);
}

class Bot {
  constructor(events) {
    this.channels = new Map();
    this.users = new Map();
    this.events = events;

    for (let event of ["destroy"]) {
      let name = "on" + event.charAt(0).toUpperCase() + event.substring(1);
      events.on(event, this[name].bind(this));
    }

    this.client = new Client(config.slack_token);
    this.webClient = new WebClient(config.slack_token);

    for (let event of Object.keys(SLACK_EVENT_MAP)) {
      this.client.on(event, this[SLACK_EVENT_MAP[event]].bind(this));
    }

    for (let event of Object.keys(REPO_EVENT_MAP)) {
      this.events.on(event, this[REPO_EVENT_MAP[event]].bind(this));
    }

    this.client.start({ no_unreads: true });
  }

  sendEvent(message, ...path) {
    for (let channel of this.channels.values()) {
      if (isEventEnabledForChannel(channel, ...path)) {
        this.sendMessage(channel, message);
      }
    }
  }

  onPullRequestEvent(event) {
    let message = {
      username: event.source.name,
      icon_url: event.source.avatar,
      text: `${escape(event.sender.fullname)} ${event.subtype} pull request ${event.pullrequest.name}.`,
      attachments: [{
        fallback: `${escape(event.pullrequest.title)} ${escape(event.pullrequest.url)}`,
        title: escape(event.pullrequest.title),
        title_link: escape(event.pullrequest.url)
      }]
    };

    this.sendEvent(message, event.type, event.subtype);
  }

  onIssueEvent(event) {
    let message = {
      username: event.source.name,
      icon_url: event.source.avatar,
      text: `${escape(event.sender.fullname)} ${event.subtype} issue ${event.issue.name}.`,
      attachments: [{
        fallback: `${escape(event.issue.title)} ${escape(event.issue.url)}`,
        title: escape(event.issue.title),
        title_link: escape(event.issue.url)
      }]
    };

    this.sendEvent(message, event.type, event.subtype);
  }

  onBranchEvent(event) {
    let text = `${escape(event.sender.fullname)} `;

    if (event.forced) {
      text += "*force* ";
    }

    text += `${event.subtype} `;
    if (event.subtype == "pushed") {
      text += `<${escape(event.url)}|${event.commits.length} commit`;
      if (event.commits.length != 1) {
        text += "s";
      }
      text += "> to ";
    }

    text += `branch <${escape(event.branch.url)}|${escape(event.branch.name)}>`;

    let textify = (commit) => {
      return `\`<${escape(commit.url)}|${escape(commit.id.substring(0, 8))}>\` ${escape(commit.title)} - ${escape(commit.author)}`
    };

    let message = {
      username: event.source.name,
      icon_url: event.source.avatar,
      text,
      attachments: [{
        color: event.forced ? "danger" : "good",
        text: event.commits.map(textify).join("\n"),
        mrkdwn_in: ["text"],
      }]
    };

    this.sendEvent(message, event.type, event.subtype, event.branch.name)
  }

  sendMessage(channel, message) {
    let options = Object.assign({
      username: this.name,
      as_user: false,
      icon_url: `http://${config.hostname}:${config.port}/static/bot.png`
    }, message);

    let text = options.text;
    delete options.text;

    if ("attachments" in options) {
      options.attachments = JSON.stringify(options.attachments);
    }

    this.webClient.chat.postMessage(channel.id, text, options, function(err, response) {
      if (err) {
        console.error(err);
      } else if (response && !response.ok) {
        console.error(response);
      }
    });
  }

  onConnected(rtmData) {
    this.id = rtmData.self.id;
    this.name = rtmData.self.name;

    let allChannels = rtmData.channels.concat(rtmData.groups, rtmData.ims);
    for (let channel of allChannels) {
      if ("is_member" in channel && !channel.is_member) {
        continue;
      }

      this.channels.set(channel.id, channel);
    }

    for (let user of rtmData.users) {
      this.users.set(user.id, user);
    }
  }

  onDisconnected() {
    this.channels.clear();
  }

  onChannelJoined({ channel }) {
    this.channels.set(channel.id, channel);
  }

  onChannelLeft({ channel: channelId }) {
    this.channels.delete(channelId);
  }

  onDirectMessage(channel, message, text) {
    let respond = (text, attachments) => {
      if (!channel.is_im) {
        text = `<@${message.user}>: ${text}`;
      }

      this.sendMessage(channel, { text, attachments });
    };

    let response = "Sorry, I don't understand.";
    if (text == "") {
      respond("What?");
      return;
    }

    let params = splitargs(text.trim(), null, true);
    let cmd = params.shift();
    if (!(cmd in Commands)) {
      respond("Sorry, I don't understand.");
      return;
    }

    try {
      runCommand(this, cmd, { channel, user: this.users.get(message.user), respond, params });
      return;
    }
    catch (e) {
      respond(e + "\n" + e.stack);
    }
  }

  onMessage(message) {
    if (message.subtype || message.attachments) {
      return;
    }

    let channel = this.channels.get(message.channel);
    if (message.text.startsWith(`<@${this.id}>`)) {
      let text = message.text.substring(this.id.length + 3);
      if (text.startsWith(":")) {
        text = text.substring(1);
      }
      this.onDirectMessage(channel, message, text);
      return;
    }

    if (channel.is_im) {
      this.onDirectMessage(channel, message, message.text);
      return;
    }
  }

  onNewUser({ user }) {
    this.users.set(user.id, user);
  }

  onDestroy() {
    this.client.disconnect();
  }
}

export default Bot;
