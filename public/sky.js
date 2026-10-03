// Deep-space backdrop for the search page: a star shell all around, a spiral galaxy in the
// distance, nebula clouds with dark dust lanes, and a few far galaxies. The camera drifts
// slowly and leans toward the pointer. Point shader adapted from the Verax site sky.

import * as THREE from "/vendor/three-0.184.0.module.min.js";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0) / 4294967296);
}
const gauss = (r) => (r() + r() + r() - 1.5) * 1.6;

const POINT_VERT = `
  attribute float aSize; attribute float aPhase; attribute vec3 aColor;
  uniform float uTime; uniform float uScale;
  varying vec3 vColor; varying float vTw;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vTw = 0.72 + 0.28 * sin(uTime * 1.1 + aPhase * 6.2831);
    gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.0, 22.0);
    vColor = aColor;
    gl_Position = projectionMatrix * mv;
  }`;
const POINT_FRAG = `
  precision mediump float;
  varying vec3 vColor; varying float vTw;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = smoothstep(1.0, 0.0, d);
    a = a * a + 0.6 * smoothstep(0.25, 0.0, d);
    gl_FragColor = vec4(vColor * vTw, a * vTw);
  }`;

function points(list, scale) {
  const n = list.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), ph = new Float32Array(n);
  const c = new THREE.Color();
  list.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    c.setHex(p.c); col.set([c.r, c.g, c.b], i * 3);
    sz[i] = p.s; ph[i] = p.ph;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: scale },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function tex(draw, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = () => tex((g, s) => {
  const h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,255,255,.75)");
  gr.addColorStop(0.5, "rgba(255,255,255,.18)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}, 128);
// a wispy cloud: many soft blobs, denser in the middle, faded to zero at the edge
const cloudTex = (seed) => tex((g, s) => {
  const r = rng(seed), h = s / 2;
  // filaments: blobs strung along a few curving strands, so the cloud reads as wisps, not balls
  for (let f = 0; f < 7; f++) {
    let x = h + (r() - 0.5) * s * 0.5, y = h + (r() - 0.5) * s * 0.5, dir = r() * Math.PI * 2;
    for (let i = 0; i < 70; i++) {
      dir += (r() - 0.5) * 0.5;
      x += Math.cos(dir) * s * 0.012; y += Math.sin(dir) * s * 0.012;
      const R = s * (0.02 + r() * 0.07);
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(255,255,255,${0.025 + r() * 0.05})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  }
  // a faint body under the strands
  for (let i = 0; i < 40; i++) {
    const x = h + gauss(r) * s * 0.12, y = h + gauss(r) * s * 0.1, R = s * (0.08 + r() * 0.15);
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, "rgba(255,255,255,.018)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  g.globalCompositeOperation = "destination-in";
  const fade = g.createRadialGradient(h, h, 0, h, h, h);
  fade.addColorStop(0.35, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade; g.fillRect(0, 0, s, s);
}, 512);

function sprite(map, color, scale, opacity, blending = THREE.AdditiveBlending) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending }));
  s.scale.set(scale, scale * 0.8, 1);
  return s;
}

export function mountSky(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = (navigator.hardwareConcurrency || 4) <= 4 || innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lite ? 1.25 : 1.6));
  renderer.setClearColor(0x03040a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
  const uScale = { value: 1 };
  const r = rng(20261004);
  const glow = glowTex();

  // 1. the star shell all around us
  const shell = [];
  for (let i = 0; i < (lite ? 5000 : 11000); i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 380 + r() * 900, k = Math.sqrt(1 - u * u);
    const t = r();
    shell.push({ x: k * Math.cos(th) * rad, y: u * rad * 0.8, z: k * Math.sin(th) * rad,
      c: t < 0.12 ? 0xaecbff : t < 0.2 ? 0xffd9b0 : t < 0.24 ? 0xffb0b0 : 0xffffff,
      s: r() < 0.03 ? 14 + r() * 14 : 3 + r() * 7, ph: r() });
  }
  scene.add(points(shell, uScale));

  // 2. a spiral galaxy, far off to the upper right, tilted toward us
  const galaxy = new THREE.Group();
  const ARMS = 2, R0 = 4, R1 = 95, SWEEP = Math.PI * 2.4, B = Math.log(R1 / R0) / SWEEP;
  const gal = [];
  for (let i = 0; i < (lite ? 7000 : 16000); i++) {
    const arm = i % ARMS, t = 0.06 + Math.pow(r(), 0.8) * 0.94, th = t * SWEEP;
    const rad = R0 * Math.exp(B * th), a = th + (arm * Math.PI * 2) / ARMS, spread = 1 + 7 * t;
    const x = Math.cos(a) * rad + gauss(r) * spread, z = Math.sin(a) * rad + gauss(r) * spread;
    const q = r();
    gal.push({ x, y: gauss(r) * (0.8 + 2 * (1 - t)), z,
      c: t < 0.18 ? (q < 0.6 ? 0xffe2b8 : 0xfff2dd) : q < 0.55 ? 0xb9d2ff : q < 0.75 ? 0xffffff : q < 0.8 ? 0xff9ec4 : 0xd7e4ff,
      s: 1.3 + r() * 2.6, ph: r() });
  }
  galaxy.add(points(gal, uScale));
  galaxy.add(sprite(glow, 0xffe6c4, 46, 0.55), sprite(glow, 0xffffff, 14, 0.8));
  for (let k = 0; k < ARMS; k++) for (let j = 0; j < 26; j++) {
    const t = 0.1 + (j / 26) * 0.85, th = t * SWEEP, rad = R0 * Math.exp(B * th), a = th + (k * Math.PI * 2) / ARMS;
    const h = sprite(glow, 0x7fa6e0, 14 + 24 * t, 0.06);
    h.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    galaxy.add(h);
  }
  galaxy.position.set(250, 135, -480);
  galaxy.rotation.set(1.05, 0.3, -0.35);
  scene.add(galaxy);

  // 3. nebula: coloured clouds, then dark dust lanes laid over them
  const nebula = new THREE.Group();
  const hues = [0x5a6fd8, 0x3f8fb8, 0x7e5cc8, 0x6f7fb0, 0xa86a90, 0x8fa2c8];
  const cloudMaps = [11, 23, 37, 41, 53, 67].map(cloudTex);
  for (let i = 0; i < (lite ? 26 : 46); i++) {
    const s = sprite(cloudMaps[i % cloudMaps.length], hues[i % hues.length], 260 + r() * 420, 0.45 + r() * 0.35);
    s.scale.x *= 1.2 + r() * 0.9;
    s.position.set((r() - 0.5) * 900, (r() - 0.5) * 420, -220 - r() * 600);
    s.material.rotation = r() * Math.PI * 2;
    nebula.add(s);
  }
  for (let i = 0; i < (lite ? 10 : 18); i++) {
    const s = sprite(cloudMaps[i % cloudMaps.length], 0x000000, 140 + r() * 260, 0.35 + r() * 0.25, THREE.NormalBlending);
    s.position.set((r() - 0.5) * 800, (r() - 0.5) * 360, -200 - r() * 500);
    s.material.rotation = r() * Math.PI * 2;
    nebula.add(s);
  }
  scene.add(nebula);

  // 4. a handful of far galaxies: small tilted smudges
  for (let i = 0; i < 9; i++) {
    const s = sprite(glow, r() < 0.5 ? 0xd8c8ff : 0xffe0c0, 10 + r() * 14, 0.35);
    s.scale.y *= 0.35 + r() * 0.3;
    s.material.rotation = r() * Math.PI;
    s.position.set((r() - 0.5) * 1600, (r() - 0.5) * 800, -700 - r() * 500);
    scene.add(s);
  }

  // motion: a slow drift, a lean toward the pointer, the galaxy turning on its own axis
  let px = 0, py = 0, lx = 0, ly = 0, visible = true, raf = 0;
  addEventListener("pointermove", (e) => { px = e.clientX / innerWidth * 2 - 1; py = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible && !reduce) loop(); });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uScale.value = (h * 0.5) / Math.tan((camera.fov * Math.PI) / 360) * renderer.getPixelRatio() * 0.22;
  }
  addEventListener("resize", resize);
  resize();

  const t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    lx += (px - lx) * 0.03; ly += (py - ly) * 0.03;
    const yaw = t * 0.006 + lx * 0.06, pitch = -ly * 0.035;
    camera.position.set(Math.sin(t * 0.03) * 6, Math.sin(t * 0.021) * 3, 0);
    camera.lookAt(Math.sin(yaw) * 100, Math.sin(pitch) * 100 + 4, -Math.cos(yaw) * 100);
    galaxy.rotation.y = 0.3 + t * 0.01;
    scene.traverse((o) => { if (o.material?.uniforms?.uTime) o.material.uniforms.uTime.value = t; });
    renderer.render(scene, camera);
  }
  function loop(now = performance.now()) {
    if (!visible) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  }
  if (reduce) frame(t0 + 20000); else loop();
  return () => cancelAnimationFrame(raf);
}
