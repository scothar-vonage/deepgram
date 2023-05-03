"use strict";

import { v4 as uuidv4 } from "uuid";
import express from "express";
import bp from "body-parser";
const { json } = bp;

import pkg from "@deepgram/sdk";
const { Deepgram } = pkg;

import decodeAudio from "audio-decode";
import AudioBuffer from "audio-buffer";

import expressWsFactory from "express-ws";
import dotenv from "dotenv";
dotenv.config();

const silenceThreshold = 0.09; // Adjust this based on testing

const app = express();
const expressWs = expressWsFactory(app);

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

//Actively listen to the socket and get a transcript
let listening = false;
let listenStart = null;
let listenDuration;
let silenceStart = null;
let silenceDuration = 1000; // Duration of silence in milliseconds

//Deepgram event handlers configured?
let deepgramHandlers = false;

let utterance_db = [];
let transcript_result = [];
let transcript_interim = "";
let uniqueId = "";

let dgs = null;

const url = process.env.DOMAIN;

app.use(json());

app.get("/transcripts", (req, res) => {
  if (utterance_db.length > 0) {
    return res.send(utterance_db);
  } else {
    return res.send("not found");
  }
});

app.get("/transcripts/id/:transcriptId", (req, res) => {
  const id = req.params.transcriptId;

  if (utterance_db.length > 0) {
    const rec = utterance_db.find((item) => item.key === id);

    if (rec) {
      console.log(`Found ${rec.key}`);
      const t = { transcriptId: rec.key, transcript: rec.transcript };
      return res.send(t);
    } else {
      return res.send(`TranscriptId ${id} not found`);
    }
  } else {
    return res.send(`TranscriptId ${id} not found`);
  }
});

app.get("/input", (req, res) => {
  listening = true;
  listenStart = new Date().getTime();
  listenDuration = req.query.timeout;
  silenceDuration = req.query.max_silence;

  uniqueId = "U" + generateUniqueId().replace(/-/g, "");
  const ret = {
    utterance_id: uniqueId,
  };

  createDgsSocket();

  console.log(
    `Starting listening for ID: ${uniqueId} for ${listenDuration}ms and silence of ${silenceDuration}ms`
  );
  res.status(200).json(ret);
});

app.get("/answer", (req, res) => {
  let nccoResponse = [
    {
      action: "talk",
      text: "How can I help you?",
    },
    {
      action: "connect",
      from: "NexmoTest",
      endpoint: [
        {
          type: "websocket",
          uri: `wss://${url}/socket`,
          "content-type": "audio/l16;rate=16000",
        },
      ],
    },
  ];

  res.status(200).json(nccoResponse);
});

app.post("/events", (req, res) => {
  console.log(req.body);
  res.send(200);
});

expressWs.getWss().on("connection", function (ws) {
  console.log("Websocket connection is open");
});

app.ws("/socket", (ws, req) => {
  try {
    ws.on("message", (msg) => {
      const currentTime = new Date().getTime();
      if (listening && deepgramHandlers) {
        //Timeout
        if (currentTime - listenStart > listenDuration) {
          console.log("Listen timeout expired.");
          stopListening();
        } else {
          processMedia(msg);

          if (dgs && dgs.getReadyState() == 1) {
            dgs.send(msg);
          } else {
            if (listening) {
              stopListening();
            }

            console.error("Deepgram socket not ready");
          }
        }
      }
    });
  } catch (e) {
    console.log(e);
  }
});

const port = 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));

function createDgsSocket() {
  try {
    console.log("Creating Deepgram Socket connection.");
    dgs = deepgram.transcription.live({
      punctuate: false,
      interim_results: true,
      encoding: "linear16",
      sample_rate: 16000,
      numerals: true,
      endpointing: false,
    });
  } catch (e) {
    console.log(e);
  }

  addDeepgramListeners();
}

function addDeepgramListeners() {
  if (deepgramHandlers || !listening) {
    return;
  }

  dgs.addListener("open", () => {
    console.log("deepgramSocket opened!");
    deepgramHandlers = true;
  });

  dgs.addListener("transcriptReceived", (transcription) => {
    console.log("Got a dgs message");
    try {
      const received = JSON.parse(transcription);

      if (received.channel) {
        const transcript = received.channel.alternatives[0].transcript;
        if (transcript) {
          transcript_interim = transcript;
          console.log(`Interim transcript: ${transcript_interim}`);

          if (received.is_final) {
            console.log("Adding complete part of transcript");
            transcript_result.push(transcript);
            transcript_interim = "";
            console.log(transcript_result);
          }
        } else {
          console.log(`Empty transcript?\n${transcription}`);
        }
      } else {
        console.log(`Non-transcript message: ${transcription}`);
      }
    } catch (e) {
      console.log(e);
      console.log(transcription);
    }
  });

  dgs.addListener("close", () => {
    console.log("Deepgram socket closed");
    console.log(transcript_result, transcript_interim);
    stopListening();

    deepgramHandlers = false;
  });
}
function processMedia(msg) {
  const audioBuffer = new AudioBuffer({
    numberOfChannels: 1,
    length: msg.length / 2,
    sampleRate: 16000,
  });

  const int16Array = new Int16Array(msg.buffer);
  for (let i = 0; i < int16Array.length; i++) {
    audioBuffer.getChannelData(0)[i] = int16Array[i] / 32768; // Normalize the sample to the range of -1 to 1
  }
  // Calculate the volume
  const volume = calculateVolume(audioBuffer);

  // Detect silence
  if (volume < silenceThreshold) {
    if (silenceStart === null) {
      silenceStart = new Date().getTime();
    } else {
      const currentTime = new Date().getTime();
      if (currentTime - silenceStart > silenceDuration) {
        console.log("Detected silence. Stopping listen action");
        stopListening();
      }
    }
  } else {
    silenceStart = null;
  }
}

function calculateVolume(audioBuffer) {
  const samples = audioBuffer.getChannelData(0);
  let sum = 0;

  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }

  const rms = Math.sqrt(sum / samples.length);
  return rms;
}

function generateUniqueId() {
  return uuidv4();
}

function stopListening() {
  console.log("Stop Listening");

  if (transcript_interim.length > 0) {
    transcript_result.push(transcript_interim);
  }

  const transcript_string = transcript_result.toString();
  if (transcript_result.length > 0) {
    console.log(`Final Transcript:\n${transcript_string}`);
    if (uniqueId && uniqueId.length > 0) {
      const k = { key: uniqueId, transcript: transcript_string };
      utterance_db.push(k);
    }
  }
  console.log(utterance_db);

  listening = false;
  listenStart = null;
  listenDuration = 1000;
  silenceStart = null;
  transcript_result = [];
  transcript_interim = "";
  uniqueId = "";
  dgs = null;
  deepgramHandlers = false;
}
