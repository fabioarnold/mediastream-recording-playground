const canvas = document.getElementById("app");
const mainCtx = canvas.getContext("2d");
const slider = document.getElementById("slider");
const recordButton = document.getElementById("recordButton");
const encodeButton = document.getElementById("encodeButton");

const originalWidth = canvas.width;
const originalHeight = canvas.height;
canvas.width = window.devicePixelRatio * originalWidth;
canvas.height = window.devicePixelRatio * originalHeight;
canvas.style.width = originalWidth + "px";
canvas.style.height = originalHeight + "px";

const colors = [
  "#493c2b",
  "#be2633",
  "#e06f8b",
  "#a46422",
  "#eb8931",
  "#f7e26b",
  "#1b2632",
  "#2f484e",
  "#44891a",
  "#a3ce27",
  "#005784",
  "#31a2f2",
  "#b2dcef",
];

// t ∈ [0, 1]
function draw(ctx, t) {
  const w = canvas.width;
  const h = canvas.height;

  t *= colors.length;
  const i = Math.floor(t);
  const a = t % 1;
  const r = (a * Math.sqrt(w * w + h * h)) / 2;

  const c0 = colors[i % colors.length];
  const c1 = colors[(i + 1) % colors.length];
  const c2 = colors[(i + 2) % colors.length];

  ctx.fillStyle = c0;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = "bold 200px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = c1;
  ctx.fillText("Colors", w / 2, h / 2);

  ctx.beginPath();
  ctx.arc(w / 2, h / 2, a * r, 0, 2 * Math.PI);
  ctx.fillStyle = c1;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = c2;
  ctx.fillText("Colors", w / 2, h / 2);
  ctx.restore();
}

function drawFrameNumber(ctx, frame) {
  ctx.font = "bold 100px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#000";
  ctx.strokeText("Frame: " + frame, 10, 10);
  ctx.fillStyle = "#fff";
  ctx.fillText("Frame: " + frame, 10, 10);
}

draw(mainCtx, slider.value);

slider.oninput = () => {
  draw(mainCtx, slider.value);
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const videoCodec = "avc1.4D0034"; // Profile 77 (Main) Level 5.2
const audioCodec = "mp4a.40.2"; // MPEG-4 AAC LC

const videoTypes = [
  { ext: "mp4", mimeType: `video/mp4;codecs=${videoCodec},${audioCodec}` }, // Safari
  { ext: "webm", mimeType: `video/webm;codecs=${videoCodec},${audioCodec}` }, // Chrome
  { ext: "webm", mimeType: "video/webm;codecs=vp8,opus" }, // Firefox
];

recordButton.onclick = async () => {
  recordButton.disabled = true;
  recordButton.innerText = "Recording...";

  const fps = 60;
  const duration = 4;

  const offscreenCanvas = canvas.cloneNode();
  const ctx = offscreenCanvas.getContext("2d");

  const audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator(); // Sine wave
  const audioDest = audioCtx.createMediaStreamDestination();
  osc.connect(audioDest);

  const stream = offscreenCanvas.captureStream(0);
  const videoStream = stream.getVideoTracks()[0];
  stream.addTrack(audioDest.stream.getAudioTracks()[0]);
  let supportedVideoType;
  for (const videoType of videoTypes) {
    if (MediaRecorder.isTypeSupported(videoType.mimeType)) {
      supportedVideoType = videoType;
      break;
    }
  }
  const recorder = new MediaRecorder(stream, { mimeType: supportedVideoType.mimeType });
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.onstop = () =>
    download("video." + supportedVideoType.ext, new Blob(chunks, { type: supportedVideoType.mimeType }));
  osc.start();
  recorder.start();

  const numFrames = duration * fps;
  for (let frame = 0; frame < numFrames; frame++) {
    await sleep(1000 / fps);
    draw(ctx, frame / numFrames);
    drawFrameNumber(ctx, frame);
    videoStream.requestFrame();
    recorder.requestData();
  }
  await sleep(1000 / fps);

  recorder.stop();
  osc.stop();
  recordButton.disabled = false;
  recordButton.innerText = "Record";
};

encodeButton.onclick = async () => {
  encodeButton.disabled = true;
  encodeButton.innerText = "Encoding...";

  const fps = 60;
  const duration = 4;

  const offscreenCanvas = canvas.cloneNode();
  const ctx = offscreenCanvas.getContext("2d");

  const config = {
    codec: videoCodec,
    width: offscreenCanvas.width,
    height: offscreenCanvas.height,
    framerate: fps,
  };
  const isSupported = await VideoEncoder.isConfigSupported(config);
  console.log("config isSupported:", isSupported);

  const chunks = [];
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      console.log(chunk, meta);
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      chunks.push(buf);
    },
    error: (e) => console.error(e),
  });
  videoEncoder.configure(config);

  const numFrames = duration * fps;
  for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
    draw(ctx, frameIndex / numFrames);
    const duration = 100_000 / fps;
    const timestamp = frameIndex * duration;
    let frame;
    const useImageData = false;
    if (useImageData) {
      const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
      frame = new VideoFrame(imageData.data, {
        format: "RGBA",
        codedWidth: imageData.width,
        codedHeight: imageData.height,
        timestamp,
        duration,
      });
    } else {
      frame = new VideoFrame(offscreenCanvas, { timestamp, duration });
    }
    const keyFrame = frameIndex % 60 === 0;
    videoEncoder.encode(frame, { keyFrame });
    await sleep(1000 / fps);
    frame.close();
  }

  await videoEncoder.flush();
  await sleep(1000);
  videoEncoder.close();

  console.log(
    chunks.length,
    chunks.reduce((accum, chunk) => accum + chunk.length, 0)
  );
  download("encoded.h264", new Blob(chunks, { type: "application/octet-stream" }));

  encodeButton.disabled = false;
  encodeButton.innerText = "Encode";
};

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
