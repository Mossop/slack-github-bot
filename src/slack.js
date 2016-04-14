import { RtmClient as Client, WebClient, CLIENT_EVENTS, RTM_EVENTS } from "slack-client";

const EVENT_MAP = {
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

class Bot {
  constructor(token, events) {
    this.token = token;
    this.channels = new Map();

    for (let event of ["destroy"]) {
      let name = "on" + event.charAt(0).toUpperCase() + event.substring(1);
      events.on(event, this[name].bind(this));
    }

    this.client = new Client(token);
    this.webClient = new WebClient(token);

    for (let event of Object.keys(EVENT_MAP)) {
      this.client.on(event, this[EVENT_MAP[event]].bind(this));
    }

    this.client.start({ no_unreads: true });
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
    text = text.trim();
    let target = "";
    if (!channel.is_im) {
      target = `<@${message.user}>: `;
    }
    let response = text;
    this.sendMessage(channel, target + response);
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
