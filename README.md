# Overview
Websocket integration to deepgram. This project assumes that:
   1. You have a Deepgram API Key. You can get one [here](https://developers.deepgram.com/), if you don't.
   1. You have a Vonage number
   1. The application connected to your Vonage has the `Answer` and `Event` webhooks pointed to whereever you're going to run this code.


# Installation
1. Clone this repository to your local machine
1. `cd` into your working directory
1. Run `npm install`

# Configuration

```
$ cp .env.sample .env
```

Configure the `.env` file for your environment

```
DEEPGRAM_API_KEY=****************************************
DOMAIN=some.example.com
```

# Run
To start the server, make sure you're in the project's root directory (e.g., `~/home/workspace/deepgram/`) and type:

```
npm run dev
```

1. Place a call into your Vonage number. 
1. Once the call is established, open a browser (or Postman, or curl, or whatever) and send a `GET` request to your server:

``` 
curl localhost:3000/input/?timeout=5000&max_silence=2000
```

Parameter | Description
--- | --- |
timeout|The time in milliseconds to listen for a response
max_silence | Maximum time in milliseconds of silence before returning









