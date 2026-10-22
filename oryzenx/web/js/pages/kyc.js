// Member identity verification (Binance-style KYC):
// consent -> ID card front -> ID card back -> live face check -> admin review.
import { api } from '../api.js';
import {
  html, mount, icon, $, busy, toast,
} from '../ui.js';
import { state, afterAuth, logout } from '../app.js';
import * as face from '../face.js';

const STEPS = [['consent', 'Consent'], ['front', 'ID front'], ['back', 'ID back'], ['face', 'Face'], ['review', 'Review']];

let stream = null;
function stopCamera() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }

async function startCamera(video, facing) {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the camera. Please use the OryzenX app or Chrome.');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: facing === 'user' ? 960 : 1920 }, height: { ideal: facing === 'user' ? 720 : 1080 } },
    });
  } catch (err) {
    if (err.name === 'NotAllowedError') throw new Error('Camera permission was denied. Allow camera access in your browser or phone settings, then try again.');
    if (err.name === 'NotFoundError') throw new Error('No camera found on this device.');
    throw new Error('Could not start the camera. Close other apps that use it and try again.');
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  await new Promise((r) => { if (video.videoWidth) r(); else video.onloadedmetadata = r; });
}

function shell(el, active, body, note = '') {
  const idx = STEPS.findIndex(([k]) => k === active);
  mount(el, html`<div class="kyc-screen">
    <header class="kyc-top"><img src="/icons/logo.svg" width="32" height="32" alt=""><b>Identity verification</b><span class="grow"></span>
      <button class="icon-btn" id="k-out" aria-label="Log out" title="Log out">${icon('logout')}</button></header>
    <ol class="stepper">${STEPS.map(([k, l], i) => html`<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><span>${i < idx ? icon('check') : i + 1}</span><em>${l}</em></li>`)}</ol>
    ${note}
    <div class="kyc-body">${body}</div></div>`);
  $('#k-out', el).onclick = () => { stopCamera(); logout(); };
}

const errorBox = (msg) => html`<div class="form-error">${msg}</div>`;

// ---------- Entry ----------
export async function kyc({ el }) {
  const st = await api.get('/kyc/status', { fresh: true });
  const note = state.me.kyc_status === 'resubmit' && state.me.kyc_note
    ? html`<div class="note-bar warn">${icon('shield')}<span><b>An admin asked you to verify again:</b> ${state.me.kyc_note}</span></div>` : '';
  face.loadFace().catch(() => {}); // start downloading the face models in the background
  let step = !st.consent ? 'consent' : !st.id_front ? 'front' : !st.id_back ? 'back' : 'face';
  if (state.me.kyc_status === 'resubmit' && !el._started) { step = st.consent ? 'front' : 'consent'; el._started = true; }
  const go = (s) => { stopCamera(); step = s; screens[s](); };
  const screens = {
    consent: () => consent(el, note, () => go('front')),
    front: () => idCapture(el, note, 'front', () => go('back')),
    back: () => idCapture(el, note, 'back', () => go('face')),
    face: () => faceCheck(el, note, st, () => go('front')),
  };
  screens[step]();
  return () => { stopCamera(); window.speechSynthesis?.cancel(); };
}

// ---------- Consent ----------
function consent(el, note, next) {
  shell(el, 'consent', html`<div class="kyc-card">
    <div class="state-icon">${icon('shield')}</div>
    <h1>Verify it's really you</h1>
    <p class="muted">To keep the group safe, every member verifies their identity once. It takes about 2 minutes.</p>
    <div class="kyc-list">
      <div>${icon('camera')}<span><b>Your ID card</b><br><small>Front and back, taken with the in-app camera.</small></span></div>
      <div>${icon('user')}<span><b>A live face check</b><br><small>Follow a few short prompts so we know it's a real person.</small></span></div>
      <div>${icon('shield')}<span><b>How we protect it</b><br><small>Encrypted (AES-256) and only admins can see it. Every admin view is logged. You can ask an admin to delete it at any time.</small></span></div>
    </div>
    <label class="check"><input type="checkbox" id="agree"><span>I agree that OryzenX BD may collect my ID card photos and face data to verify my identity, as described above.</span></label>
    <button class="btn block mt" id="go" disabled>Agree and continue</button>
  </div>`, note);
  $('#agree', el).onchange = (e) => { $('#go', el).disabled = !e.target.checked; };
  $('#go', el).onclick = (e) => busy(e.currentTarget, async () => { await api.post('/kyc/consent', { accept: true }); next(); });
}

// ---------- ID card capture ----------
const CARD_RATIO = 85.6 / 54; // standard ID-1 card

// Map the on-screen guide to video pixels (the video is shown with object-fit: cover).
function guideRect(video, guide) {
  const vr = video.getBoundingClientRect(); const gr = guide.getBoundingClientRect();
  const scale = Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight);
  const ox = (video.videoWidth * scale - vr.width) / 2; const oy = (video.videoHeight * scale - vr.height) / 2;
  return {
    x: Math.max(0, (gr.left - vr.left + ox) / scale), y: Math.max(0, (gr.top - vr.top + oy) / scale),
    w: Math.min(video.videoWidth, gr.width / scale), h: Math.min(video.videoHeight, gr.height / scale),
  };
}

const qc = document.createElement('canvas');
// Sharpness (variance of Laplacian), brightness, glare and edge alignment of the card area.
function quality(video, r) {
  const W = 320; const H = Math.round(W / CARD_RATIO);
  qc.width = W; qc.height = H;
  const ctx = qc.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0; i < W * H; i += 1) {
    const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    g[i] = v; sum += v;
  }
  // Glare = blown-out spots clearly brighter than the card itself (a plain white card is not glare).
  const avg = sum / (W * H);
  const glareCut = Math.max(250, avg + 35);
  let glare = 0;
  for (let i = 0; i < W * H; i += 1) if (g[i] >= glareCut) glare += 1;
  let lapSum = 0; let lapSq = 0; let n = 0;
  const edge = [0, 0, 0, 0]; const band = 10; let edgeAll = 0;
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      const lap = g[i - 1] + g[i + 1] + g[i - W] + g[i + W] - 4 * g[i];
      lapSum += lap; lapSq += lap * lap; n += 1;
      const gx = Math.abs(g[i + 1] - g[i - 1]); const gy = Math.abs(g[i + W] - g[i - W]);
      edgeAll += gx + gy;
      if (y < band) edge[0] += gy; else if (y > H - band) edge[2] += gy;
      if (x < band) edge[3] += gx; else if (x > W - band) edge[1] += gx;
    }
  }
  const meanEdge = edgeAll / n;
  const sides = [edge[0] / (band * W), edge[1] / (band * H), edge[2] / (band * W), edge[3] / (band * H)].filter((v) => v > meanEdge * 1.15).length;
  return {
    bright: sum / (W * H), sharp: lapSq / n - (lapSum / n) ** 2, glare: glare / (W * H), sides,
  };
}

function idCapture(el, note, side, next) {
  const front = side === 'front';
  shell(el, side, html`<div class="kyc-card wide">
    <h2>${front ? 'Front of your ID card' : 'Back of your ID card'}</h2>
    <p class="muted" style="margin:4px 0 12px">${front ? 'Place the side with your photo inside the frame.' : 'Now turn the card over and place the back inside the frame.'}</p>
    <div class="cam id-cam" id="cam">
      <video id="v" playsinline muted></video>
      <div class="card-guide" id="guide"><i></i><i></i><i></i><i></i></div>
      <div class="cam-msg" id="msg">Starting camera…</div>
    </div>
    <div class="q-row" id="q"><span data-q="light">${icon('sun')} Light</span><span data-q="sharp">${icon('eye')} Focus</span><span data-q="glare">${icon('x')} No glare</span><span data-q="fit">${icon('camera')} In frame</span></div>
    <div id="err"></div>
    <button class="btn block shutter" id="snap" disabled>${icon('camera')} Take photo</button>
    <p class="faint center" style="font-size:12px">Use your device camera. Photos from the gallery are not allowed.</p>
  </div>`, note);

  const video = $('#v', el); const guide = $('#guide', el); const msg = $('#msg', el);
  let timer = null; let goodSince = 0; let lastQ = null;

  const setQ = (k, ok) => $(`[data-q="${k}"]`, el)?.classList.toggle('ok', ok);
  const tick = () => {
    if (!video.videoWidth) return;
    const q = quality(video, guideRect(video, guide));
    lastQ = q;
    const light = q.bright > 55 && q.bright < 245 && q.glare < 0.35; const sharp = q.sharp > 30; const noGlare = q.glare < 0.02 || q.glare >= 0.35; const fit = q.sides >= 2;
    setQ('light', light); setQ('sharp', sharp); setQ('glare', noGlare); setQ('fit', fit);
    let text = 'Looks good — hold still';
    if (!light) text = q.bright <= 55 ? 'Too dark — move to better light' : 'Too bright — move out of direct light';
    // (a mostly white-clipped card is over-exposure, reported as too bright)
    else if (!noGlare) text = 'Glare on the card — tilt it slightly';
    else if (!sharp) text = 'Hold steady — the image is blurry';
    else if (!fit) text = 'Fit the card edges inside the frame';
    msg.textContent = text;
    const ok = light && sharp && noGlare;
    $('#snap', el).disabled = !ok;
    guide.classList.toggle('good', ok && fit);
    if (ok && fit) { goodSince ||= performance.now(); if (performance.now() - goodSince > 1200) capture(); } else goodSince = 0;
  };

  const capture = () => {
    clearInterval(timer); timer = null;
    const r = guideRect(video, guide);
    const outW = Math.min(1400, Math.round(r.w)); const outH = Math.round(outW / CARD_RATIO);
    const c = document.createElement('canvas'); c.width = outW; c.height = outH;
    c.getContext('2d').drawImage(video, r.x, r.y, r.w, r.h, 0, 0, outW, outH);
    stopCamera();
    preview(c.toDataURL('image/jpeg', 0.88));
  };

  const preview = (dataUrl) => {
    mount($('.kyc-card', el), html`<h2>Check your photo</h2>
      <p class="muted" style="margin:4px 0 12px">Make sure all text is readable and there is no glare${front ? ' and your photo is clear' : ''}.</p>
      <img class="id-preview" src="${dataUrl}" alt="ID card ${side}">
      <div id="err"></div>
      <div class="row mt" style="gap:10px"><button class="btn ghost grow" id="retake">Retake</button><button class="btn grow" id="use">${icon('check')} Use this photo</button></div>`);
    $('#retake', el).onclick = () => idCapture(el, note, side, next);
    $('#use', el).onclick = (e) => busy(e.currentTarget, async () => {
      let descriptor;
      if (front) {
        $('#use', el).innerHTML = '<span class="spin"></span> Finding your photo…';
        await face.loadFace();
        const img = new Image(); img.src = dataUrl; await img.decode();
        const r = await face.idCardFace(img);
        if (!r) throw new Error('We could not find the photo of your face on the card. Retake it closer, in good light, without glare.');
        descriptor = face.toArray(r.descriptor);
      }
      await api.post('/kyc/id', { side, image: dataUrl, descriptor, quality: lastQ && { bright: Math.round(lastQ.bright), sharp: Math.round(lastQ.sharp), glare: Number(lastQ.glare.toFixed(3)) } });
      toast(front ? 'Front saved' : 'Back saved');
      next();
    }, $('#err', el));
  };

  $('#snap', el).onclick = capture;
  startCamera(video, 'environment').then(() => { timer = setInterval(tick, 250); }).catch((err) => {
    msg.textContent = 'Camera unavailable';
    mount($('#err', el), errorBox(err.message));
  });
  const obs = new MutationObserver(() => { if (!video.isConnected) { clearInterval(timer); obs.disconnect(); } });
  obs.observe(el, { childList: true, subtree: true });
}

// ---------- Live face check ----------
function faceCheck(el, note, st, restartId) {
  const left = st.max_fails - st.fails;
  shell(el, 'face', html`<div class="kyc-card">
    <h2>Live face check</h2>
    <p class="muted" style="margin:4px 0 14px">Follow the prompts. Keep your face inside the oval.</p>
    <div class="tips">
      <div>${icon('sun')}<span>Good, even light on your face</span></div>
      <div>${icon('user')}<span>Remove sunglasses, hat or mask</span></div>
      <div>${icon('eye')}<span>Hold the phone at eye level</span></div>
    </div>
    ${st.fails ? html`<div class="note-bar warn mt">${icon('shield')}<span>${left} attempt${left === 1 ? '' : 's'} left before a manual review by an admin.</span></div>` : ''}
    <button class="btn block mt" id="start">${icon('camera')} Start face check</button>
    <button class="btn ghost block mt-s" id="redo-id">Retake ID card photos</button>
  </div>`, note);
  $('#redo-id', el).onclick = restartId;
  $('#start', el).onclick = (e) => busy(e.currentTarget, () => runFaceCheck(el, note, st, restartId));
}

async function runFaceCheck(el, note, st, restartId) {
  await face.loadFace();
  const ch = await api.post('/kyc/face/start');
  shell(el, 'face', html`<div class="kyc-card">
    <div class="face-stage">
      <div class="cam face-cam"><video id="v" playsinline muted></video></div>
      <svg class="ring" viewBox="0 0 100 120" aria-hidden="true"><ellipse class="track" cx="50" cy="60" rx="46" ry="56"/><ellipse class="bar" id="bar" cx="50" cy="60" rx="46" ry="56" pathLength="100"/></svg>
    </div>
    <div class="prompt" id="prompt"><span class="p-ic" id="pic">◎</span><span id="ptext">Getting ready…</span></div>
    <div class="cam-msg static" id="msg">Center your face in the oval</div>
    <div class="p-dots" id="dots">${ch.prompts.map(() => html`<i></i>`)}</div>
    <div class="row between mt-s"><button class="btn ghost sm" id="voice">${icon('bell')} Voice on</button><button class="btn ghost sm" id="cancel">Cancel</button></div>
    <div id="err"></div>
  </div>`, note);

  const video = $('#v', el); const msg = $('#msg', el); const ptext = $('#ptext', el); const pic = $('#pic', el);
  const bar = $('#bar', el); const dots = [...el.querySelectorAll('#dots i')];
  let voice = true; let cancelled = false;
  $('#voice', el).onclick = (e) => { voice = !voice; e.currentTarget.lastChild.textContent = voice ? ' Voice on' : ' Voice off'; if (!voice) window.speechSynthesis?.cancel(); };
  $('#cancel', el).onclick = () => { cancelled = true; stopCamera(); faceCheck(el, note, st, restartId); };
  const say = (t) => { if (voice) face.speak(t); };
  const setProgress = (p) => { bar.style.strokeDasharray = `${Math.round(p * 100)} 100`; bar.style.opacity = p > 0 ? 1 : 0; };
  setProgress(0);

  await startCamera(video, 'user');
  const frameW = () => video.videoWidth;
  const next = () => new Promise((r) => requestAnimationFrame(r));
  let light = 0;

  const read = async (opts = {}) => {
    const r = await face.analyze(video, { size: 224, ...opts });
    light = face.brightness(video);
    return r;
  };
  // Position + light check: one face, big enough, roughly centered.
  const positioned = (r) => {
    if (light < 50) return 'Too dark — face a light source';
    if (light > 225) return 'Too bright — avoid strong light behind or on you';
    if (!r) return 'Center your face in the oval';
    const b = r.detection.box; const w = frameW();
    if (b.width < w * 0.22) return 'Move closer';
    if (b.width > w * 0.75) return 'Move a little further away';
    const cx = (b.x + b.width / 2) / w;
    if (cx < 0.3 || cx > 0.7) return 'Center your face in the oval';
    return null;
  };

  const fail = (text) => {
    stopCamera();
    window.speechSynthesis?.cancel();
    mount($('.kyc-card', el), html`<div class="state-icon" style="background:var(--down-soft);color:var(--down)">${icon('x')}</div>
      <h2 class="center">${text}</h2><p class="muted center">Find good light, keep your face in the oval and follow each prompt.</p>
      <button class="btn block mt" id="again">Try again</button>`);
    $('#again', el).onclick = () => faceCheck(el, note, st, restartId);
  };

  // 1. Calibrate on a still, frontal face and take the template + snapshot.
  ptext.textContent = 'Look straight at the camera';
  say('Look straight at the camera');
  const base = []; let neutral = null; const t0 = performance.now();
  while (!cancelled && base.length < 6) {
    if (performance.now() - t0 > 25000) return fail('We could not see your face clearly');
    const r = await read({ expressions: true });
    const problem = positioned(r);
    msg.textContent = problem || 'Hold still…';
    if (!problem) base.push(face.metrics(r)); else base.length = 0;
    await next();
  }
  if (cancelled) return undefined;
  const b0 = {
    yaw: base.reduce((s, m) => s + m.yaw, 0) / base.length,
    pitch: base.reduce((s, m) => s + m.pitch, 0) / base.length,
    ear: Math.max(...base.map((m) => m.ear)),
    mouth: base.reduce((s, m) => s + m.mouth, 0) / base.length,
  };
  for (let tries = 0; !neutral && tries < 10; tries += 1) {
    const r = await read({ descriptor: true });
    if (r && !positioned(r)) neutral = r;
  }
  if (!neutral) return fail('We could not see your face clearly');
  const snap = document.createElement('canvas');
  const sw = Math.min(640, video.videoWidth); snap.width = sw; snap.height = Math.round(sw * (video.videoHeight / video.videoWidth));
  snap.getContext('2d').drawImage(video, 0, 0, snap.width, snap.height);
  const snapshot = snap.toDataURL('image/jpeg', 0.85);
  const lightAtStart = light;

  // 2. Random prompts chosen by the server.
  const steps = [];
  for (let i = 0; i < ch.prompts.length; i += 1) {
    const key = ch.prompts[i]; const P = face.PROMPTS[key];
    ptext.textContent = P.text; pic.textContent = P.icon;
    $('#prompt', el).classList.remove('pop'); void $('#prompt', el).offsetWidth; $('#prompt', el).classList.add('pop');
    say(P.say);
    const started = performance.now(); const stState = {}; let done = false;
    while (!cancelled && !done) {
      if (performance.now() - started > 12000) return fail(`We didn't catch "${P.text}"`);
      const r = await read({ expressions: key === 'smile' });
      if (!r) { msg.textContent = 'Keep your face in the oval'; await next(); continue; }
      const m = face.metrics(r);
      done = P.stateful ? P.step(m, b0, stState) : P.done(m, b0);
      msg.textContent = done ? 'Great!' : (P.wrong?.(m, b0) ? 'Other way' : P.text);
      await next();
    }
    if (cancelled) return undefined;
    steps.push({ prompt: key, ok: true, ms: Math.round(performance.now() - started) });
    dots[i].classList.add('done');
    setProgress((i + 1) / ch.prompts.length);
    // brief pause and back to neutral before the next prompt
    await new Promise((r) => setTimeout(r, 450));
  }

  // 3. Back to the camera: the same face must still be there.
  ptext.textContent = 'Look at the camera again'; pic.textContent = '◎';
  let end = null;
  for (let tries = 0; !end && tries < 40 && !cancelled; tries += 1) {
    const r = await read({ descriptor: true });
    if (r && !positioned(r) && Math.abs(face.metrics(r).yaw - b0.yaw) < 0.12) end = r;
    await next();
  }
  stopCamera();
  if (cancelled) return undefined;
  if (!end) return fail('We lost your face at the end');

  ptext.textContent = 'Checking…'; msg.textContent = 'Comparing your face with your ID card';
  const descriptor = face.toArray(neutral.descriptor);
  const res = await api.post('/kyc/face/submit', {
    nonce: ch.nonce, steps, descriptor, end_descriptor: face.toArray(end.descriptor), snapshot, lighting: Math.round(lightAtStart),
  }).catch((err) => { fail(err.message); return null; });
  if (!res) return undefined;

  if (res.result === 'mismatch') {
    say('Warning. Face does not match.');
    st.fails += 1;
    mount($('.kyc-card', el), html`<div class="state-icon" style="background:var(--down-soft);color:var(--down)">${icon('x')}</div>
      <h2 class="center down">Warning: Face does not match</h2>
      <p class="muted center">Your face did not match the photo on your ID card. Make sure you used your own card and try again in good light.
      You have <b>${res.attempts_left}</b> attempt${res.attempts_left === 1 ? '' : 's'} left before an admin reviews it manually.</p>
      <button class="btn block mt" id="again">Try again</button><button class="btn ghost block mt-s" id="redo-id">Retake ID card photos</button>`);
    $('#again', el).onclick = () => faceCheck(el, note, st, restartId);
    $('#redo-id', el).onclick = restartId;
    return undefined;
  }
  say(res.result === 'review' ? 'Sent for review' : 'Verification submitted');
  await afterAuth();
  return undefined;
}

// ---------- After submitting ----------
function gate(el, body) {
  mount(el, html`<div class="center-screen"><div class="auth-card" style="text-align:center">
    <img src="/icons/logo.svg" width="44" height="44" alt="" style="margin-bottom:18px">${body}
    <button class="btn ghost block mt" id="out">${icon('logout')} Log out</button></div></div>`);
  $('#out', el).onclick = logout;
}

export async function kycPending({ el }) {
  const review = state.me.kyc_status === 'review';
  gate(el, html`<div class="state-icon ${review ? '' : 'ok'}">${icon(review ? 'clock' : 'check')}</div>
    <h1>${review ? 'Manual review' : 'Verification submitted'}</h1>
    <p class="muted">${review
    ? 'We could not automatically match your face to your ID card, so an admin will review it. Your account is on hold until then. No action is needed from you.'
    : 'Thanks! Your ID card and face check were received. An admin will review them soon. We will email you when it is done.'}</p>
    <div class="kyc-progress"><div class="done">${icon('check')} Email verified</div><div class="done">${icon('check')} ID card</div><div class="done">${icon('check')} Face check</div><div class="now">${icon('clock')} Admin review</div></div>
    <button class="btn block mt" id="again">Check status</button>`);
  $('#again', el).onclick = (e) => busy(e.currentTarget, async () => {
    await afterAuth();
    if (state.stage === 'kyc_pending') toast('Still under review', 'err');
  });
  const t = setInterval(() => { if (!document.hidden) afterAuth().catch(() => {}); }, 30000);
  return () => clearInterval(t);
}

export async function kycRejected({ el }) {
  gate(el, html`<div class="state-icon" style="background:var(--down-soft);color:var(--down)">${icon('x')}</div>
    <h1>Verification not approved</h1>
    <p class="muted">An admin could not approve your verification.</p>
    ${state.me.kyc_note ? html`<div class="note-bar" style="text-align:left">${icon('shield')}<span><b>Reason:</b> ${state.me.kyc_note}</span></div>` : ''}
    <p class="muted">Please contact an admin of the group if you think this is a mistake.</p>`);
}
