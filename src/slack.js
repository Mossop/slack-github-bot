import { RtmClient as Client, WebClient, CLIENT_EVENTS, RTM_EVENTS } from "slack-client";
import splitargs from "splitargs";

import { isActionEnabledForChannel, setActionEnabledForChannel, setConfig, getConfig } from "./config";

const SLACK_EVENT_MAP = {
  [CLIENT_EVENTS.RTM.AUTHENTICATED]: "onConnected",
  [CLIENT_EVENTS.RTM.WS_CLOSE]: "onDisconnected",
  [RTM_EVENTS.CHANNEL_JOINED]: "onChannelJoined",
  [RTM_EVENTS.GROUP_JOINED]: "onChannelJoined",
  [RTM_EVENTS.IM_CREATED]: "onChannelJoined",
  [RTM_EVENTS.CHANNEL_LEFT]: "onChannelLeft",
  [RTM_EVENTS.GROUP_LEFT]: "onChannelLeft",
  [RTM_EVENTS.IM_CLOSE]: "onChannelLeft",
  [RTM_EVENTS.MESSAGE]: "onMessage",
};

const REPO_EVENT_MAP = {
  "pullrequest": "onPullRequestEvent",
  "issue": "onIssueEvent",
  "push": "onPushEvent",
};

const Commands = {
  "help": {
    info: "List commands for this bot.",
    run({ params, respond }) {
      if (params.length > 1) {
        respond("Usage: help <command>");
        return;
      } else if (params.length == 1) {
        if (params[0] in Commands) {
          let command = Commands[params[0]];
          let response = command.info;
          if (command.usage) {
            response += "\n" + command.usage;
          }
          respond(response);
        } else {
          respond("Unknown command");
        }
      } else {
        let response = "Here are the commands I support:";
        for (let name of Object.keys(Commands)) {
          response += "\n" + name + ": " + Commands[name].info;
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
    usage: "set-config <path> <value>",
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
    usage: "get-config <path>",
    info: "Gets a configuration entry.",
    validate({ params }) {
      return params.length <= 1;
    },
    run({ params, respond }) {
      let name = params.length ? params[0] : "";
      respond(JSON.stringify(getConfig(name, undefined)));
    }
  }
}

function runCommand(bot, command, args) {
  let commandObj = Commands[command];
  if ("validate" in commandObj && !commandObj.validate.call(bot, args)) {
    runCommand(bot, "help", [command]);
    return;
  }
  commandObj.run.call(bot, args);
}

class Bot {
  constructor(token, events) {
    this.token = token;
    this.channels = new Map();
    this.events = events;

    for (let event of ["destroy"]) {
      let name = "on" + event.charAt(0).toUpperCase() + event.substring(1);
      events.on(event, this[name].bind(this));
    }

    this.client = new Client(token);
    this.webClient = new WebClient(token);

    for (let event of Object.keys(SLACK_EVENT_MAP)) {
      this.client.on(event, this[SLACK_EVENT_MAP[event]].bind(this));
    }

    for (let event of Object.keys(REPO_EVENT_MAP)) {
      this.events.on(event, this[REPO_EVENT_MAP[event]].bind(this));
    }

    this.client.start({ no_unreads: true });
  }

  onPullRequestEvent(event) {
  }

  onIssueEvent(event) {
  }

  onPushEvent(event) {
  }

  sendMessage(channel, text) {
    this.webClient.chat.postMessage(channel.id, text);
  }

  onConnected(rtmData) {
    this.id = rtmData.self.id;

    let allChannels = rtmData.channels.concat(rtmData.groups, rtmData.ims);
    for (let channel of allChannels) {
      if ("is_member" in channel && !channel.is_member) {
        continue;
      }

      this.channels.set(channel.id, channel);
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
    let respond = (text) => {
      if (!channel.is_im) {
        text = `<@${message.user}>: ${text}`;
      }

      this.sendMessage(channel, text);
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
      runCommand(this, cmd, { respond, params });
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

  onDestroy() {
    this.client.disconnect();
  }
}

export default Bot;
