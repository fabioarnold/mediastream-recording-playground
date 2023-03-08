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

draw(mainCtx, slider.value);

slider.oninput = () => {
  draw(mainCtx, slider.value);
};

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const codecString = "avc1.4D0034"; // Profile 77 Level 5.2

recordButton.onclick = async () => {
  const fps = 60;
  const duration = 4;
  const options = { mimeType: `video/mp4;codecs=${codecString}` };

  const offscreenCanvas = canvas.cloneNode();
  const ctx = offscreenCanvas.getContext("2d");

  const recorder = new MediaRecorder(offscreenCanvas.captureStream(), options);
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.onstop = () => download("video.mp4", new Blob(chunks, { type: "video/mp4" }));
  recorder.start();
  recordButton.disabled = true;
  recordButton.innerText = "Recording video";

  const numFrames = duration * fps;
  for (let frame = 0; frame < numFrames; frame++) {
    draw(ctx, frame / numFrames);
    await wait(1000 / fps);
    recorder.requestData();
  }

  recorder.stop();
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
    codec: codecString,
    width: offscreenCanvas.width,
    height: offscreenCanvas.height,
    framerate: fps,
  };
  const isSupported = await VideoEncoder.isConfigSupported(config);
  console.log('config isSupported:', isSupported);

  const chunks = [];
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      chunks.push(buf);
    },
    error: (e) => console.error(e)
  });
  videoEncoder.configure(config);

  const numFrames = duration * fps;
  for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
    draw(ctx, frameIndex / numFrames);
    const timestamp = 100_000 * frameIndex / fps;
    const frame = new VideoFrame(offscreenCanvas, {timestamp});
    const keyFrame = frameIndex % 60 === 0;
    videoEncoder.encode(frame, { keyFrame });
    frame.close();
  }

  await videoEncoder.flush();
  videoEncoder.close();

  console.log(chunks.length, chunks.reduce((accum, chunk) => accum + chunk.length, 0));
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
