import request from "request";
import config from "../config";

const GITHUB = {
  name: "GitHub",
  url: "https://github.com",
  avatar: `http://${config.hostname}:${config.port}/static/github.png`,
}

function fetchSender(info) {
  return new Promise((resolve, reject) => {
    request({
      url: info.url,
      headers: {
        "User-Agent": "Mossop/slack-github-bot"
      },
    }, function(err, response, body) {
      if (err) {
        reject(err);
        return;
      }

      try {
        let sender = JSON.parse(body);
        resolve({
          name: sender.login,
          avatar: sender.avatar_url,
          fullname: sender.name,
        })
      }
      catch (e) {
        reject(e);
      }
    });
  });
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
  }

  emit(event) {
    this.events.emit(event.path[0], event);
  }

  async parseIssueEvent(data) {
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
      }
    }
    catch (e) {
      console.error(e);
    }
  }
}

export default Github;
