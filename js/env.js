import * as THREE from 'three';

// A tiny photo studio rendered into a cube map: warm gradient walls plus
// bright softboxes. Metals reflect it; the diamond refracts it for sparkle.
export function buildStudioEnv(renderer, size = 512) {
  const scene = new THREE.Scene();

  const walls = new THREE.Mesh(
    new THREE.SphereGeometry(50, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 top = vec3(1.25, 1.2, 1.12);
          vec3 mid = vec3(0.40, 0.37, 0.34);
          vec3 low = vec3(0.04, 0.035, 0.03);
          vec3 c = y > 0.0 ? mix(mid, top, pow(y, 0.8)) : mix(mid, low, pow(-y, 0.45));
          // soft dark band near the horizon gives metals their contrast lines
          c *= 1.0 - 0.8 * exp(-pow((y + 0.04) / 0.08, 2.0));
          c *= 1.0 - 0.5 * exp(-pow((y - 0.35) / 0.05, 2.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  scene.add(walls);

  const warm = new THREE.Color(1.0, 0.96, 0.9);
  const panel = (w, h, pos, k) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: warm.clone().multiplyScalar(k), side: THREE.DoubleSide })
    );
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(22, 22, new THREE.Vector3(0, 24, 0), 3.2); // overhead softbox
  panel(5, 26, new THREE.Vector3(-20, 4, 8), 9.0); // key strip (left)
  panel(4, 24, new THREE.Vector3(19, 3, 5), 7.0); // rim strip (right)
  panel(16, 4, new THREE.Vector3(0, 9, 20), 2.6); // front fill
  panel(12, 6, new THREE.Vector3(2, 6, -20), 2.4); // back
  // small hot spots so facets catch pin-point highlights
  const rnd = mulberry32(7);
  for (let i = 0; i < 22; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = 0.15 + rnd() * 1.1;
    const p = new THREE.Vector3(Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)).multiplyScalar(30);
    panel(1.6 + rnd() * 1.5, 1.6 + rnd() * 1.5, p, 10 + rnd() * 8);
  }

  const rt = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cam = new THREE.CubeCamera(0.1, 100, rt);
  cam.update(renderer, scene);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const pm = pmrem.fromCubemap(rt.texture).texture;
  pmrem.dispose();

  return { cube: rt.texture, pmrem: pm };
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
