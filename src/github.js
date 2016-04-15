import request from "request";

const GITHUB = {
  name: "GitHub",
  url: "https://github.com",
  avatar: "",
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

  async parseIssueEvent(data) {
    if (data.action != "opened" && data.action != "closed" && data.action != "reopened") {
      return;
    }

    let event = {
      type: "issue",
      subtype: data.action,
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

    this.events.emit(event.type, event);
  }

  async parsePREvent(data) {
    if (data.action != "opened" && data.action != "closed" && data.action != "reopened") {
      return;
    }

    let event = {
      type: "pullrequest",
      subtype: data.action,
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

    this.events.emit(event.type, event);
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

    let event = {
      type: "push",
      url: data.compare,
      commits: data.commits.map(mungeCommit),
      repository: makeRepository(data.repository),
      sender: await fetchSender(data.sender),
      source: GITHUB,
    };

    this.events.emit(event.type, event);
  }

  async parseEvent({ headers, body }) {
    try {
      let data = JSON.parse(body);
      let event = headers["x-github-event"];

      switch (event) {
        case "issues":
          await this.parseIssueEvent(data);
          break;
        case "pull-request":
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
