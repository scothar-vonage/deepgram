"use strict";

const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const expressWs = require("express-ws")(app);
const { Deepgram } = require("@deepgram/sdk");

const silenceThreshold = 0.02; // Adjust this value based on your needs
const silenceDuration = 1000; // Duration of silence in milliseconds
require("dotenv").config();
const { decodeAudioData } = import("audio-decode");
const { default: AudioBuffer } = import("audio-buffer");

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

//Actively listen to the socket and get a transcript
let listen = false;
let silenceStart = null;
let startTime;
const url = "e165-98-37-112-87.ngrok-free.app";

app.use(bodyParser.json());
app.get("/input", (req, resp) => {});

app.get("/answer", (req, res) => {
  let nccoResponse = [
    {
      action: "talk",
      text: "Please wait while we connect you to the echo server",
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
        processMedia(msg);
        if (dgs.getReadyState() == 1) {
          dgs.send(msg);
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

async function processMedia(msg) {
  const audioBuffer = new AudioBuffer({
    numberOfChannels: 1,
    length: msg.length / 2,
    sampleRate: 16000,
  });

  // Decode Linear16 (PCM) audio data to raw audio samples
  const int16Array = new Int16Array(message.buffer);
  for (let i = 0; i < int16Array.length; i++) {
    audioBuffer.getChannelData(0)[i] = int16Array[i] / 32768; // Normalize the sample to the range of -1 to 1
  }
  // Calculate the volume of the audio samples
  const volume = calculateVolume(audioBuffer);

  // Detect silence
  if (volume < silenceThreshold) {
    if (silenceStart === null) {
      silenceStart = new Date().getTime();
    } else {
      const currentTime = new Date().getTime();
      if (currentTime - silenceStart > silenceDuration) {
        console.log("Detected silence");
        silenceStart = currentTime;
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
