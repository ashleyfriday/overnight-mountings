import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from './env.js';

// Ionic column, built entirely from code. Units: the top of the abacus sits at y = 0.
export function buildPillar() {
  const mat = stoneMaterial();
  const g = new THREE.Group();
  const add = (geo, y = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // Abacus: square slab with a thinner stepped moulding below
  add(new RoundedBoxGeometry(4.4, 0.36, 4.4, 4, 0.045), -0.18);
  add(new RoundedBoxGeometry(4.12, 0.1, 4.12, 3, 0.03), -0.41);

  // Canalis: the band that runs between the two volutes
  add(new RoundedBoxGeometry(3.3, 0.34, 2.3, 4, 0.06), -0.62);

  // Volutes (scroll rolls) at both ends
  for (const side of [-1, 1]) {
    const roll = add(volutRollGeometry(), 0);
    roll.position.set(side * 1.6, -0.96, 0);
    for (const face of [-1, 1]) {
      const spiral = add(spiralGeometry(side, face), 0);
      spiral.position.set(side * 1.6, -0.96, 0);
      const eye = add(new THREE.SphereGeometry(0.085, 20, 12), 0);
      eye.position.set(side * 1.6, -0.96, face * 1.17);
      eye.scale.z = 0.6;
    }
  }

  // Sagging lower edge of the canalis, front and back
  for (const face of [-1, 1]) {
    const pts = [
      [-1.52, -0.6], [-1.15, -0.74], [-0.6, -0.8], [0, -0.82], [0.6, -0.8], [1.15, -0.74], [1.52, -0.6],
    ].map(([x, y]) => new THREE.Vector3(x, y, face * 1.165));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.032, 8, false), 0);
  }

  // Echinus with egg-and-dart, astragal bead, fillet, then the fluted shaft
  add(echinusGeometry(), 0);
  const astragal = add(new THREE.TorusGeometry(1.29, 0.07, 18, 160), -1.24);
  astragal.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(1.24, 1.24, 0.08, 96), -1.33);
  add(flutedShaftGeometry(), 0);

  return g;
}

function stoneMaterial() {
  // Soft marble-plaster texture drawn on a canvas
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3eee7';
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(11);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size, y = rnd() * size, r = rnd() * 22 + 2;
    const shade = 225 + rnd() * 30;
    ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 14},${0.05 + rnd() * 0.06})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(190,178,165,0.10)';
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = 0.6 + rnd() * 1.2;
    ctx.beginPath();
    let x = rnd() * size, y = 0;
    ctx.moveTo(x, y);
    while (y < size) { x += (rnd() - 0.5) * 30; y += 14 + rnd() * 20; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  return new THREE.MeshStandardMaterial({
    color: 0xf4efe8,
    map: tex,
    roughness: 0.82,
    metalness: 0,
    envMapIntensity: 0.55,
  });
}

// Scroll roll: a lathe whose axis runs front-to-back, pinched in the middle (balteus)
function volutRollGeometry() {
  const L = 1.17, R = 0.5;
  const pts = [new THREE.Vector2(0.0001, -L)];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = -L + t * 2 * L;
    const pinch = 1 - 0.24 * Math.pow(Math.sin(Math.PI * t), 1.6);
    const band = 0.02 * Math.exp(-Math.pow((t - 0.5) / 0.03, 2)); // the centre belt
    const edge = t < 0.02 || t > 0.98 ? -0.02 : 0;
    pts.push(new THREE.Vector2(R * pinch + band + edge, z));
  }
  pts.push(new THREE.Vector2(0.0001, L));
  const geo = new THREE.LatheGeometry(pts, 72);
  geo.rotateX(Math.PI / 2);
  return geo;
}

// Raised spiral ridge on the face of a volute
function spiralGeometry(side, face) {
  const pts = [];
  const turns = 2.4;
  const n = 140;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI / 2 - side * t * turns * Math.PI * 2;
    const r = 0.47 * Math.pow(1 - t, 0.85) + 0.09;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, face * 1.172));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, 0.03, 8, false);
}

// Quarter-round moulding with egg-and-dart relief
function echinusGeometry() {
  const nT = 420, nY = 48;
  const yTop = -0.66, yBot = -1.2;
  const eggs = 22;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nY; j++) {
    const v = j / nY; // 0 top -> 1 bottom
    const y = yTop + (yBot - yTop) * v;
    const base = 1.25 + 0.2 * Math.cos(v * Math.PI / 2);
    for (let i = 0; i <= nT; i++) {
      const u = i / nT;
      const th = u * Math.PI * 2;
      const f = (u * eggs) % 1; // position within one egg cell
      const ex = (f - 0.5) / 0.36;
      const ev = (v - 0.55) / 0.36;
      const d = Math.sqrt(ex * ex + ev * ev * (1 + 0.25 * ev));
      let disp = 0;
      if (d < 1) disp += 0.075 * Math.sqrt(1 - d * d); // egg
      disp += 0.03 * Math.exp(-Math.pow((d - 1.18) / 0.1, 2)); // shell rim
      const dart = Math.abs(f - 0) < 0.06 || Math.abs(f - 1) < 0.06 ? 1 : 0;
      disp += dart * 0.035 * Math.max(0, 1 - Math.abs(ev)) * (1 - Math.min(f, 1 - f) / 0.06);
      disp *= Math.sin(Math.PI * Math.min(1, Math.max(0, (v - 0.08) / 0.84)));
      const r = base + disp;
      pos.push(Math.sin(th) * r, y, Math.cos(th) * r);
      uv.push(u * 3, v);
    }
  }
  gridIndex(idx, nT, nY);
  return finish(pos, uv, idx);
}

function flutedShaftGeometry() {
  const flutes = 24, perFlute = 18;
  const nT = flutes * perFlute;
  const yTop = -1.36, yBot = -18;
  const ys = [];
  for (let j = 0; j <= 24; j++) ys.push(yTop - 0.5 * Math.pow(j / 24, 1.6)); // dense near the top
  for (let j = 1; j <= 30; j++) ys.push(yTop - 0.5 - (yBot - (yTop - 0.5)) * -(j / 30));
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < ys.length; j++) {
    const y = ys[j];
    const k = (yTop - y) / (yTop - yBot);
    const R = 1.21 + 0.11 * k; // gentle entasis toward the base
    const fade = smoothstep(0, 0.32, yTop - y); // rounded flute ends
    for (let i = 0; i <= nT; i++) {
      const u = i / nT;
      const th = u * Math.PI * 2;
      const f = (u * flutes) % 1;
      const fillet = 0.16;
      let groove = 0;
      if (f > fillet / 2 && f < 1 - fillet / 2) {
        const s = (f - fillet / 2) / (1 - fillet); // 0..1 across the groove
        groove = Math.sqrt(Math.max(0, 1 - Math.pow(2 * s - 1, 2)));
      }
      const r = R - 0.085 * groove * fade;
      pos.push(Math.sin(th) * r, y, Math.cos(th) * r);
      uv.push(u * 4, y * 0.35);
    }
  }
  gridIndex(idx, nT, ys.length - 1);
  return finish(pos, uv, idx);
}

function gridIndex(idx, nT, nY) {
  const row = nT + 1;
  for (let j = 0; j < nY; j++) {
    for (let i = 0; i < nT; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
}

function finish(pos, uv, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
