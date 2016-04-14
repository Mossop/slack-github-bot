import request from "request";

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
          username: sender.login,
          avatar: sender.avatar_url,
          name: sender.name,
        })
      }
      catch (e) {
        reject(e);
      }
    });
  });
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
      event: data.action,
      url: data.issue.html_url,
      issue: {
        id: data.issue.number,
        url: data.issue.html_url,
        title: data.issue.title,
        state: data.issue.state,
      },
      repository: {
        id: data.repository.full_name,
        name: data.repository.name,
        url: data.repository.html_url,
      },
      sender: await fetchSender(data.sender),
    };

    this.events.emit("issue", event);
  }

  async parsePREvent(data) {
    if (data.action != "opened" && data.action != "closed" && data.action != "reopened") {
      return;
    }

    let event = {
      event: data.action,
      url: data.pull_request.html_url,
      pullrequest: {
        id: data.pull_request.number,
        url: data.pull_request.html_url,
        title: data.pull_request.title,
        state: data.pull_request.state,
      },
      repository: {
        id: data.repository.full_name,
        name: data.repository.name,
        url: data.repository.html_url,
      },
      sender: await fetchSender(data.sender),
    };

    this.events.emit("pullrequest", event);
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
      url: data.compare,
      commits: data.commits.map(mungeCommit),
      repository: {
        id: data.repository.full_name,
        name: data.repository.name,
        url: data.repository.html_url,
      },
      sender: await fetchSender(data.sender),
    };

    this.events.emit("push", event);
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
