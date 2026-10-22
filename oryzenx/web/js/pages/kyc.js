// Member identity verification (Binance-style KYC), screens follow the OryzenX mockup:
// consent -> ID card (front + back) -> live face check -> "KYC Submitted" -> admin review.
import { api } from '../api.js';
import {
  html, mount, icon, $, busy, toast, raw,
} from '../ui.js';
import { state, afterAuth, logout } from '../app.js';
import * as face from '../face.js';

let stream = null;
function stopCamera() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }

async function startCamera(video, facing) {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the camera. Please use the OryzenX app or Chrome.');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: facing === 'user' ? 720 : 1920 }, height: { ideal: facing === 'user' ? 960 : 1080 } },
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

// Mobile-style screen: back arrow, title, subtitle, content.
function screen(el, { title, sub = '', back = null, body, note = '' }) {
  mount(el, html`<div class="m-screen">
    <header class="m-head">
      ${back ? html`<button class="m-back" id="m-back" aria-label="Back">${icon('back')}</button>` : html`<img src="/icons/logo.svg" width="30" height="30" alt="">`}
      <div class="grow"><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>
      <button class="m-back" id="m-out" aria-label="Log out" title="Log out">${icon('logout')}</button>
    </header>
    ${note}
    <div class="m-body">${body}</div></div>`);
  $('#m-out', el).onclick = () => { stopCamera(); face.stopVoice(); logout(); };
  if (back) $('#m-back', el).onclick = back;
}

const errorBox = (msg) => html`<div class="form-error">${msg}</div>`;

// ---------- Entry ----------
export async function kyc({ el }) {
  const st = await api.get('/kyc/status', { fresh: true });
  const note = state.me.kyc_status === 'resubmit' && state.me.kyc_note
    ? html`<div class="note-bar warn">${icon('shield')}<span><b>Please verify again:</b> ${state.me.kyc_note}</span></div>` : '';
  face.loadFace().catch(() => {}); // download the face models in the background
  face.loadLive().catch(() => {});
  // When an admin asked for a redo, start with fresh photos.
  const redo = state.me.kyc_status === 'resubmit';
  const shots = { front: st.id_front && !redo, back: st.id_back && !redo };
  const ctx = { el, note, st, shots };
  ctx.go = (s, arg) => { stopCamera(); face.stopVoice(); SCREENS[s](ctx, arg); };
  ctx.go(!st.consent ? 'consent' : (!shots.front || !shots.back) ? 'id' : 'faceIntro');
  return () => { stopCamera(); face.stopVoice(); };
}

const SCREENS = {
  consent: (c) => consent(c),
  id: (c) => idOverview(c),
  capture: (c, side) => idCapture(c, side),
  faceIntro: (c) => faceIntro(c),
};

// ---------- Consent ----------
function consent(c) {
  screen(c.el, {
    title: 'Verify your identity', sub: 'Takes about 2 minutes', note: c.note,
    body: html`<div class="m-card center">
      <div class="hero-ic">${icon('shield')}</div>
      <h2>Verify it's really you</h2>
      <p class="muted">To keep the group safe, every member verifies their identity once.</p>
      <div class="kyc-list">
        <div><span class="li-ic">${icon('camera')}</span><span><b>Your ID card</b><small>Front and back, with the in-app camera</small></span></div>
        <div><span class="li-ic">${icon('user')}</span><span><b>A live face check</b><small>Follow a few short prompts</small></span></div>
        <div><span class="li-ic">${icon('shield')}</span><span><b>Encrypted and private</b><small>AES-256, admins only, every view is logged. You can ask for deletion.</small></span></div>
      </div>
      <label class="check"><input type="checkbox" id="agree"><span>I agree that OryzenX BD may collect my ID card photos and face data to verify my identity.</span></label>
      <button class="btn block lg mt" id="go" disabled>Agree and continue</button></div>`,
  });
  $('#agree', c.el).onchange = (e) => { $('#go', c.el).disabled = !e.target.checked; };
  $('#go', c.el).onclick = (e) => busy(e.currentTarget, async () => { await api.post('/kyc/consent', { accept: true }); c.go('id'); });
}

// ---------- ID card overview (mockup: Front Side / Back Side + Start) ----------
const cardArt = (side) => html`<div class="id-art ${side}"><span class="ph"></span><i></i><i></i><i></i>${side === 'back' ? html`<b class="bars"></b>` : ''}</div>`;

function idOverview(c) {
  const box = (side, label) => html`<button class="id-slot ${c.shots[side] ? 'done' : ''}" data-side="${side}">
    <span class="slot-label">${label}${c.shots[side] ? html` <span class="chip up">${icon('check')} Saved</span>` : ''}</span>
    ${typeof c.shots[side] === 'string' ? html`<img src="${c.shots[side]}" alt="${label}">` : cardArt(side)}
    <span class="slot-cta">${c.shots[side] ? 'Retake' : 'Tap to take photo'}</span></button>`;
  const ready = c.shots.front && c.shots.back;
  screen(c.el, {
    title: 'ID Card Verification', sub: 'National ID, passport or driving licence', note: c.note,
    back: () => c.go('consent'),
    body: html`<div class="m-card">
      ${box('front', 'Front Side')}${box('back', 'Back Side')}
      <button class="btn block lg mt" id="start">${ready ? html`Continue to face check` : html`${icon('camera')} Start`}</button>
      <p class="faint center small mt-s">Use your device camera. Do not upload from gallery.</p></div>`,
  });
  c.el.querySelectorAll('[data-side]').forEach((b) => { b.onclick = () => c.go('capture', b.dataset.side); });
  $('#start', c.el).onclick = () => c.go(ready ? 'faceIntro' : 'capture', c.shots.front ? 'back' : 'front');
}

// ---------- ID card camera ----------
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


function idCapture(c, side) {
  const front = side === 'front';
  screen(c.el, {
    title: front ? 'Front Side' : 'Back Side', sub: front ? 'Side with your photo' : 'Turn the card over',
    back: () => c.go('id'),
    body: html`<div class="cam id-cam" id="cam">
        <video id="v" playsinline muted></video>
        <div class="card-guide" id="guide"><i></i><i></i><i></i><i></i></div>
        <div class="cam-msg" id="msg">Starting camera…</div>
      </div>
      <div class="q-row" id="q"><span data-q="light">${icon('sun')} Light</span><span data-q="sharp">${icon('eye')} Focus</span><span data-q="glare">${icon('x')} No glare</span><span data-q="fit">${icon('camera')} In frame</span></div>
      <div id="err"></div>
      <button class="shutter-btn" id="snap" disabled aria-label="Take photo"><span></span></button>
      <p class="faint center small">Hold still: it takes the photo automatically when everything is green.</p>`,
  });
  const { el } = c;
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
    const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
    cv.getContext('2d').drawImage(video, r.x, r.y, r.w, r.h, 0, 0, outW, outH);
    stopCamera();
    preview(cv.toDataURL('image/jpeg', 0.88));
  };
  const preview = (dataUrl) => {
    screen(el, {
      title: 'Check your photo', sub: front ? 'Front Side' : 'Back Side', back: () => c.go('capture', side),
      body: html`<div class="m-card"><img class="id-preview" src="${dataUrl}" alt="ID card ${side}">
        <p class="muted small">Make sure all text is readable, with no glare${front ? ' and your photo is clear' : ''}.</p>
        <div id="err"></div>
        <div class="row" style="gap:10px"><button class="btn ghost grow lg" id="retake">Retake</button><button class="btn grow lg" id="use">${icon('check')} Use photo</button></div></div>`,
    });
    $('#retake', el).onclick = () => c.go('capture', side);
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
      c.shots[side] = dataUrl;
      toast(front ? 'Front side saved' : 'Back side saved');
      c.go(front && !c.shots.back ? 'capture' : 'id', 'back');
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

// ---------- Face check ----------
function faceIntro(c, reverify = false) {
  const left = c.st.max_fails - c.st.fails;
  screen(c.el, {
    title: reverify ? 'Security check' : 'Face Verification', sub: 'Follow the instructions', note: c.note,
    back: reverify ? null : () => c.go('id'),
    body: html`<div class="m-card center">
      <div class="face-ill">${icon('user')}</div>
      ${reverify ? html`<h2>Quick face check</h2><p class="muted">We noticed something new on your account, so we need to make sure it's really you. It takes about 10 seconds.</p>
        ${state.me.reverify_reason ? html`<div class="note-bar">${icon('shield')}<span>Why: ${state.me.reverify_reason}</span></div>` : ''}` : html`<h2>Live face check</h2><p class="muted">Keep your face inside the circle and follow the voice and text prompts.</p>`}
      <div class="tips">
        <div>${icon('sun')}<span>Good, even light on your face</span></div>
        <div>${icon('user')}<span>Remove sunglasses, hat or mask</span></div>
        <div>${icon('bell')}<span>Turn your volume up for voice prompts</span></div>
      </div>
      ${!reverify && c.st.fails ? html`<div class="note-bar warn mt">${icon('shield')}<span>${left} attempt${left === 1 ? '' : 's'} left before a manual review by an admin.</span></div>` : ''}
      <div id="err"></div>
      <button class="btn block lg mt" id="start">${icon('camera')} Start</button>
      ${reverify ? html`<p class="faint center small mt-s">Not you? Log out and change your password.</p>` : ''}</div>`,
  });
  $('#start', c.el).onclick = (e) => {
    face.unlockVoice('Starting face check'); // must run inside the tap, or phones block the voice
    busy(e.currentTarget, () => runFaceCheck(c, reverify), $('#err', c.el));
  };
}

async function runFaceCheck(c, reverify) {
  const { el } = c;
  await Promise.all([face.loadLive(), face.loadFace()]);
  const ch = await api.post(reverify ? '/kyc/reverify/start' : '/kyc/face/start');
  const total = ch.prompts.length;
  screen(el, {
    title: reverify ? 'Security check' : 'Face Verification', sub: 'Follow the instructions',
    back: () => { cancelled = true; stopCamera(); faceIntro(c, reverify); },
    body: html`<div class="m-card center">
      <div class="face-stage">
        <div class="cam face-cam"><video id="v" playsinline muted></video></div>
        <svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="47"/><circle class="bar" id="bar" cx="50" cy="50" r="47" pathLength="100"/></svg>
      </div>
      <div class="prompt-pill" id="prompt"><span id="pic">◎</span><span id="ptext">Getting ready…</span></div>
      <div class="cam-msg static" id="msg">Center your face in the circle</div>
      <div class="face-foot">
        <div class="p-dots" id="dots">${ch.prompts.map(() => html`<i></i>`)}</div>
        <button class="voice-btn on" id="voice" aria-label="Voice prompts on">${raw('<svg class="i" viewBox="0 0 24 24"><path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 11v2"/></svg>')}</button>
        <span class="step-count" id="cnt">0/${total}</span>
      </div>
      <div id="err"></div></div>`,
  });
  const video = $('#v', el); const msg = $('#msg', el); const ptext = $('#ptext', el); const pic = $('#pic', el);
  const bar = $('#bar', el); const dots = [...el.querySelectorAll('#dots i')]; const cnt = $('#cnt', el);
  let voice = true; let cancelled = false;
  $('#voice', el).onclick = (e) => {
    voice = !voice; e.currentTarget.classList.toggle('on', voice);
    if (voice) face.unlockVoice(ptext.textContent); else face.stopVoice();
  };
  const say = (t) => { if (voice) face.speak(t); };
  const setProgress = (p) => { bar.style.strokeDasharray = `${Math.round(p * 100)} 100`; bar.style.opacity = p > 0 ? 1 : 0; };
  setProgress(0);

  try { await startCamera(video, 'user'); } catch (err) { mount($('#err', el), errorBox(err.message)); return; }
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  let light = 128; let lastLight = 0;
  const read = () => {
    const m = face.liveRead(video);
    if (performance.now() - lastLight > 500) { light = face.brightness(video); lastLight = performance.now(); }
    return m;
  };
  // One face, big enough, roughly centered, decent light.
  const problem = (m) => {
    if (light < 40) return 'Too dark — face a light source';
    if (light > 235) return 'Too bright — avoid strong light';
    if (!m || !m.faces) return 'Center your face in the circle';
    if (m.faces > 1) return 'Only one face, please';
    const W = video.videoWidth; const H = video.videoHeight;
    const size = Math.max(m.box.width / W, m.box.height / H);
    if (size < 0.25) return 'Move closer';
    if (size > 0.95) return 'Move a little further away';
    const cx = (m.box.x + m.box.width / 2) / W; const cy = (m.box.y + m.box.height / 2) / H;
    if (cx < 0.22 || cx > 0.78 || cy < 0.2 || cy > 0.8) return 'Center your face in the circle';
    return null;
  };
  const fail = (text) => {
    stopCamera(); face.stopVoice();
    screen(el, {
      title: reverify ? 'Security check' : 'Face Verification', back: () => faceIntro(c, reverify),
      body: html`<div class="m-card center"><div class="hero-ic bad">${icon('x')}</div>
        <h2>${text}</h2><p class="muted">Find good light, keep your face in the circle and follow each prompt.</p>
        <button class="btn block lg mt" id="again">Try again</button></div>`,
    });
    $('#again', el).onclick = () => { face.unlockVoice('Starting face check'); runFaceCheck(c, reverify).catch((err) => fail(err.message)); };
  };

  // 1. Calibrate: a few good frames of a still, straight face.
  ptext.textContent = 'Look straight, neutral face'; pic.textContent = '◎';
  say('Look straight at the camera with a neutral face');
  const base = []; const t0 = performance.now();
  while (!cancelled && base.length < 8) {
    if (performance.now() - t0 > 30000) return fail('We could not see your face clearly');
    const m = read();
    const p = problem(m);
    msg.textContent = p || 'Hold still…';
    if (!p) base.push(m);
    await frame();
  }
  if (cancelled) return undefined;
  const avg = (k) => base.reduce((s, m) => s + m[k], 0) / base.length;
  const b0 = { yaw: avg('yaw'), pitch: avg('pitch'), blink: Math.min(...base.map((m) => m.blink)), smile: avg('smile') };

  // Face template + photo for the admin (face-api), taken while the face is straight.
  msg.textContent = 'Hold still…';
  const neutral = await face.liveDescriptor(video);
  if (!neutral) return fail('We could not see your face clearly');
  const snap = document.createElement('canvas');
  const sw = Math.min(640, video.videoWidth); snap.width = sw; snap.height = Math.round(sw * (video.videoHeight / video.videoWidth));
  snap.getContext('2d').drawImage(video, 0, 0, snap.width, snap.height);
  const snapshot = snap.toDataURL('image/jpeg', 0.85);
  const lightAtStart = light;

  // 2. Random prompts chosen by the server.
  const steps = [];
  for (let i = 0; i < total; i += 1) {
    const key = ch.prompts[i]; const P = face.PROMPTS[key];
    ptext.textContent = P.text; pic.textContent = P.icon;
    const pill = $('#prompt', el); pill.classList.remove('pop', 'ok'); void pill.offsetWidth; pill.classList.add('pop');
    say(P.say);
    const started = performance.now(); const st = {}; let done = false;
    while (!cancelled && !done) {
      if (performance.now() - started > 15000) return fail(`We didn't catch "${P.text}"`);
      const m = read();
      if (!m?.faces) { msg.textContent = 'Keep your face in the circle'; await frame(); continue; }
      done = P.stateful ? P.step(m, b0, st) : P.done(m, b0);
      msg.textContent = done ? 'Great!' : (P.wrong?.(m, b0) ? 'Other way' : P.text);
      await frame();
    }
    if (cancelled) return undefined;
    steps.push({ prompt: key, ok: true, ms: Math.round(performance.now() - started) });
    pill.classList.add('ok');
    dots[i].classList.add('done');
    cnt.textContent = `${i + 1}/${total}`;
    setProgress((i + 1) / total);
    await new Promise((r) => setTimeout(r, 500));
  }

  // 3. Back to the camera: the same face must still be there.
  ptext.textContent = 'Look at the camera again'; pic.textContent = '◎';
  say('Now look at the camera');
  let end = null;
  for (let tries = 0; !end && tries < 60 && !cancelled; tries += 1) {
    const m = read();
    if (m?.faces === 1 && !problem(m) && Math.abs(m.yaw - b0.yaw) < 0.12) end = await face.liveDescriptor(video);
    await frame();
  }
  stopCamera();
  if (cancelled) return undefined;
  if (!end) return fail('We lost your face at the end');

  ptext.textContent = 'Checking…'; msg.textContent = reverify ? 'Comparing with your verified face' : 'Comparing your face with your ID card';
  const res = await api.post(reverify ? '/kyc/reverify/submit' : '/kyc/face/submit', {
    nonce: ch.nonce, steps, descriptor: face.toArray(neutral.descriptor), end_descriptor: face.toArray(end.descriptor), snapshot, lighting: Math.round(lightAtStart),
  }).catch((err) => { fail(err.message); return null; });
  if (!res) return undefined;

  if (['mismatch', 'liveness'].includes(res.result)) {
    say('Warning. Face does not match.');
    if (!reverify) c.st.fails += 1;
    screen(el, {
      title: reverify ? 'Security check' : 'Face Verification', back: () => faceIntro(c, reverify),
      body: html`<div class="m-card center"><div class="hero-ic bad">${icon('x')}</div>
        <h2 class="down">Warning: Face does not match</h2>
        <p class="muted">${reverify ? 'Your face did not match your verified face.' : 'Your face did not match the photo on your ID card. Make sure you used your own card.'}
        Try again in good light. You have <b>${res.attempts_left}</b> attempt${res.attempts_left === 1 ? '' : 's'} left before an admin reviews it.</p>
        <button class="btn block lg mt" id="again">Try again</button>
        ${reverify ? '' : html`<button class="btn ghost block mt-s" id="redo-id">Retake ID card photos</button>`}</div>`,
    });
    $('#again', el).onclick = () => faceIntro(c, reverify);
    $('#redo-id', el)?.addEventListener('click', () => { c.shots = { front: false, back: false }; c.go('id'); });
    return undefined;
  }
  say(res.result === 'passed' ? 'Thank you. You are verified.' : res.result === 'locked' ? 'Your account is on hold' : 'Verification submitted');
  await afterAuth();
  return undefined;
}

// ---------- After submitting (mockup: "KYC Submitted") ----------
function statusScreen(el, { ok = true, warn = false, title, lines, button = 'Back to Home', onButton }) {
  mount(el, html`<div class="m-screen center-col">
    <div class="m-card center status-card">
      <div class="big-check ${ok ? '' : warn ? 'warn' : 'bad'}">${icon(ok ? 'check' : warn ? 'clock' : 'x')}</div>
      <h2 class="${ok ? 'up' : ''}">${title}</h2>
      ${lines.map((l) => html`<p class="muted">${l}</p>`)}
      <button class="btn block lg mt" id="sb">${button}</button>
      <button class="btn ghost block mt-s" id="so">${icon('logout')} Log out</button>
    </div></div>`);
  $('#sb', el).onclick = (e) => busy(e.currentTarget, onButton);
  $('#so', el).onclick = logout;
}

export async function kycPending({ el }) {
  const review = state.me.kyc_status === 'review';
  statusScreen(el, {
    ok: !review, warn: review,
    title: review ? 'Manual review' : 'KYC Submitted',
    lines: review
      ? ['We could not automatically match your face to your ID card.', 'An admin will review it. No action is needed from you.']
      : ['Your KYC is under review.', "We'll notify you once it's approved."],
    onButton: async () => { await afterAuth(); if (state.stage === 'kyc_pending') toast('Still under review. We will email you.', 'err'); },
  });
  const t = setInterval(() => { if (!document.hidden) afterAuth().catch(() => {}); }, 30000);
  return () => clearInterval(t);
}

export async function kycRejected({ el }) {
  statusScreen(el, {
    ok: false, title: 'Verification not approved',
    lines: [state.me.kyc_note ? `Reason: ${state.me.kyc_note}` : 'An admin could not approve your verification.', 'Please contact an admin of the group.'],
    button: 'Check again', onButton: () => afterAuth(),
  });
}

// ---------- Quick security re-check (new device, password change, ...) ----------
export async function reverify({ el }) {
  face.loadLive().catch(() => {});
  face.loadFace().catch(() => {});
  const c = { el, note: '', st: { fails: 0, max_fails: 3 }, shots: {} };
  faceIntro(c, true);
  return () => { stopCamera(); face.stopVoice(); };
}

export async function reverifyLocked({ el }) {
  statusScreen(el, {
    ok: false, warn: true, title: 'Account on hold',
    lines: ['We could not confirm it was you after several tries, so your account is on hold for your safety.', 'An admin has been notified and will review it.'],
    button: 'Check again',
    onButton: async () => { await afterAuth(); if (state.stage === 'reverify_locked') toast('Still on hold', 'err'); },
  });
}
