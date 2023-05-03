# Overview
This is a websocket integration to Deepgram. The basic operation is that this code will create the connection to Deepgram when a call is answered. After that, you can start transcribing by calling the `input` endpoint, and then fetch the transcription by calling the `transcriptions` endpoint. You can call `input` multiple times on the same call--this allows you to create an IVR-like application with multiple steps which collect speech, without streaming everything to Deepgram.

After each transcription is complete, it is read back to the caller via TTS.


This project assumes that:
   1. You have a Deepgram API Key. You can get one [here](https://developers.deepgram.com/), if you don't.
   1. You have a Vonage number
   1. The application connected to your Vonage number has the `Answer` and `Event` webhooks pointed to wherever you're going to run this code.


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

# Start Transcribing

The server doesn't start streaming media to Deepgram until you tell it to. Once a call is established, you can begin the transcription by calling the `input` web service, as follows:

## HTTP GET Request

``` 
curl localhost:3000/input/?timeout=5000&max_silence=2000
```

Parameter | Description
--- | --- |
timeout|The time in milliseconds to listen for a response
max_silence | Maximum time in milliseconds of silence before returning

### Returns
The `input` service will return an object with the `transcript_id` that you can use later to fetch the transcript.

```
{"transcript_id":"T9ff95ea45e634017930afe2387114199"}
```

# Fetch Transcriptions

To fetch a single transcription, make an HTTP GET Request like this:

```
https://example.com/transcripts/id/T9ff95ea45e634017930afe2387114199
```

The response will look like this:
```
{"transcriptId":"T9ff95ea45e634017930afe2387114199","transcript":"I would like to confirm my appointment"}
```

# Fetch all Transcriptions

```
https://example.com/transcripts
```

The response will be an array of transcription objects:

```
[{"transcriptId":"T9ff95ea45e634017930afe2387114199","transcript":"I would like to confirm my appointment"}, {"transcriptId":"T5099fcba8a7043439474e22fb6933225","transcript":"Cancel my appointment"},
{"transcriptId":"Tcbbe21685f70455984b9690a8a9767c6","transcript":"I need to reschedule"}]

```





