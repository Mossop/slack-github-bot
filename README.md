# slack-github-bot
A helpful bot for monitoring github project development

## Configuration
The bot expects to see certain configuration settings in environment variables (You can set these in Heroku's settings)

OWNER: A username that has full access to the bot
REPO: Repository for looking up issues and pull requests
SLACK_TOKEN: A Slack API token
UUID: A secret key for the bot

Point GitHub's webhook to:

    http://<your server>:<your port>/<your uuid>/github

## Running

Start the bot server:

    npm start

Stop the bot server:

    npm stop

## Usage

Say help to the bot!
