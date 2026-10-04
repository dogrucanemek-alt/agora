// Deep-space backdrop for the search page: a star shell all around and a few faint far
// galaxies. No nebula or galaxy band: plain stars read cleaner behind text. The camera drifts
// slowly and leans toward the pointer. Point shader adapted from the Verax site sky.
// Client-only: mounted from components/Sky.tsx.

import * as THREE from "three";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0) / 4294967296);
}

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

type Pt = { x: number; y: number; z: number; c: number; s: number; ph: number };

function points(list: Pt[], scale: { value: number }) {
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

function tex(draw: (g: CanvasRenderingContext2D, size: number) => void, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
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
function sprite(map: THREE.Texture, color: number, scale: number, opacity: number, blending: THREE.Blending = THREE.AdditiveBlending) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending }));
  s.scale.set(scale, scale * 0.8, 1);
  return s;
}

export function mountSky(canvas: HTMLCanvasElement): () => void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = (navigator.hardwareConcurrency || 4) <= 4 || innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lite ? 1.25 : 1.6));
  renderer.setClearColor(0x03040a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const timed: THREE.ShaderMaterial[] = [];
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
  const uScale = { value: 1 };
  const r = rng(20261004);
  const glow = glowTex();

  // 1. the star shell all around us
  const shell: Pt[] = [];
  for (let i = 0; i < (lite ? 5000 : 11000); i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 380 + r() * 900, k = Math.sqrt(1 - u * u);
    const t = r();
    shell.push({ x: k * Math.cos(th) * rad, y: u * rad * 0.8, z: k * Math.sin(th) * rad,
      c: t < 0.12 ? 0xaecbff : t < 0.2 ? 0xffd9b0 : t < 0.24 ? 0xffb0b0 : 0xffffff,
      s: r() < 0.03 ? 14 + r() * 14 : 3 + r() * 7, ph: r() });
  }
  const shellPts = points(shell, uScale);
  timed.push(shellPts.material);
  scene.add(shellPts);

  // 2. a handful of far galaxies: small tilted smudges
  for (let i = 0; i < 9; i++) {
    const s = sprite(glow, r() < 0.5 ? 0xd8c8ff : 0xffe0c0, 10 + r() * 14, 0.35);
    s.scale.y *= 0.35 + r() * 0.3;
    s.material.rotation = r() * Math.PI;
    s.position.set((r() - 0.5) * 1600, (r() - 0.5) * 800, -700 - r() * 500);
    scene.add(s);
  }

  // motion: a slow drift and a lean toward the pointer
  let px = 0, py = 0, lx = 0, ly = 0, visible = true, raf = 0;
  const onMove = (e: PointerEvent) => {
    px = (e.clientX / innerWidth) * 2 - 1;
    py = (e.clientY / innerHeight) * 2 - 1;
  };
  addEventListener("pointermove", onMove, { passive: true });
  const onVis = () => {
    visible = !document.hidden;
    if (visible && !reduce) loop();
  };
  document.addEventListener("visibilitychange", onVis);

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
  function frame(now: number) {
    const t = (now - t0) / 1000;
    lx += (px - lx) * 0.03; ly += (py - ly) * 0.03;
    const yaw = t * 0.006 + lx * 0.06, pitch = -ly * 0.035;
    camera.position.set(Math.sin(t * 0.03) * 6, Math.sin(t * 0.021) * 3, 0);
    camera.lookAt(Math.sin(yaw) * 100, Math.sin(pitch) * 100 + 4, -Math.cos(yaw) * 100);
    for (const m of timed) m.uniforms.uTime.value = t;
    renderer.render(scene, camera);
  }
  function loop(now = performance.now()) {
    if (!visible) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  }
  if (reduce) frame(t0 + 20000);
  else loop();
  return () => {
    cancelAnimationFrame(raf);
    visible = false;
    removeEventListener("pointermove", onMove);
    removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVis);
    renderer.dispose();
  };
}
