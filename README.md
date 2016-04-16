# slack-github-bot
A helpful bot for monitoring github project development

## Configuration
Create a config.json that looks like this:

    {
      "hostname" "<hostname>",
      "port": <IP port>,
      "uuid": "<A private ID, any string>",
      "slack_token": "<slack API token>",
      "owner": "<a username that has full access to the bot>"
    }

Point GitHub's webhook to:

    http://<your server>:<your port>/<your uuid>/github

## Running

Start the bot server:

    npm start

Stop the bot server:

    npm stop

## Usage

Say help to the bot!
