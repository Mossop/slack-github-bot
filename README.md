# slack-github-bot
A helpful bot for monitoring github project development

## Configuration
Create a tokens.json that looks like this:

    {
      "UUID": "<A private ID, any string>",
      "SLACK_TOKEN": "<slack API token>"
    }

Change `config.json` to suit your needs.`map-port` attempts to map the external
port of your UPNP router.

Point GitHub's webhook to:

    http://<your server>:<your port>/<your uuid>/github

Point AppVeyor's webhook to:

    http://<your server>:<your port>/<your uuid>/appveyor

Point Travis CI's webhook to:

    http://<your server>:<your port>/<your uuid>/travis
