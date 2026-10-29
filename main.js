import * as THREE from 'three';
import { buildStudioEnv } from './js/env.js';
import { buildPillar } from './js/pillar.js';
import { RING_STYLES, buildRing, createMaterials } from './js/ring.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => '$' + n.toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Renderer + scene
// ---------------------------------------------------------------------------
const stage = document.querySelector('.stage');
const canvas = document.getElementById('scene');
const panel = document.querySelector('.panel');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const env = buildStudioEnv(renderer);
const mats = createMaterials(env);

const scene = new THREE.Scene();
scene.environment = env.pmrem;

scene.add(new THREE.HemisphereLight(0xfff6ec, 0xb9a48e, 0.7));
const key = new THREE.DirectionalLight(0xfff0de, 3.0);
key.position.set(-8, 8, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -4;
key.shadow.camera.near = 1;
key.shadow.camera.far = 30;
key.shadow.radius = 6;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0xffe6d0, 0.8);
rim.position.set(7, 4, -5);
scene.add(rim);

const pillar = buildPillar();
scene.add(pillar);

// Ring hierarchy: root (float) -> pivot (user rotation) -> ring
const RING_Y = 1.75;
const ringRoot = new THREE.Group();
ringRoot.position.set(0, RING_Y, 0);
scene.add(ringRoot);
const ringPivot = new THREE.Group();
ringRoot.add(ringPivot);
const basePose = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.38, 0.8, 0.5, 'YXZ'));
let ringObj = null;

function setRing(style) {
  if (ringObj) {
    ringPivot.remove(ringObj);
    ringObj.traverse((o) => o.geometry && o.geometry.dispose());
  }
  ringObj = buildRing(style, mats);
  ringObj.position.y = -0.3; // pivot around the middle of band + head
  ringPivot.add(ringObj);
}

// ---------------------------------------------------------------------------
// Camera framing: the pillar sits centred in the stage (left of the panel)
// ---------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
const viewDir = new THREE.Vector3(0, 0.11, 1).normalize();
const frame = { dist: 30, offsetX: 0, visH: 12.4 };

function layout() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const wide = matchMedia('(min-width: 1040px)').matches;
  const stageW = wide ? panel.getBoundingClientRect().left : w;
  const cx = wide ? stageW / 2 + 30 : w / 2;
  frame.visH = Math.max(9.6, 6.4 / (stageW / h));
  frame.dist = frame.visH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  frame.offsetX = (cx / w - 0.5) * frame.visH * camera.aspect;
  frame.yShift = wide ? 0.05 : -0.4;
  camera.updateProjectionMatrix();
}
addEventListener('resize', layout);

// ---------------------------------------------------------------------------
// Interaction: drag to rotate (with inertia), wheel/pinch zoom, 360° spin
// ---------------------------------------------------------------------------
const state = {
  yaw: 0, pitch: 0, vYaw: 0, vPitch: 0,
  dragging: false, spin: false,
  zoom: 0, zoomTarget: 0,
  sep: 0, sepTarget: 0, settleUntil: 0, // stone separation
};
const pointers = new Map();
let pinchStart = 0, pinchZoom = 0, lastX = 0, lastY = 0, lastT = 0;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    pinchZoom = state.zoomTarget;
  }
  state.dragging = true;
  state.vYaw = state.vPitch = 0;
  lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    setZoom(pinchZoom + (d - pinchStart) / 300);
    return;
  }
  const now = performance.now();
  const dt = Math.max(1, now - lastT) / 1000;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  const k = 0.0085;
  state.yaw += dx * k;
  state.pitch = THREE.MathUtils.clamp(state.pitch + dy * k, -1.3, 1.3);
  state.vYaw = (dx * k) / dt;
  state.vPitch = (dy * k) / dt;
  lastX = e.clientX; lastY = e.clientY; lastT = now;
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    state.dragging = false;
    canvas.classList.remove('dragging');
    if (performance.now() - lastT > 80) state.vYaw = state.vPitch = 0;
  }
};
canvas.addEventListener('pointerup', endPointer);

canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoom(state.zoomTarget - e.deltaY * 0.0015);
}, { passive: false });

const spinBtn = document.getElementById('spinBtn');
const zoomBtn = document.getElementById('zoomBtn');
spinBtn.addEventListener('click', () => {
  state.spin = !state.spin;
  spinBtn.setAttribute('aria-pressed', String(state.spin));
});
zoomBtn.addEventListener('click', () => setZoom(state.zoomTarget > 0.5 ? 0 : 1));

// Split view: lift the diamond out of its setting and turn the ring to face the viewer
const splitBtn = document.getElementById('splitBtn');
splitBtn.addEventListener('click', () => {
  state.sepTarget = state.sepTarget ? 0 : 1;
  state.vYaw = state.vPitch = 0;
  state.settleUntil = clock.elapsedTime + 1.4;
  const on = state.sepTarget === 1;
  splitBtn.setAttribute('aria-pressed', String(on));
  splitBtn.setAttribute('aria-label', on ? 'Set the diamond back in the ring' : 'Separate the diamond from the ring');
  splitBtn.dataset.tip = on ? 'Set diamond back' : 'Separate diamond';
});
function setZoom(z) {
  state.zoomTarget = THREE.MathUtils.clamp(z, 0, 1);
  zoomBtn.setAttribute('aria-pressed', String(state.zoomTarget > 0.5));
  zoomBtn.dataset.tip = state.zoomTarget > 0.5 ? 'Zoom out' : 'Zoom in';
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const qYaw = new THREE.Quaternion(), qPitch = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const target = new THREE.Vector3();
const pose = new THREE.Quaternion();
const frontPose = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, 0, 0, 'YXZ'));

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!state.dragging) {
    state.yaw += state.vYaw * dt;
    state.pitch = THREE.MathUtils.clamp(state.pitch + state.vPitch * dt, -1.3, 1.3);
    const damp = Math.exp(-dt * 3.2);
    state.vYaw *= damp;
    state.vPitch *= damp;
    if (state.spin) state.yaw += dt * 0.9;
    // right after a double-tap, ease the ring back to facing the viewer
    if (t < state.settleUntil && !state.spin) {
      const k = 1 - Math.exp(-dt * 4);
      const goal = Math.round(state.yaw / (Math.PI * 2)) * Math.PI * 2;
      state.yaw += (goal - state.yaw) * k;
      state.pitch += (0 - state.pitch) * k;
    }
  }

  state.sep += (state.sepTarget - state.sep) * (1 - Math.exp(-dt * 3.5));
  const se = state.sep * state.sep * (3 - 2 * state.sep);
  pose.slerpQuaternions(basePose, frontPose, se);
  const stone = ringObj && ringObj.userData.stone;
  if (stone) {
    stone.position.y = stone.userData.baseY + se * 0.8 + (reduceMotion ? 0 : Math.sin(t * 1.7) * 0.03 * se);
    stone.rotation.y += dt * 0.5 * se;
  }
  const sway = reduceMotion ? 0 : Math.sin(t * 0.6) * 0.06;
  qYaw.setFromAxisAngle(Y, state.yaw + sway);
  qPitch.setFromAxisAngle(X, state.pitch);
  ringPivot.quaternion.copy(qYaw).multiply(qPitch).multiply(pose);
  ringRoot.position.y = RING_Y - se * 0.3 + (reduceMotion ? 0 : Math.sin(t * 1.1) * 0.06);

  // Camera: lerp between the full composition and a close-up on the ring
  state.zoom += (state.zoomTarget - state.zoom) * (1 - Math.exp(-dt * 5));
  const z = state.zoom * state.zoom * (3 - 2 * state.zoom);
  const dist = THREE.MathUtils.lerp(frame.dist, frame.dist * 0.5, z);
  const offset = frame.offsetX * (dist / frame.dist);
  target.set(-offset, THREE.MathUtils.lerp(frame.yShift, RING_Y + 0.1 + se * 0.15, z), 0);
  camera.position.copy(target).addScaledVector(viewDir, dist);
  camera.lookAt(target);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Builder panel UI
// ---------------------------------------------------------------------------
const grid = document.getElementById('grid');
const loadMore = document.getElementById('loadMore');
const sortSelect = document.getElementById('sortSelect');
const styleSelect = document.getElementById('styleSelect');
const styleVal = document.getElementById('styleVal');
const STYLE_FILTERS = ['All', 'Hidden halo', 'Three stone', 'Halo', 'Pavé', 'Nature inspired', 'Solitaire', 'Channel', 'Side stone', 'Vintage', 'Twist'];
styleSelect.innerHTML = STYLE_FILTERS.map((f) => `<option value="${f}">${f}</option>`).join('');
styleSelect.value = 'All';
styleVal.textContent = 'All';
const sortVal = document.getElementById('sortVal');
const thumbs = new Map();
let showMore = false;
let selected = RING_STYLES[0];

const checkSvg = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#24346d" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M3.75 9.38l3.37 3.37 7.13-7.13"/></svg>`;

function renderGrid() {
  const filter = styleSelect.value;
  const inStyle = RING_STYLES.filter((s) => filter === 'All' || s.category === filter);
  const list = inStyle.filter((s) => showMore || !s.more);
  const sort = sortSelect.value;
  list.sort((a, b) => (sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : a.popular - b.popular));
  grid.innerHTML = '';
  for (const s of list) {
    const card = document.createElement('button');
    card.className = 'card';
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', String(s === selected));
    card.innerHTML = `
      <div class="photo">
        <img alt="${s.name} solitaire ring" ${thumbs.has(s.id) ? `src="${thumbs.get(s.id)}" class="ready"` : ''} data-id="${s.id}" />
        <span class="check">${checkSvg}</span>
      </div>
      <div class="meta">
        <p class="kind">${s.category}</p>
        <p class="name">${s.name}</p>
        <p class="from">From ${fmt(s.price)}</p>
      </div>`;
    card.addEventListener('click', () => select(s));
    grid.appendChild(card);
  }
  if (!list.length) {
    grid.innerHTML = `<div class="empty"><p class="empty-title">No ${filter.toLowerCase()} rings yet</p><p class="empty-copy">We're still crafting these. Try another style, or view all rings.</p><button class="btn secondary small" type="button">View all</button></div>`;
    grid.querySelector('.empty button').addEventListener('click', () => {
      styleSelect.value = 'All';
      styleSelect.dispatchEvent(new Event('change'));
    });
  }
  loadMore.hidden = showMore || inStyle.length === list.length;
}

function select(s) {
  selected = s;
  setRing(s);
  grid.querySelectorAll('.card').forEach((c) => {
    c.setAttribute('aria-selected', String(c.querySelector('img').dataset.id === s.id));
  });
  document.getElementById('shownTitle').textContent = s.category + ' · ' + s.name.charAt(0).toLowerCase() + s.name.slice(1);
  document.getElementById('summaryName').textContent = s.category + ' · ' + s.name;
  document.getElementById('summaryPrice').textContent = fmt(s.price);
}

styleSelect.addEventListener('change', () => {
  styleVal.textContent = styleSelect.value;
  renderGrid();
});
sortSelect.addEventListener('change', () => {
  sortVal.textContent = sortSelect.selectedOptions[0].textContent;
  renderGrid();
});
loadMore.addEventListener('click', () => {
  showMore = true;
  renderGrid();
});

// Card photos are rendered from the same 3D models in a separate renderer
function renderThumbnails() {
  const size = 420;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size, false);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.95;
  const tEnv = buildStudioEnv(r, 256);
  const tMats = createMaterials(tEnv);
  const s = new THREE.Scene();
  s.environment = tEnv.pmrem;
  s.add(new THREE.HemisphereLight(0xffffff, 0xd8d0c6, 0.35));
  const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
  cam.position.set(0, 1.2, 9.5);
  cam.lookAt(0, 0.18, 0);

  // One ring per frame so the main scene keeps animating while photos render
  const queue = [...RING_STYLES];
  const next = () => {
    const style = queue.shift();
    if (!style) {
      r.dispose();
      r.forceContextLoss();
      return;
    }
    const ring = buildRing(style, tMats);
    ring.position.y = -0.25;
    ring.rotation.x = -0.12;
    s.add(ring);
    r.render(s, cam);
    const url = r.domElement.toDataURL('image/png');
    thumbs.set(style.id, url);
    s.remove(ring);
    ring.traverse((o) => o.geometry && o.geometry.dispose());
    grid.querySelectorAll(`img[data-id="${style.id}"]`).forEach((img) => {
      img.onload = () => img.classList.add('ready');
      img.src = url;
    });
    requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
layout();
renderGrid();
select(selected);
tick();
document.getElementById('loading').classList.add('done');
requestAnimationFrame(() => setTimeout(renderThumbnails, 300));
