import request from "request";
import config from "../config";

const GITHUB = {
  name: "GitHub",
  url: "https://github.com",
  avatar: `http://${config.hostname}:${config.port}/static/github.png`,
}

const CI = {
  "appveyor": {
    name: "AppVeyor CI",
    url: "https://www.appveyor.com",
    avatar: `http://${config.hostname}:${config.port}/static/appveyor.png`,
  },
  "travis-ci": {
    name: "Travis CI",
    url: "https://travis-ci.org",
    avatar: `http://${config.hostname}:${config.port}/static/travisci.png`,
  },
};

function promiseRequest(opts) {
  opts = Object.assign({
    headers: {
      "User-Agent": "Mossop/slack-github-bot"
    },
  }, opts);

  return new Promise((resolve, reject) => {
    request(opts, (err, response, body) => {
      if (err) {
        reject(err);
        return;
      }
      if (response.statusCode != 200) {
        reject(response.statusMessage);
      }
      resolve({ response, body });
    });
  });
}

async function fetchSender(info) {
  let { body } = await promiseRequest({ url: info.url });

  let sender = JSON.parse(body);
  return {
    name: sender.login,
    avatar: sender.avatar_url,
    fullname: sender.name,
  };
}

export async function fetchIssue(repo, number) {
  let { body } = await promiseRequest({
    url: `https://api.github.com/repos/${repo}/issues/${number}`,
  });

  let data = JSON.parse(body);
  if ("pull_request" in data) {
    throw new Error("This is a pull request.");
  }
  return data;
}

export async function fetchPullRequest(repo, number) {
  let { body } = await promiseRequest({
    url: `https://api.github.com/repos/${repo}/pulls/${number}`,
  });

  return JSON.parse(body);
}

function makeRepository(repository) {
  return {
    id: repository.full_name,
    fullname: repository.full_name,
    name: repository.name,
    url: repository.html_url,
  };
}

class Github {
  constructor(events) {
    this.events = events;
    this.events.on("http", (data) => {
      if (data.path == "/github") {
        this.parseEvent(data);
      }
    });

    this.lastState = new Map();
  }

  emit(event) {
    this.events.emit(event.path[0], event);
  }

  async parseIssueEvent(data) {
    this.events.emit("log", "github", "issue", data.action, data.issue.number);

    if (data.action != "opened" && data.action != "closed" && data.action != "reopened") {
      return;
    }

    let event = {
      path: ["issue", data.action, data.issue.number],
      url: data.issue.html_url,
      issue: {
        name: data.issue.number,
        url: data.issue.html_url,
        title: data.issue.title,
        state: data.issue.state,
      },
      repository: makeRepository(data.repository),
      sender: await fetchSender(data.sender),
      source: GITHUB,
    };

    this.emit(event);
  }

  async parsePREvent(data) {
    this.events.emit("log", "github", "pullrequest", data.action, data.pull_request.number);

    if (data.action != "opened" && data.action != "closed" && data.action != "reopened") {
      return;
    }

    let event = {
      path: ["pullrequest", data.action, data.pull_request.number],
      url: data.pull_request.html_url,
      pullrequest: {
        name: data.pull_request.number,
        url: data.pull_request.html_url,
        title: data.pull_request.title,
        state: data.pull_request.state,
      },
      repository: makeRepository(data.repository),
      sender: await fetchSender(data.sender),
      source: GITHUB,
    };

    this.emit(event);
  }

  async parsePushEvent(data) {
    this.events.emit("log", "github", "push", data.ref);

    function mungeCommit(commit) {
      return {
        id: commit.id,
        url: commit.url,
        title: commit.message,
        author: commit.author.name,
      };
    }

    let branchName = data.ref.substring("refs/heads/".length);

    let event = {
      path: ["branch", "pushed", branchName],
      forced: data.forced,
      url: data.compare,
      branch: {
        name: branchName,
      },
      commits: data.commits.map(mungeCommit),
      repository: makeRepository(data.repository),
      sender: await fetchSender(data.sender),
      source: GITHUB,
    };

    event.branch.url = `${event.repository.url}/tree/${event.branch.name}`;

    if (data.created) {
      event.path[1] = "created";
    } else if (data.deleted) {
      event.path[1] = "deleted";
    }

    this.emit(event);
  }

  async parseStatusEvent(data) {
    this.events.emit("log", "github", "status", data.state, data.context);
    if (data.state == "error") {
      data.state = "failure";
    }
    if (data.state != "success" && data.state != "failure") {
      return;
    }

    let context = data.context.split("/");
    if (context.length != 3 || context[0] != "continuous-integration") {
      return;
    }

    if (!(context[1] in CI)) {
      return;
    }

    let event = {
      path: ["build", data.state],
      state: data.state,
      result: data.description,
      url: data.target_url,
      commits: [{
        id: data.commit.sha,
        url: data.commit.html_url,
        title: data.commit.commit.message,
        author: data.commit.commit.author.name,
      }],
      repository: makeRepository(data.repository),
      source: CI[context[1]],
    };

    let id = undefined;
    let type = context[2];
    if (type == "pr") {
      type = "pullrequest";
      // No sane way to get the pull request number from this event :(
      // id = "1";
      return;
    } else if (type == "push") {
      type = "branch";
    } else if (type != "branch") {
      return;
    }

    if (type == "branch") {
      id = data.branches[0].name;
      event.branch = {
        name: id,
        url: `${event.repository.url}/tree/${id}`
      }
    }

    event.path.push(type, id);

    this.emit(event);

    let key = `${context[1]}-${type}-${id}`;
    let lastState = this.lastState.get(key) || "success";
    if (lastState != data.state) {
      event.path[1] = "changed";
      this.emit(event);
    }

    this.lastState.set(key, data.state);
  }

  async parseEvent({ headers, body }) {
    try {
      let data = JSON.parse(body);
      let event = headers["x-github-event"];

      switch (event) {
        case "issues":
          await this.parseIssueEvent(data);
          break;
        case "pull_request":
          await this.parsePREvent(data);
          break;
        case "push":
          await this.parsePushEvent(data);
          break;
        case "status":
          await this.parseStatusEvent(data);
          break;
        default:
          this.events.emit("log", "github", event);
      }
    }
    catch (e) {
      this.events.emit("error", e, e.stack);
    }
  }
}

export default Github;
