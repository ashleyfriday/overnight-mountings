import * as THREE from 'three';

// Ring coordinates: the band lies in the XY plane (finger hole along Z),
// inner radius 1, with the head on top at +Y.
const R = 1;

export const RING_STYLES = [
  { id: 'four-thin', category: 'Solitaire', name: 'Four prong, thin band', price: 1240, popular: 1,
    band: { width: 0.17, thick: 0.14 }, head: { type: 'prong', prongs: 4 } },
  { id: 'six-knife', category: 'Solitaire', name: 'Six prong, knife edge', price: 1380, popular: 2,
    band: { width: 0.18, thick: 0.15, knife: 0.55 }, head: { type: 'prong', prongs: 6 } },
  { id: 'bezel-low', category: 'Solitaire', name: 'Bezel set, low profile', price: 1160, popular: 3,
    band: { width: 0.19, thick: 0.15 }, head: { type: 'bezel' } },
  { id: 'cathedral', category: 'Solitaire', name: 'Cathedral, tapered band', price: 1420, popular: 4,
    band: { width: 0.24, thick: 0.15, taper: 0.45 }, head: { type: 'prong', prongs: 4, cathedral: true } },
  { id: 'hidden-accent', category: 'Hidden halo', name: 'Hidden accent, plain band', price: 1510, popular: 5,
    band: { width: 0.18, thick: 0.15 }, head: { type: 'prong', prongs: 4, hiddenHalo: true } },
  { id: 'twisted-petite', category: 'Twist', name: 'Twisted prong, petite', price: 1290, popular: 6,
    band: { width: 0.13, thick: 0.12 }, head: { type: 'prong', prongs: 4, twist: 0.9, stone: 0.33 } },
  { id: 'trellis', category: 'Solitaire', name: 'Trellis prong, comfort fit', price: 1350, popular: 7, more: true,
    band: { width: 0.18, thick: 0.15 }, head: { type: 'prong', prongs: 4, trellis: true } },
  { id: 'six-classic', category: 'Solitaire', name: 'Six prong, high set', price: 1330, popular: 8, more: true,
    band: { width: 0.16, thick: 0.14 }, head: { type: 'prong', prongs: 6, high: 0.12 } },
];

export function createMaterials(env) {
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xeceded,
    metalness: 1,
    roughness: 0.06,
    envMap: env.pmrem,
    envMapIntensity: 1.4,
    clearcoat: 0.3,
    clearcoatRoughness: 0.05,
  });
  const diamond = diamondMaterial(env.cube);
  return { metal, diamond };
}

export function buildRing(style, mats) {
  const group = new THREE.Group();
  const b = style.band;
  const tTop = b.thick * (1 + 0.25 * (b.taper ? 1 : 0.6));
  const band = new THREE.Mesh(bandGeometry(b), mats.metal);
  group.add(band);

  const head = buildHead(style, mats, b, tTop);
  head.position.y = R + tTop * 0.92;
  group.add(head);
  group.userData.stone = head.userData.stone;

  if (style.head.cathedral) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const a = Math.PI / 2 + sx * 0.62;
        const rr = R + b.thick * 0.6;
        const p0 = new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, sz * b.width * 0.22);
        const top = R + tTop;
        const pts = [
          p0,
          new THREE.Vector3(sx * 0.3, top + 0.02, sz * 0.07),
          new THREE.Vector3(sx * 0.17, top + 0.16, sz * 0.075),
          new THREE.Vector3(sx * 0.12, top + 0.26, sz * 0.07),
        ];
        const arch = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 40, 0.034, 10, false),
          mats.metal
        );
        group.add(arch);
      }
    }
  }

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

// ---------- Band: profile swept around a circle ----------
function bandGeometry({ width: w0, thick: t0, taper = 0, knife = 0 }) {
  const segs = 300, prof = 40;
  const pos = [], idx = [];
  const spow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * Math.PI * 2;
    const top = Math.pow((1 + Math.sin(th)) / 2, 6); // 1 at the head, 0 at the base
    const w = w0 * (1 - taper * top);
    const t = t0 * (1 + 0.25 * top * (taper ? 1 : 0.6));
    for (let j = 0; j < prof; j++) {
      const s = (j / prof) * Math.PI * 2;
      const cu = spow(Math.cos(s), 0.55);
      const v = (w / 2) * spow(Math.sin(s), 0.45);
      let u = t / 2 + (t / 2) * cu;
      if (cu > 0 && knife) u += knife * t * cu * (1 - Math.abs(v) / (w / 2)) * 0.6;
      if (cu < 0) u -= 0.012 * (1 - Math.pow((2 * v) / w, 2)); // comfort-fit dome inside
      const rr = R + u;
      pos.push(Math.cos(th) * rr, Math.sin(th) * rr, v);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < prof; j++) {
      const a = i * prof + j;
      const b = ((i + 1) % segs) * prof + j;
      const c = ((i + 1) % segs) * prof + ((j + 1) % prof);
      const d = i * prof + ((j + 1) % prof);
      idx.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------- Head: stone + prongs / bezel ----------
function buildHead(style, mats, band, tTop) {
  const h = style.head;
  const g = new THREE.Group();
  const gR = h.stone || 0.37;
  const { geometry, dims } = brilliantGeometry(gR);

  const stone = new THREE.Mesh(geometry, mats.diamond);
  let culetY = 0.05 + (h.high || 0);
  if (h.type === 'bezel') culetY = -0.1;
  const girdleY = culetY + dims.pav + dims.girdle / 2;
  stone.position.y = girdleY;
  stone.userData.baseY = girdleY;
  g.add(stone);
  g.userData.stone = stone;

  if (h.type === 'bezel') {
    const lip = gR + 0.055;
    const pts = [
      [0.09, -0.06], [0.16, -0.02], [lip - 0.03, girdleY - 0.16], [lip, girdleY - 0.07],
      [lip + 0.004, girdleY + 0.035], [lip - 0.02, girdleY + 0.055], [gR - 0.012, girdleY + 0.045],
      [gR - 0.02, girdleY - 0.02], [gR * 0.6, girdleY - 0.14],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const mat = mats.metal.clone();
    mat.side = THREE.DoubleSide;
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), mat);
    g.add(cup);
    return g;
  }

  const n = h.prongs;
  const pr = n === 6 ? 0.034 : 0.04;
  const twist = h.twist || 0;
  const railY = culetY + dims.pav * 0.38;
  let railR = 0;
  for (let k = 0; k < n; k++) {
    const phi0 = (k / n) * Math.PI * 2 + Math.PI / n;
    let dir = twist ? 1 : 0;
    let amt = twist;
    if (h.trellis) { dir = k % 2 ? 1 : -1; amt = (Math.PI / n) * 1.0; }
    const prof = [
      [0.07, -0.08, 0],
      [0.13, 0.04, 0.15],
      [gR * 0.5, culetY + dims.pav * 0.38, 0.4],
      [gR * 0.86 + pr * 0.3, culetY + dims.pav * 0.82, 0.75],
      [gR + pr * 0.55, girdleY, 0.92],
      [gR * 0.93 + pr * 0.2, girdleY + dims.crown * 0.55, 1],
    ];
    const pts = prof.map(([r, y, t]) => {
      const phi = phi0 + dir * amt * (t - 1);
      return new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
    });
    railR = gR * 0.5;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, pr, 12, false), mats.metal));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(pr * 1.08, 20, 14), mats.metal);
    tip.position.copy(pts[pts.length - 1]);
    tip.scale.y = 0.8;
    g.add(tip);
  }

  // Gallery rail that ties the prongs together
  const rail = new THREE.Mesh(new THREE.TorusGeometry(railR, 0.026, 10, 64), mats.metal);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = railY;
  g.add(rail);

  if (h.hiddenHalo) {
    const hy = girdleY - 0.13;
    const hr = gR * 0.86;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(hr, 0.045, 12, 96), mats.metal);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = hy;
    g.add(halo);
    const melee = brilliantGeometry(0.042).geometry;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5) / count) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize();
      const m = new THREE.Mesh(melee, mats.diamond);
      m.position.set(Math.cos(a) * (hr + 0.035), hy - 0.012, Math.sin(a) * (hr + 0.035));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
      g.add(m);
    }
  }
  return g;
}

// ---------- Round brilliant cut (57 facets) ----------
export function brilliantGeometry(gR) {
  const D = 2 * gR;
  const crown = 0.15 * D, pav = 0.43 * D, girdle = 0.025 * D;
  const gTop = girdle / 2, gBot = -girdle / 2;
  const rt = 0.57 * gR, rs = 0.79 * gR, rp = 0.3 * gR;
  const tableY = gTop + crown;
  const culetY = gBot - pav;
  const crownY = (r) => gTop + (crown * (gR - r)) / (gR - rt);
  const pavY = (r) => gBot - pav * (1 - r / gR);
  const P = (r, a, y) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  const d45 = Math.PI / 4, d22 = Math.PI / 8;

  const Ct = new THREE.Vector3(0, tableY, 0);
  const C = new THREE.Vector3(0, culetY, 0);
  const T = [], S = [], G = [], GB = [], PV = [];
  for (let k = 0; k < 8; k++) {
    T.push(P(rt, k * d45, tableY));
    S.push(P(rs, k * d45 + d22, crownY(rs) + crown * 0.04));
    PV.push(P(rp, k * d45, pavY(rp)));
  }
  for (let j = 0; j < 16; j++) {
    G.push(P(gR, j * d22, gTop));
    GB.push(P(gR, j * d22, gBot));
  }
  const tris = [];
  const m8 = (i) => (i + 8) % 8, m16 = (i) => (i + 16) % 16;
  for (let k = 0; k < 8; k++) {
    tris.push([Ct, T[k], T[m8(k + 1)]]); // table
    tris.push([T[k], S[k], T[m8(k + 1)]]); // star
    tris.push([T[k], S[m8(k - 1)], G[2 * k]]); // bezel (kite) halves
    tris.push([T[k], G[2 * k], S[k]]);
    tris.push([S[k], G[2 * k], G[m16(2 * k + 1)]]); // upper girdle
    tris.push([S[k], G[m16(2 * k + 1)], G[m16(2 * k + 2)]]);
    tris.push([PV[k], GB[m16(2 * k - 1)], GB[2 * k]]); // lower girdle
    tris.push([PV[k], GB[2 * k], GB[m16(2 * k + 1)]]);
    tris.push([PV[k], GB[m16(2 * k + 1)], PV[m8(k + 1)]]); // pavilion main
    tris.push([C, PV[k], PV[m8(k + 1)]]);
  }
  for (let j = 0; j < 16; j++) {
    tris.push([G[j], GB[j], GB[m16(j + 1)]]);
    tris.push([G[j], GB[m16(j + 1)], G[m16(j + 1)]]);
  }
  // Make every face point outward (the cut is convex around the origin)
  const pos = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  for (const [a, b, d] of tris) {
    e1.subVectors(b, a); e2.subVectors(d, a); n.crossVectors(e1, e2);
    c.copy(a).add(b).add(d).divideScalar(3);
    const ordered = n.dot(c) >= 0 ? [a, b, d] : [a, d, b];
    for (const v of ordered) pos.push(v.x, v.y, v.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  return { geometry, dims: { crown, pav, girdle } };
}

// Fake-but-pretty diamond: Fresnel reflection plus a dispersed internal bounce
export function diamondMaterial(envCube) {
  return new THREE.ShaderMaterial({
    uniforms: { envMap: { value: envCube } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vUp;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vUp = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform samplerCube envMap;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vUp;
      vec3 hash3(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yxz + 19.19);
        return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0;
      }
      vec3 env(vec3 d) { return textureCube(envMap, d).rgb; }
      vec3 bounce(vec3 V, vec3 N, vec3 Nm, vec3 U, vec3 jit, float ior) {
        vec3 T = refract(V, N, 1.0 / ior);
        vec3 B = reflect(T, Nm);
        B = reflect(B, normalize(Nm * vec3(-1.0, 1.0, -1.0)));
        B = normalize(B + jit);
        // a well-cut stone sends light back up: fold downward rays into the upper half
        float d = dot(B, U);
        if (d < 0.0) B -= 1.6 * d * U;
        return normalize(B + U * 0.25);
      }
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(vWorld - cameraPosition);
        if (dot(N, V) > 0.0) N = -N;
        vec3 U = normalize(vUp);
        float cosi = clamp(dot(-V, N), 0.0, 1.0);
        float F = 0.18 + 0.82 * pow(1.0 - cosi, 5.0);
        vec3 refl = env(reflect(V, N));
        vec3 Nm = normalize(N - 1.7 * dot(N, U) * U); // mirror toward the pavilion
        vec3 jit = hash3(floor(N * 31.0) + 0.37) * 0.6;
        vec3 inner;
        inner.r = env(bounce(V, N, Nm, U, jit, 2.38)).r;
        inner.g = env(bounce(V, N, Nm, U, jit, 2.42)).g;
        inner.b = env(bounce(V, N, Nm, U, jit, 2.47)).b;
        inner = pow(inner * 0.75, vec3(2.3)) * 1.7;
        float l = dot(inner, vec3(0.333));
        inner += smoothstep(1.4, 3.5, l) * 1.2; // hot sparkle
        vec3 col = mix(inner, refl, F);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
