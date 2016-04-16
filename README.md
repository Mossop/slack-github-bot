# slack-github-bot
A helpful bot for monitoring github project development

## Configuration
Create a config.json that looks like this:

    {
      "port": <IP port>,
      "uuid": "<A private ID, any string>",
      "slack_token": "<slack API token>",
      "owner": "<a username that has full access to the bot>"
    }

Point GitHub's webhook to:

    http://<your server>:<your port>/<your uuid>/github

Point AppVeyor's webhook to:

    http://<your server>:<your port>/<your uuid>/appveyor

Point Travis CI's webhook to:

    http://<your server>:<your port>/<your uuid>/travis

## Running

Start the bot server:

    npm start

Stop the bot server:

    npm stop

## Usage

Say help to the bot!
