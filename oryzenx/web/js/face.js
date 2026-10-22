// On-device face analysis for KYC (face-api / TensorFlow.js, loaded only on the KYC screens).
// Gives: face box, head turn (yaw), head tilt (pitch), eye openness, smile, and a 128-number face
// template used to compare the live face with the photo on the ID card.
let faceapi = null;
let loading = null;

export function loadFace() {
  loading ||= (async () => {
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
  })().catch((err) => { loading = null; throw err; });
  return loading;
}

const opts = (inputSize, scoreThreshold = 0.45) => new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });

// One face with landmarks (+ expressions / template when asked). Returns null if no face.
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

const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const ear = (e) => (d(e[1], e[5]) + d(e[2], e[4])) / (2 * d(e[0], e[3]));

// Geometry from the 68 landmarks, measured on the raw (not mirrored) camera image.
export function metrics(r) {
  const p = r.landmarks.positions;
  const le = p.slice(36, 42); const re = p.slice(42, 48);
  const lc = mean(le); const rc = mean(re);
  const eyes = { x: (lc.x + rc.x) / 2, y: (lc.y + rc.y) / 2 };
  const inter = d(lc, rc) || 1;
  const nose = p[30]; const chin = p[8];
  return {
    box: r.detection.box,
    score: r.detection.score,
    // > 0 when the person turns to THEIR left (their left is on the right of the raw image).
    yaw: (nose.x - eyes.x) / inter,
    // Nose position between eyes and chin: smaller when looking up, larger when nodding down.
    pitch: (nose.y - eyes.y) / ((chin.y - eyes.y) || 1),
    ear: (ear(le) + ear(re)) / 2,
    mouth: d(p[48], p[54]) / inter,
    happy: r.expressions?.happy ?? 0,
  };
}

export const distance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
export const toArray = (desc) => Array.from(desc, (v) => Math.round(v * 1e6) / 1e6);

// Average brightness (0-255) of a video/canvas, sampled small for speed.
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
 * Liveness prompts. Each detector gets the latest metrics and the person's neutral baseline and
 * returns true once the movement is done. "wrong" gives a hint when they move the other way.
 */
export const PROMPTS = {
  look_left: {
    text: 'Look left', say: 'Slowly turn your head to the left', icon: '←',
    done: (m, b) => m.yaw - b.yaw > 0.17, wrong: (m, b) => m.yaw - b.yaw < -0.2,
  },
  look_right: {
    text: 'Look right', say: 'Slowly turn your head to the right', icon: '→',
    done: (m, b) => m.yaw - b.yaw < -0.17, wrong: (m, b) => m.yaw - b.yaw > 0.2,
  },
  look_up: {
    text: 'Look up', say: 'Tilt your head up', icon: '↑',
    done: (m, b) => m.pitch - b.pitch < -0.06, wrong: (m, b) => m.pitch - b.pitch > 0.09,
  },
  nod_down: {
    text: 'Nod your head down', say: 'Nod your head down', icon: '↓',
    done: (m, b) => m.pitch - b.pitch > 0.06, wrong: (m, b) => m.pitch - b.pitch < -0.09,
  },
  smile: {
    text: 'Smile', say: 'Give us a big smile', icon: '☺',
    done: (m, b) => m.happy > 0.6 || m.mouth > b.mouth * 1.13,
  },
  blink: {
    text: 'Blink', say: 'Blink your eyes', icon: '◉',
    // closed, then open again
    stateful: true,
    step(m, b, st) {
      if (!st.closed && m.ear < b.ear * 0.68) st.closed = performance.now();
      if (st.closed && m.ear > b.ear * 0.85) return true;
      return false;
    },
  },
  eyes_closed: {
    text: 'Close your eyes, then open', say: 'Close your eyes, then open them', icon: '◡',
    stateful: true,
    step(m, b, st) {
      const now = performance.now();
      if (m.ear < b.ear * 0.68) { st.since ||= now; if (now - st.since > 600) st.held = true; } else if (!st.held) st.since = 0;
      return !!(st.held && m.ear > b.ear * 0.85);
    },
  },
};

export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch { /* voice is optional */ }
}
