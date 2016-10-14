import { RtmClient as Client, WebClient, CLIENT_EVENTS, RTM_EVENTS } from "@slack/client";
import splitargs from "splitargs";

import { getConfigForPath, setConfigForPath, getConfigForPathPrefix } from "./config";
import { fetchPullRequest, fetchIssue } from "./github";

let realport = "";
if ("REALPORT" in process.env) {
  realport = `:${process.env.REALPORT}`
}

const LOG_LENGTH = 1000;

const url_regex = /\bhttp(?:s)?:\/\/github.com\/(\w+\/\w+)\/(pull|issues)\/(\d+)\b/g;
const lookup_regex = /\b(issue|pull request|pr|pull) (\d+)\b/g;
const id_regex = /(?:\s|^)#(\d+)\b/g;

function escape(text) {
  return text.replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;");
}

function firstline(text) {
  return text.split("\n")[0];
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
  "build": "onBuildEvent",
};

function formatCommit(commit) {
  return `\`<${escape(commit.url)}|${escape(commit.id.substring(0, 8))}>\` ${escape(firstline(commit.title))} - ${escape(commit.author)}`;
}

function formatPullRequest(pr) {
  let text = `Pull request #${pr.number}: <${pr.html_url}|${pr.title}>`;
  if (pr.state == "closed") {
    text += " (Closed)";
  }
  return text;
}

function formatIssue(issue) {
  let text = `Issue #${issue.number}: <${issue.html_url}|${issue.title}>`;
  if (issue.state == "closed") {
    text += " (Closed)";
  }
  return text;
}

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
            response += `\nUsage: \`${escape(params[0])} ${escape(command.usage)}\``;
          }
          respond(response);
        } else {
          respond("Unknown command");
        }
      } else {
        let response = "Here are the commands I support:";
        for (let name of Object.keys(Commands)) {
          let command = Commands[name];
          if (command.restricted && !isAdmin(process.env.OWNER, user, channel)) {
            continue;
          }
          response += "\n" + name + ": " + escape(firstline(command.info));
        }
        respond(response);
      }
    }
  },

  "pull": {
    info: "Show a pull request.",
    usage: "<#xx>",
    validate({ params }) {
      return params.length == 1;
    },
    async run({ params, respond }) {
      let number = params[0];
      if (number.startsWith("#")) {
        number = number.substring(1);
      }

      try {
        let pr = await fetchPullRequest(process.env.REPO, number);
        respond(formatPullRequest(pr));
      }
      catch (e) {
        respond(`Error looking up pull request.`);
      }
    }
  },

  "issue": {
    info: "Show an issue.",
    usage: "<#xx>",
    validate({ params }) {
      return params.length == 1;
    },
    async run({ params, respond }) {
      let number = params[0];
      if (number.startsWith("#")) {
        number = number.substring(1);
      }

      try {
        let issue = await fetchIssue(process.env.REPO, number);
        respond(formatIssue(issue));
      }
      catch (e) {
        respond(`Error looking up issue.`);
      }
    }
  },

  "shutdown": {
    restricted: true,
    info: "Shuts down this bot.",
    run({ params, respond }) {
      respond("Bye.");
      this.events.emit("destroy");
    }
  },

  "events": {
    restricted: true,
    usage: "<...path> <on/off/default>",
    info: `Control reporting of events to this channel.
The path filters events. The more parts of the path you include the more specific the rule.
Useful paths:
\`branch <org> <repo> <pushed/created/deleted> <branch name>\`
\`issue <org> <repo> <opened/closed/reopened>\`
\`pullrequest <org> <repo> <opened/closed/reopened>\`
\`build <org> <repo> <success/failure/changed> <branch/pullrequest> <id>\``,
    async run(args) {
      const { channel, params, respond } = args;

      let targetChannel = channel;
      if (params.length && params[0].startsWith("<#") && params[0].endsWith(">")) {
        const id = params[0].substring(2, params[0].length - 1);
        targetChannel = this.getChannel(id);
        if (!targetChannel) {
          respond("Unknown channel id - " + id + ".");
          return;
        }

        params.shift();
      } else if (params.length && params[0].startsWith("#")) {
        const name = params[0].substring(1, params[0].length);
        targetChannel = this.getChannel(name);
        if (!targetChannel) {
          respond("Unknown channel name - " + name + ".");
          return;
        }

        params.shift();
      }

      if (params.length) {
        let enabled = params.pop();
        if (enabled == "default") {
          enabled = undefined;
        } else if (enabled == "on") {
          enabled = true;
        } else if (enabled == "off") {
          enabled = false;
        } else {
          args.params = ["events"];
          runCommand(this, "help", args);
          return;
        }

        if (enabled === undefined) {
          await setConfigForPath([targetChannel.id, ...params], undefined);
        } else {
          await setConfigForPath([targetChannel.id, ...params], { enabled });
        }

        respond("Ok.");
      } else {
        let configs = await getConfigForPathPrefix([targetChannel.id]);
        let paths = configs.map((c) => {
          let p = c.path.slice(1);
          p.push(c.enabled ? "on" : "off")
          return p;
        })
        respond("Event settings:\n" + paths.map(p => "`" + p.join(" ") + "`").join("\n"));
      }
    }
  },

  "test": {
    usage: "<...path>",
    info: "Test whether events will be reported to this channel.",
    async run({ channel, params, respond }) {
      let config = await getConfigForPath([channel.id, ...params]);
      let result = config ? config.enabled : false;
      respond(result ? "on" : "off");
    }
  },

  "log": {
    restricted: true,
    usage: "<count>",
    info: "Show the most recent log entries.",
    validate({ params }) {
      return params.length <= 1;
    },
    run({ params, respond }) {
      let count = this.log.length;
      if (params.length) {
        count = Math.min(parseInt(params[0]), count);
      }

      if (count == 0) {
        respond("No log messages.");
      }
      else {
        let messages = this.log.slice(0, count).map(m => "`" + m.join(" ") + "`");
        messages.reverse();
        respond(messages.join("\n"));
      }
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

  return user.name == process.env.OWNER;
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

function safeCallback(self, func) {
  return function(...args) {
    try {
      func(...args);
    }
    catch (e) {
      self.events.emit("error", e, e.stack);
    }
  }
}

class Bot {
  constructor(events) {
    this.channels = new Map();
    this.users = new Map();
    this.events = events;
    this.log = [];

    for (let event of ["destroy"]) {
      let name = "on" + event.charAt(0).toUpperCase() + event.substring(1);
      events.on(event, this[name].bind(this));
    }

    events.on("log", this.appendLog.bind(this, "log"));
    events.on("error", this.appendLog.bind(this, "error"));

    this.client = new Client(process.env.SLACK_TOKEN);
    this.webClient = new WebClient(process.env.SLACK_TOKEN);

    for (let event of Object.keys(SLACK_EVENT_MAP)) {
      this.client.on(event, safeCallback(this, this[SLACK_EVENT_MAP[event]].bind(this)));
    }

    for (let event of Object.keys(REPO_EVENT_MAP)) {
      this.events.on(event, safeCallback(this, this[REPO_EVENT_MAP[event]].bind(this)));
    }

    this.client.start({ no_unreads: true });
  }

  getChannel(idorname) {
    if (this.channels.has(idorname)) {
      return this.channels.get(idorname);
    }

    if (idorname.indexOf("|") >= 0) {
      idorname = idorname.substring(0, idorname.indexOf("|"));
      return this.channels.get(idorname);
    }

    for (let channel of this.channels.values()) {
      if (channel.name == idorname) {
        return channel;
      }
    }

    return undefined;
  }

  appendLog(...args) {
    this.log.unshift(args);
    while (this.log.length > LOG_LENGTH) {
      this.log.pop();
    }
  }

  async sendEvent(message, ...path) {
    this.events.emit("log", "Sending event", ...path);
    for (let channel of this.channels.values()) {
      let config = await getConfigForPath([channel.id, ...path]);
      if (config && config.enabled) {
        this.sendMessage(channel, message);
      }
    }
  }

  onPullRequestEvent(event) {
    this.events.emit("log", "Saw event", ...event.path);

    let message = {
      username: event.source.name,
      icon_url: event.source.avatar,
      text: `${escape(event.sender.fullname)} ${event.pullrequest.action} pull request ${event.pullrequest.name}.`,
      attachments: [{
        fallback: `${escape(event.pullrequest.title)} ${escape(event.pullrequest.url)}`,
        title: escape(event.pullrequest.title),
        title_link: escape(event.pullrequest.url)
      }]
    };

    this.sendEvent(message, ...event.path);
  }

  onIssueEvent(event) {
    let message = {
      username: event.source.name,
      icon_url: event.source.avatar,
      text: `${escape(event.sender.fullname)} ${event.issue.action} issue ${event.issue.name}.`,
      attachments: [{
        fallback: `${escape(event.issue.title)} ${escape(event.issue.url)}`,
        title: escape(event.issue.title),
        title_link: escape(event.issue.url)
      }]
    };

    this.sendEvent(message, ...event.path);
  }

  onBranchEvent(event) {
    this.events.emit("log", "Saw event", ...event.path);

    let text = `${escape(event.sender.fullname)} `;

    if (event.forced) {
      text += "*force* ";
    }

    text += `${event.branch.action} `;
    if (event.branch.action == "pushed") {
      text += `<${escape(event.url)}|${event.commits.length} commit`;
      if (event.commits.length != 1) {
        text += "s";
      }
      text += "> to ";
    }

    text += `branch <${escape(event.branch.url)}|${escape(event.branch.name)}>`;

    let message = {
      username: event.source.name,
      icon_url: event.source.avatar,
      text,
      attachments: [{
        fallback: text,
        color: event.forced ? "danger" : "good",
        text: event.commits.map(formatCommit).join("\n"),
        mrkdwn_in: ["text"],
      }]
    };

    this.sendEvent(message, ...event.path)
  }

  onBuildEvent(event) {
    this.events.emit("log", "Saw event", ...event.path);

    let state = event.state == "success" ? "succeeded" : "failed";

    let text = "Build of ";
    if (event.type == "pullrequest") {
      text += `pull request ${event.name} `
    } else {
      text += `branch <${event.branch.url}|${escape(event.name)}> `;
    }

    if (event.state == "success") {
      text += "succeeded.";
    } else {
      text += `failed.\n${escape(event.result)}`;
    }

    text += ` <${event.url}|See results>.\n`;

    let attachment = {
      fallback: text,
      color: event.state == "success" ? "good" : "danger",
      text,
      mrkdwn_in: ["text"],
    };

    attachment.text += event.commits.map(formatCommit).join("\n");

    let message = {
      username: event.source.name,
      icon_url: event.source.avatar,
      attachments: [attachment],
    };

    this.sendEvent(message, ...event.path);
  }

  sendMessage(channel, message) {
    let options = Object.assign({
      username: this.name,
      as_user: false,
      icon_url: `http://${process.env.HOSTNAME}${realport}/static/bot.png`
    }, message);

    let text = options.text;
    delete options.text;

    if ("attachments" in options) {
      options.attachments = JSON.stringify(options.attachments);
    }

    this.webClient.chat.postMessage(channel.id, text, options, (err, response) => {
      if (err) {
        this.events.emit("error", err);
      } else if (response && !response.ok) {
        this.events.emit("error", response);
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
    this.events.emit("log", "directmessage", ...params);

    let cmd = params.shift().toLowerCase();
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

    let maybePullRequest = (repo, number) => {
      this.events.emit("log", "lookup", "pull", repo, number);
      fetchPullRequest(repo, number).then(data => {
        this.sendMessage(channel, { text: formatPullRequest(data) });
      });
    };

    let maybeIssue = (repo, number) => {
      this.events.emit("log", "lookup", "issue", repo, number);
      fetchIssue(repo, number).then(data => {
        this.sendMessage(channel, { text: formatIssue(data) });
      });
    };

    let results;
    while ((results = url_regex.exec(message.text)) !== null) {
      let repo = results[1];
      let type = results[2];
      let number = results[3];

      if (type == "issues") {
        maybeIssue(repo, number);
      } else {
        maybePullRequest(repo, number);
      }
    }

    while ((results = lookup_regex.exec(message.text)) !== null) {
      let type = results[1];
      let number = results[2];

      if (type == "issue") {
        maybeIssue(process.env.REPO, number);
      } else {
        maybePullRequest(process.env.REPO, number);
      }
    }

    while ((results = id_regex.exec(message.text)) !== null) {
      let number = results[1];

      maybeIssue(process.env.REPO, number);
      maybePullRequest(process.env.REPO, number);
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
