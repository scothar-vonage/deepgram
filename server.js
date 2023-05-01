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

let db = [];

//your ngrok domain name
const url = process.env.DOMAIN;

app.use(json());
app.get("/input", (req, res) => {
  listening = true;
  listenStart = new Date().getTime();
  listenDuration = req.query.timeout;
  silenceDuration = req.query.max_silence;

  const uniqueId = "U" + generateUniqueId().replace(/-/g, "");
  const ret = {
    utterance_id: uniqueId,
  };

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
  let dgs;

  try {
    dgs = deepgram.transcription.live({
      punctuate: true,
      interim_results: false,
      encoding: "linear16",
      sample_rate: 16000,
      numerals: true,
      endpointing: false,
    });

    dgs.addListener("open", () => {
      console.log("deepgramSocket opened!");
    });

    ws.on("message", (msg) => {
      const currentTime = new Date().getTime();

      if (listening) {
        //Timeout
        if (currentTime - listenStart > listenDuration) {
          console.log("Listen timeout expired.");
          stopListening();
        } else {
          processMedia(msg);

          if (dgs.getReadyState() == 1) {
            dgs.send(msg);
          } else {
            if (listening) {
              stopListening();
            }
            console.error(
              "Deepgram socket not ready. State: ",
              dgs.getReadyState()
            );
          }
        }
      }
    });

    dgs.addListener("transcriptReceived", (transcription) => {
      console.log("Got a dgs message");
      try {
        const received = JSON.parse(transcription);

        if (received.is_final && received.channel) {
          const transcript = received.channel.alternatives[0].transcript;
          if (transcript) {
            
            console.log(transcript);
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
      if (!ws) {
        return;
      }
      stopListening();
      console.log("***********Connection closed. Reopening***********");
      dgs = deepgram.transcription.live({
        punctuate: true,
        interim_results: false,
        encoding: "linear16",
        sample_rate: 16000,
      });
    });
  } catch (e) {
    console.log(e);
  }
});

const port = 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));

function processMedia(msg) {
  if (true) {
    return;
  }

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
  listening = false;
  listenStart = null;
  listenDuration = 1000;
  silenceStart = null;
}
