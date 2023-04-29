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
let listen = false;
let listenStart = null;
let listenDuration;
let silenceStart = null;
let silenceDuration = 1000; // Duration of silence in milliseconds

let db = [];

//your ngrok domain name
const url = process.env.DOMAIN;

app.use(json());
app.get("/input", (req, res) => {
  listen = true;
  listenStart = new Date().getTime();
  listenDuration = req.query.timeout;
  silenceDuration = req.query.max_silence;

  const uniqueId = generateUniqueId().replace(/-/g, "");
  const ret = {
    message: "success",
    listen_id: uniqueId,
  };

  console.log(
    `Starting listening for ${uniqueId} for ${listenDuration} and silence of ${silenceDuration}`
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
    const dgs = deepgram.transcription.live({
      punctuate: true,
      encoding: "linear16",
      sample_rate: 16000,
    });

    dgs.addListener("open", () => {
      console.log("deepgramSocket opened!");

      ws.on("message", (msg) => {
        const currentTime = new Date().getTime();

        if (listen) {
          if (currentTime - listenStart > listenDuration) {
            console.log("Listen timeout expired.");
            stopListening();
          }

          processMedia(msg);
          if (dgs.getReadyState() == 1) {
            dgs.send(msg);
          } else {
            console.error(
              "Deepgram socket not ready. State: ",
              dgs.getReadyState()
            );
          }
        }
      });
    });

    dgs.addListener("transcriptReceived", (transcription) => {
      console.log("Got a dgs message");
      const received = JSON.parse(transcription);
      try {
        const transcript = received.channel.alternatives[0].transcript;
        if (transcript && received.is_final) {
          console.log(transcript);
        }
      } catch (e) {
        console.log(e);
        console.log(transcription);
      }
    });
  } catch (e) {
    console.log(e);
  }
});

const port = 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));

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
  listen = false;
  silenceStart = null;
  listenStart = null;
  listenDuration = 1000;
}
