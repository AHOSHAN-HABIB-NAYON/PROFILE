// On-device face analysis for KYC.
// - Live checks (head turns, blink, eyes closed, smile): Google MediaPipe Face Landmarker. It tracks
//   478 face points and reports blinks and smiles directly, so it works in normal phone conditions.
// - Face match (128-number template, ID photo vs live face): face-api / TensorFlow.js.
// Both are served from our own server and loaded only on the KYC screens.
let faceapi = null;
let apiLoading = null;
let landmarker = null;
let liveLoading = null;

// ---------- Face match (face-api) ----------
export function loadFace() {
  apiLoading ||= (async () => {
    faceapi = await import('/vendor/face-api/face-api.esm.js');
    const { tf } = faceapi;
    try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
    await tf.ready();
    const url = '/vendor/face-api/model';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url),
      faceapi.nets.faceExpressionNet.loadFromUri(url),
    ]);
    return faceapi;
  })().catch((err) => { apiLoading = null; throw err; });
  return apiLoading;
}

const opts = (inputSize, scoreThreshold = 0.45) => new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });

export async function analyze(input, { descriptor = false, expressions = false, size = 224, threshold } = {}) {
  let t = faceapi.detectSingleFace(input, opts(size, threshold)).withFaceLandmarks();
  if (expressions) t = t.withFaceExpressions();
  if (descriptor) t = t.withFaceDescriptor();
  return (await t) || null;
}

// Find the face on an ID card photo; tries larger detector sizes because the photo is small.
export async function idCardFace(img) {
  for (const size of [416, 512, 608, 320]) {
    const r = await analyze(img, { descriptor: true, size, threshold: 0.3 });
    if (r) return r;
  }
  return null;
}

// Face template of the live camera frame (several sizes, lenient threshold).
export async function liveDescriptor(video) {
  for (const size of [320, 416, 224]) {
    const r = await analyze(video, { descriptor: true, size, threshold: 0.35 });
    if (r) return r;
  }
  return null;
}

export const distance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
export const toArray = (desc) => Array.from(desc, (v) => Math.round(v * 1e6) / 1e6);

// ---------- Live tracking (MediaPipe) ----------
export function loadLive() {
  liveLoading ||= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('/vendor/mediapipe/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe');
    const make = (delegate) => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/vendor/mediapipe/face_landmarker.task', delegate },
      runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4, minTrackingConfidence: 0.4,
    });
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
    return landmarker;
  })().catch((err) => { liveLoading = null; throw err; });
  return liveLoading;
}

let lastTs = 0;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * One video frame -> { faces, box, yaw, pitch, blink, smile } or null when no face.
 * yaw > 0 when the person turns to THEIR left (raw camera image, not mirrored).
 * pitch is smaller when looking up, larger when nodding down.
 * blink / smile are 0..1 (MediaPipe blendshapes).
 */
export function liveRead(video) {
  if (!landmarker || !video.videoWidth) return null;
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const r = landmarker.detectForVideo(video, ts);
  const faces = r.faceLandmarks?.length || 0;
  if (!faces) return { faces: 0 };
  const W = video.videoWidth; const H = video.videoHeight;
  const lm = r.faceLandmarks[0].map((p) => ({ x: p.x * W, y: p.y * H }));
  let minX = W; let minY = H; let maxX = 0; let maxY = 0;
  for (const p of lm) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const eyeA = lm[33]; const eyeB = lm[263];
  const eyes = { x: (eyeA.x + eyeB.x) / 2, y: (eyeA.y + eyeB.y) / 2 };
  const inter = dist(eyeA, eyeB) || 1;
  const nose = lm[1]; const chin = lm[152];
  const bs = {};
  for (const c of r.faceBlendshapes?.[0]?.categories || []) bs[c.categoryName] = c.score;
  return {
    faces,
    box: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    yaw: (nose.x - eyes.x) / inter,
    pitch: (nose.y - eyes.y) / ((chin.y - eyes.y) || 1),
    blink: ((bs.eyeBlinkLeft ?? 0) + (bs.eyeBlinkRight ?? 0)) / 2,
    smile: ((bs.mouthSmileLeft ?? 0) + (bs.mouthSmileRight ?? 0)) / 2,
  };
}

// Average brightness (0-255) of the video, sampled small for speed.
const probe = document.createElement('canvas');
probe.width = 48; probe.height = 36;
export function brightness(src) {
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, 48, 36);
  const px = ctx.getImageData(0, 0, 48, 36).data;
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  return s / (px.length / 4);
}

/**
 * Liveness prompts. Each detector gets the latest reading and the person's neutral baseline and
 * returns true once the movement is done. "wrong" gives a hint when they move the other way.
 */
export const PROMPTS = {
  look_left: {
    text: 'Look left', say: 'Slowly turn your head to the left', icon: '←',
    done: (m, b) => m.yaw - b.yaw > 0.14, wrong: (m, b) => m.yaw - b.yaw < -0.18,
  },
  look_right: {
    text: 'Look right', say: 'Slowly turn your head to the right', icon: '→',
    done: (m, b) => m.yaw - b.yaw < -0.14, wrong: (m, b) => m.yaw - b.yaw > 0.18,
  },
  look_up: {
    text: 'Look up', say: 'Tilt your head up', icon: '↑',
    done: (m, b) => m.pitch - b.pitch < -0.045, wrong: (m, b) => m.pitch - b.pitch > 0.08,
  },
  nod_down: {
    text: 'Nod your head down', say: 'Nod your head down', icon: '↓',
    done: (m, b) => m.pitch - b.pitch > 0.045, wrong: (m, b) => m.pitch - b.pitch < -0.08,
  },
  smile: {
    text: 'Smile', say: 'Give us a big smile', icon: '☺',
    // Relative to the person's neutral face, capped so naturally smiley faces can still pass.
    done: (m, b) => m.smile > Math.min(0.8, Math.max(0.45, b.smile + 0.22)),
  },
  blink: {
    text: 'Blink', say: 'Blink your eyes', icon: '◉',
    stateful: true,
    step(m, b, st) {
      if (!st.closed && m.blink > Math.max(0.45, b.blink + 0.3)) st.closed = true;
      return !!(st.closed && m.blink < Math.max(0.3, b.blink + 0.12));
    },
  },
  eyes_closed: {
    text: 'Close your eyes, then open', say: 'Close your eyes for a moment, then open them', icon: '◡',
    stateful: true,
    step(m, b, st) {
      const now = performance.now();
      if (m.blink > Math.max(0.45, b.blink + 0.3)) { st.since ||= now; if (now - st.since > 600) st.held = true; } else if (!st.held) st.since = 0;
      return !!(st.held && m.blink < Math.max(0.3, b.blink + 0.12));
    },
  },
};

// ---------- Voice prompts ----------
// Phone browsers only allow speech that starts from a tap, so unlockVoice() must be called
// directly inside the tap handler. In the Android app the phone's own text-to-speech is used.
const tts = () => (window.Capacitor?.isPluginAvailable?.('TextToSpeech') ? window.Capacitor.Plugins.TextToSpeech : null);
let enVoice = null;
function pickVoice() {
  try {
    const vs = window.speechSynthesis?.getVoices() || [];
    enVoice = vs.find((v) => /en[-_]US/i.test(v.lang) && /female|samantha|google/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  } catch { /* ignore */ }
}
if ('speechSynthesis' in window) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }

export function unlockVoice(first = 'Starting face check') {
  if (tts()) { tts().speak({ text: first, lang: 'en-US', rate: 1.0 }).catch(() => {}); return; }
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(first);
    u.lang = 'en-US'; if (enVoice) u.voice = enVoice;
    window.speechSynthesis.speak(u);
  } catch { /* voice is optional */ }
}

export function speak(text) {
  if (tts()) { tts().stop?.().catch(() => {}); tts().speak({ text, lang: 'en-US', rate: 1.0 }).catch(() => {}); return; }
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 1; if (enVoice) u.voice = enVoice;
    // Chrome sometimes drops an utterance spoken right after cancel(); a tiny delay avoids it.
    setTimeout(() => window.speechSynthesis.speak(u), 60);
  } catch { /* voice is optional */ }
}

export function stopVoice() {
  try { tts()?.stop?.(); window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
