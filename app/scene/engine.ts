// @ts-nocheck
/* Vendored scene: this file is the mockup's engine.js with a small, deliberate set of changes
   (marked "PORT:"). It is plain three.js code and is NOT type-checked, by design: rewriting it in
   React Three Fiber was ruled out in the handoff (§0.1). The boundary that matters is enforced
   here: the engine READS the game store and nothing else; it never calls a chain or a driver.
   PORT changes: reads store instead of page globals; one plush per onchain circle (9, all winnable);
   the target ring shows the grip circle the program would use; dispose(); ES exports. */
/* =========================================================================
   CLAW DROP · 3D engine v2  (ES module, three r170)
   Same public API as the mockup engine:
     new ClawMachine3D(el, {isArcade}), .update(dt, elapsed), .resize(),
     .triggerDropAnimation(won, cb), .resetToAttract(),
     .clawPos, .nearestPrize, .prizeMeshes
   ========================================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CIRCLES, floorToScene } from '@clawdrop/sdk/model';
import { CREATURES } from '../game/creatures';
import { useGameStore } from '../game/gameStore';

/* ---------- constants (kept from mockup so the rest of the page is untouched) */
const FLOOR_Y = -1.41;
const GANTRY_Y = 2.75;
const CLAW_HOME_Y = 2.35;
const CLAW_BOTTOM_Y = -0.45;
const CHUTE = { x: -1.65, z: 1.65 };
const ease = t => t * t * (3 - 2 * t);
const blinkK = (t) => { const x = t % 3.7; return x < 0.14 ? 1 - Math.sin(x / 0.14 * Math.PI) * 0.92 : 1; };

/* ---------- small helpers --------------------------------------------------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function plush(color, o = {}) {
  const base = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: base, roughness: 0.78, metalness: 0,
    sheen: 1, sheenRoughness: 0.45, sheenColor: base.clone().lerp(new THREE.Color(1, 1, 1), 0.55),
    ...o
  });
}
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, ...o });
const glow = (color, k = 2.2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: k, roughness: 0.6 });

function mesh(geo, mat, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function ball(r, mat, sx = 1, sy = 1, sz = 1) {
  const m = mesh(new THREE.SphereGeometry(r, 32, 20), mat);
  m.scale.set(sx, sy, sz);
  return m;
}

/* ---------- creature builders (stylised plush, built from primitives) ------- */
const INK = new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.4 });
const WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });

function eyes(g, { y = 0.06, x = 0.15, z = 0.36, r = 0.075, pupil = 0.045, tint } = {}) {
  [-1, 1].forEach(s => {
    const e = ball(r, tint ? new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.6, roughness: 0.2 }) : WHITE);
    e.position.set(s * x, y, z); e.castShadow = false;
    const p = ball(pupil, INK); p.position.set(s * x + s * -0.004, y - 0.005, z + r * 0.66); p.castShadow = false;
    const h = ball(pupil * 0.38, WHITE); h.position.set(s * x - 0.015, y + 0.02, z + r * 0.66 + pupil * 0.6); h.castShadow = false;
    g.add(e, p, h); (g.userData.eyes || (g.userData.eyes = [])).push(e, p, h);
  });
}
function smile(g, { y = -0.06, z = 0.4, r = 0.05, flat = false } = {}) {
  if (flat) {
    const m = mesh(new THREE.CapsuleGeometry(0.012, 0.09, 4, 8), INK, { cast: false });
    m.rotation.z = Math.PI / 2; m.position.set(0, y, z); g.add(m); return;
  }
  const m = mesh(new THREE.TorusGeometry(r, 0.012, 8, 20, Math.PI), INK, { cast: false });
  m.rotation.z = Math.PI; m.position.set(0, y + r * 0.7, z); g.add(m);
}
function blush(g, color = 0xfda4af, y = -0.03, x = 0.25, z = 0.33) {
  [-1, 1].forEach(s => {
    const b = ball(0.05, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), 1.4, 0.8, 0.3);
    b.position.set(s * x, y, z); b.rotation.y = s * 0.7; b.castShadow = false; g.add(b);
  });
}
function cone(r, h, mat) { return mesh(new THREE.ConeGeometry(r, h, 16), mat); }

const BUILDERS = {
  'gilded-wyrm'(g, c) {
    const gold = plush(0xf5b301, { roughness: 0.5, metalness: 0.25 });
    const dark = plush(0xc2410c, { roughness: 0.55 });
    const cream = plush(0xfde68a);
    g.add(ball(0.4, gold, 1.02, 0.94, 1));
    const belly = ball(0.3, cream, 0.9, 0.95, 0.5); belly.position.set(0, -0.08, 0.28); g.add(belly);
    [-1, 1].forEach(s => {
      const h = cone(0.065, 0.3, dark); h.position.set(s * 0.17, 0.4, -0.02); h.rotation.z = -s * 0.35; g.add(h);
      const w = ball(0.16, dark, 0.3, 1.1, 1.4); w.position.set(s * 0.42, 0.06, -0.12); w.rotation.set(0.2, 0, -s * 0.5); g.add(w);
    });
    for (let i = 0; i < 3; i++) {
      const sp = cone(0.06 - i * 0.01, 0.16, dark); sp.position.set(0, 0.32 - i * 0.14, -0.33 - i * 0.04); sp.rotation.x = -1.1 - i * 0.2; g.add(sp);
    }
    const gem = mesh(new THREE.OctahedronGeometry(0.055, 0), glow(0x22d3ee, 3.2), { cast: false });
    gem.position.set(0, 0.24, 0.37); gem.scale.set(0.9, 1.3, 0.8); g.add(gem); g.userData.gem = gem;
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.2, -0.3), new THREE.Vector3(0.1, -0.3, -0.55), new THREE.Vector3(0.32, -0.22, -0.62), new THREE.Vector3(0.42, -0.02, -0.5)]);
    const tail = mesh(new THREE.TubeGeometry(path, 16, 0.07, 10), gold); g.add(tail);
    const tip = cone(0.1, 0.18, dark); tip.position.set(0.44, 0.04, -0.48); tip.rotation.z = -0.3; g.add(tip);
    eyes(g, { y: 0.07, x: 0.16, z: 0.35, r: 0.08, pupil: 0.05 });
    smile(g, { y: -0.08, z: 0.39, r: 0.05 });
    blush(g, 0xfb923c, -0.03);
  },
  'void-hopper'(g, c) {
    const body = plush(0xa855f7); const inner = plush(0xf0abfc); const deep = plush(0x6d28d9);
    g.add(ball(0.4, body, 1.05, 0.9, 1));
    [-1, 1].forEach(s => {
      const ear = mesh(new THREE.CapsuleGeometry(0.075, 0.34, 6, 14), body); ear.position.set(s * 0.17, 0.5, -0.02); ear.rotation.z = -s * 0.28; g.add(ear);
      const ein = mesh(new THREE.CapsuleGeometry(0.035, 0.26, 4, 10), inner, { cast: false }); ein.position.set(s * 0.175 - s * 0.01, 0.5, 0.045); ein.rotation.z = -s * 0.28; g.add(ein);
      const foot = ball(0.11, deep, 1.1, 0.7, 1.4); foot.position.set(s * 0.22, -0.34, 0.2); g.add(foot);
    });
    const star = mesh(new THREE.OctahedronGeometry(0.06, 0), glow(0x67e8f9, 3), { cast: false });
    star.position.set(0, 0.25, 0.34); star.scale.set(1, 1, 0.5); g.add(star); g.userData.gem = star;
    eyes(g, { y: 0.04, x: 0.16, z: 0.34, r: 0.1, pupil: 0.06, tint: 0x0b0e14 });
    // glassy cyan irises on top of the dark eye
    [-1, 1].forEach(s => { const i = ball(0.05, glow(0x67e8f9, 1.6)); i.position.set(s * 0.16, 0.04, 0.43); i.castShadow = false; g.add(i); });
    smile(g, { y: -0.1, z: 0.38, r: 0.04 });
  },
  'volt-axolotl'(g, c) {
    const body = plush(0x3b82f6); const pink = plush(0xf9a8d4); const belly = plush(0xbfdbfe);
    g.add(ball(0.4, body, 1.12, 0.84, 1.02));
    const b = ball(0.3, belly, 0.9, 0.8, 0.5); b.position.set(0, -0.09, 0.3); g.add(b);
    [-1, 1].forEach(s => {
      for (let i = 0; i < 3; i++) {
        const f = mesh(new THREE.CapsuleGeometry(0.03, 0.2, 4, 10), pink);
        f.position.set(s * (0.4 + i * 0.01), 0.2 - i * 0.1, -0.02);
        f.rotation.z = -s * (1.15 + i * 0.25);
        g.add(f);
        const t = ball(0.04, glow(0x67e8f9, 1.6)); t.position.set(s * (0.55 + i * 0.03), 0.28 - i * 0.04 + (i === 2 ? -0.1 : 0), -0.02); t.castShadow = false; g.add(t);
      }
    });
    const sh = new THREE.Shape(); sh.moveTo(0.02, 0.1); sh.lineTo(-0.05, -0.01); sh.lineTo(-0.005, -0.01); sh.lineTo(-0.03, -0.1); sh.lineTo(0.06, 0.02); sh.lineTo(0.01, 0.02); sh.closePath();
    const bolt = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }), glow(0xfde047, 3.2), { cast: false });
    bolt.position.set(0.02, 0.22, 0.36); bolt.scale.setScalar(1.15); g.add(bolt); g.userData.gem = bolt;
    eyes(g, { y: 0.06, x: 0.2, z: 0.34, r: 0.07, pupil: 0.045 });
    smile(g, { y: -0.07, z: 0.4, r: 0.06 });
    blush(g, 0xf9a8d4, -0.02, 0.29, 0.3);
    const tail = mesh(new THREE.CapsuleGeometry(0.07, 0.3, 6, 12), body); tail.position.set(0, -0.22, -0.42); tail.rotation.x = 1.2; g.add(tail);
  },
  'pebble-crab'(g, c) {
    const shell = plush(0x94a3b8, { roughness: 0.6 }); const red = plush(0xf87171); const cap = plush(0x3b82f6);
    g.add(ball(0.4, shell, 1.15, 0.78, 1));
    const rim = mesh(new THREE.TorusGeometry(0.4, 0.035, 10, 32), plush(0x64748b), { cast: false }); rim.rotation.x = Math.PI / 2; rim.scale.set(1.15, 1, 0.78); rim.position.y = -0.02; g.add(rim);
    [-1, 1].forEach(s => {
      const arm = mesh(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), red); arm.position.set(s * 0.46, -0.02, 0.1); arm.rotation.z = s * 1.1; g.add(arm);
      const claw = ball(0.14, red); claw.position.set(s * 0.56, 0.1, 0.16); g.add(claw);
      const notch = cone(0.06, 0.15, plush(0xdc2626)); notch.position.set(s * 0.56, 0.24, 0.16); notch.rotation.z = s * 0.2; g.add(notch);
      for (let i = 0; i < 2; i++) { const leg = mesh(new THREE.CapsuleGeometry(0.022, 0.12, 4, 6), plush(0x64748b)); leg.position.set(s * (0.3 + i * 0.1), -0.3, 0.2 - i * 0.18); leg.rotation.z = s * 0.9; g.add(leg); }
    });
    const dome = mesh(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cap); dome.position.set(-0.04, 0.2, 0.05); dome.rotation.z = 0.12; g.add(dome);
    const brim = ball(0.15, plush(0x60a5fa), 1.3, 0.2, 0.9); brim.position.set(0.14, 0.2, 0.2); brim.rotation.z = 0.1; g.add(brim);
    eyes(g, { y: 0.03, x: 0.15, z: 0.34, r: 0.065, pupil: 0.04 });
    smile(g, { y: -0.09, z: 0.38, flat: true });
  },
  'mochi-sprout'(g, c) {
    const mochi = plush(0xdde5f0, { roughness: 0.9 }); const leaf = plush(0x34d399, { roughness: 0.6 });
    g.add(ball(0.4, mochi, 1.12, 0.88, 1.06));
    const stem = mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.2, 8), leaf); stem.position.set(0, 0.45, 0); g.add(stem);
    [-1, 1].forEach(s => {
      const l = ball(0.1, leaf, 1.6, 0.4, 0.9); l.position.set(s * 0.09, 0.57, 0); l.rotation.z = s * 0.45; g.add(l);
    });
    blush(g, 0xfda4af, -0.03, 0.25, 0.34);
    [-1, 1].forEach(s => {
      const e = mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16, Math.PI), INK, { cast: false });
      e.rotation.z = Math.PI; e.position.set(s * 0.15, 0.1, 0.4); g.add(e);
    });
    smile(g, { y: -0.04, z: 0.42, r: 0.03 });
  }
};

function makeCreature(c) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  (BUILDERS[c.id] || ((gg) => gg.add(ball(0.4, plush(c.color))))) (inner, c);
  inner.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; } });
  g.userData.inner = inner;
  g.userData.gem = inner.userData.gem || null;
  g.userData.eyes = inner.userData.eyes || [];
  return g;
}

/* =========================================================================
   Engine
   ========================================================================= */
class ClawMachine3D {
  constructor(containerEl, options = { isArcade: false }) {
    this.container = containerEl;
    this.isArcade = options.isArcade;
    this.lowPower = window.matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

    const width = containerEl.clientWidth || 600;
    const height = containerEl.clientHeight || 500;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x05060b, 18, 40);
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 80);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.75 : 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x05060b, 1);
    containerEl.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    this.orbitYaw = 0.25;
    this.orbitPitch = this.isArcade ? 0.5 : 0.36;
    this.isOrbiting = false;
    this.prevPointer = { x: 0, y: 0 };

    this.clawPos = new THREE.Vector3(0, CLAW_HOME_Y, 0);
    this.clawOpenAngle = 0.55;
    this.dropPhase = 'idle';
    this.dropCallback = null;
    this.wonCurrentDrop = false;
    this.grabbedMesh = null;
    this.slipMesh = null;
    this.fallers = [];
    this.phaseT = 0;
    this.lastTxTick = 0;
    this.shake = 0;
    this.joy = { x: 0, z: 0 };
    this.prevClaw = new THREE.Vector3();
    this.leds = [];

    this.buildEnvironment();
    this.buildLights();
    this.buildCabinet();
    this.buildPrizes();
    this.buildClawAssembly();
    this.buildParticles();
    this.buildPost(width, height);
    this.bindOrbitEvents();
  }

  /* ----- environment / backdrop ------------------------------------------ */
  buildEnvironment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pm.dispose();

    // soft violet halo + floor shadow-pool behind the machine
    const halo = canvasTex(512, 512, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(168,85,247,0.55)'); r.addColorStop(0.45, 'rgba(99,60,200,0.18)'); r.addColorStop(1, 'rgba(11,14,20,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    haloMesh.position.set(0, 0.8, -7); this.halo = haloMesh; this.scene.add(haloMesh);


    // 3D star shell behind/around the machine (parallaxes with the orbit camera)
    { const N = 1400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color();
      const tint = [0xc4b5fd, 0xa855f7, 0xf5c451, 0xe8ecf4];
      for (let i = 0; i < N; i++) {
        const r = 16 + Math.random() * 40, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.8 + 2, r * Math.sin(ph) * Math.sin(th)], i * 3);
        c.set(tint[(Math.random() * 4) | 0]).multiplyScalar(0.35 + Math.random() * 0.65); col.set([c.r, c.g, c.b], i * 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.starShell = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.22, map: canvasTex(64, 64, (x) => { const r = x.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(0.35, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, 64, 64); }), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
      this.scene.add(this.starShell);
    }

    const pool = canvasTex(512, 512, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(168,85,247,0.35)'); r.addColorStop(1, 'rgba(168,85,247,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    const poolMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    poolMesh.rotation.x = -Math.PI / 2; poolMesh.position.y = -2.27; this.scene.add(poolMesh);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9db4ff, 0x1a1030, 0.28));

    const key = new THREE.SpotLight(0xfff1e0, 52, 14, 1.0, 0.85, 2);
    key.position.set(0.4, 2.85, 0.8); key.target.position.set(0, -1.4, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(this.lowPower ? 1024 : 2048, this.lowPower ? 1024 : 2048);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 5;
    this.scene.add(key, key.target);
    this.keyLight = key;

    const violet = new THREE.PointLight(0xa855f7, 8, 9, 2); violet.position.set(0, 2.5, 0); this.scene.add(violet);
    const blue = new THREE.PointLight(0x3b82f6, 18, 12, 2); blue.position.set(-4.5, 1.2, 4); this.scene.add(blue);
    const gold = new THREE.PointLight(0xf5b301, 14, 12, 2); gold.position.set(4.5, 0.4, -2.5); this.scene.add(gold);
    const front = new THREE.DirectionalLight(0xdbeafe, 0.45); front.position.set(2, 3, 8); this.scene.add(front);
    this.violetLight = violet;
  }

  /* ----- cabinet --------------------------------------------------------- */
  buildCabinet() {
    const g = this.cabinet = new THREE.Group();
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0x1a2133, roughness: 0.38, metalness: 0.65, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const trimMat = new THREE.MeshPhysicalMaterial({ color: 0x2b3550, roughness: 0.25, metalness: 0.9 });

    // Play bed (textured rubber mat with faint grid and rarity-less vignette)
    const bedTex = canvasTex(1024, 1024, (c, w, h) => {
      c.fillStyle = '#0d1220'; c.fillRect(0, 0, w, h);
      const r = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.62);
      r.addColorStop(0, 'rgba(120,70,220,0.28)'); r.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = r; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(168,130,255,0.14)'; c.lineWidth = 2;
      for (let i = 0; i <= 10; i++) { const p = (i / 10) * w; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, h); c.stroke(); c.beginPath(); c.moveTo(0, p); c.lineTo(w, p); c.stroke(); }
      for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
    const bed = mesh(new RoundedBoxGeometry(4.5, 0.12, 4.5, 3, 0.03), new THREE.MeshStandardMaterial({ map: bedTex, roughness: 0.55, metalness: 0.2 }), { cast: false, receive: true });
    bed.position.y = FLOOR_Y - 0.06; g.add(bed);

    // Base cabinet
    const base = mesh(new RoundedBoxGeometry(5.1, 0.82, 5.1, 5, 0.1), shellMat, { cast: false, receive: true });
    base.position.y = -1.88; g.add(base);
    const baseTrim = mesh(new RoundedBoxGeometry(5.16, 0.1, 5.16, 3, 0.04), trimMat, { cast: false }); baseTrim.position.y = -1.44; g.add(baseTrim);
    const ledBase = mesh(new RoundedBoxGeometry(5.12, 0.045, 5.12, 2, 0.02), glow(0xa855f7, 2.6), { cast: false }); ledBase.position.y = -1.6; this.leds.push(ledBase.material); g.add(ledBase);
    const skirt = mesh(new RoundedBoxGeometry(4.7, 0.18, 4.7, 3, 0.06), new THREE.MeshStandardMaterial({ color: 0x07090e, roughness: 0.8 }), { cast: false }); skirt.position.y = -2.34; g.add(skirt);

    // Chute: recessed well in the bed + glowing frame + door on the front face
    const well = mesh(new THREE.BoxGeometry(1.08, 0.04, 1.08), new THREE.MeshStandardMaterial({ color: 0x020305, roughness: 1 }), { cast: false });
    well.position.set(CHUTE.x, FLOOR_Y + 0.005, CHUTE.z); g.add(well);
    const frameMat = glow(0xf0abfc, 2.4); this.leds.push(frameMat);
    [[0, -0.55, 1.2, 0.05], [0, 0.55, 1.2, 0.05], [-0.55, 0, 0.05, 1.2], [0.55, 0, 0.05, 1.2]].forEach(([x, z, w, d]) => {
      const f = mesh(new THREE.BoxGeometry(w, 0.05, d), frameMat, { cast: false });
      f.position.set(CHUTE.x + x, FLOOR_Y + 0.025, CHUTE.z + z); g.add(f);
    });
    const door = mesh(new RoundedBoxGeometry(1.05, 0.5, 0.06, 3, 0.03), new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.7 }), { cast: false });
    door.position.set(CHUTE.x, -1.88, 2.56); g.add(door);
    const doorRim = mesh(new THREE.BoxGeometry(1.12, 0.04, 0.04), glow(0xf0abfc, 2.2), { cast: false }); doorRim.position.set(CHUTE.x, -1.62, 2.58); g.add(doorRim);

    // Corner posts with LED strips
    const postGeo = new RoundedBoxGeometry(0.2, 4.45, 0.2, 3, 0.05);
    const ledMat = glow(0xc084fc, 2.8); this.leds.push(ledMat);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const p = mesh(postGeo, shellMat); p.position.set(sx * 2.3, 0.78, sz * 2.3); g.add(p);
      const strip = mesh(new THREE.BoxGeometry(0.03, 4.1, 0.03), ledMat, { cast: false });
      strip.position.set(sx * 2.3 - sx * 0.1, 0.78, sz * 2.3 - sz * 0.1); g.add(strip);
    });

    // Roof + front header (marquee)
    const roof = mesh(new RoundedBoxGeometry(5.1, 0.22, 5.1, 4, 0.06), shellMat, { cast: false, receive: true }); roof.position.y = 3.05; g.add(roof);
    const roofLed = mesh(new RoundedBoxGeometry(4.5, 0.03, 4.5, 2, 0.01), glow(0xfef3c7, 1.6), { cast: false }); roofLed.position.y = 2.93; g.add(roofLed);
    const header = mesh(new RoundedBoxGeometry(5.1, 1.0, 0.9, 5, 0.1), shellMat); header.position.set(0, 3.7, 2.1); g.add(header);
    this.marqueeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.marqueeTexture('CLAW DROP'), emissiveIntensity: 1.1, roughness: 0.5 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 0.78), this.marqueeMat);
    sign.position.set(0, 3.7, 2.56); g.add(sign);
    document.fonts && document.fonts.load('700 120px Fredoka').then(() => { this.marqueeMat.emissiveMap = this.marqueeTexture('CLAW DROP'); this.marqueeMat.needsUpdate = true; }).catch(() => { });
    const crown = mesh(new THREE.BoxGeometry(5.0, 0.05, 0.05), glow(0xa855f7, 3), { cast: false }); crown.position.set(0, 4.22, 2.58); this.leds.push(crown.material); g.add(crown);

    // Back wall (opaque, starfield print)
    const backTex = canvasTex(1024, 1024, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#160f30'); gr.addColorStop(1, '#0a0d18');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) { c.fillStyle = `rgba(216,200,255,${0.1 + Math.random() * 0.5})`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, Math.random() * 2.2 + 0.4, 0, 7); c.fill(); }
      c.strokeStyle = 'rgba(192,132,252,0.5)'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, h * 0.74); c.lineTo(w, h * 0.74); c.stroke();
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.45), new THREE.MeshStandardMaterial({ map: backTex, emissiveMap: backTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.8 }));
    back.position.set(0, 0.78, -2.24); back.receiveShadow = true; g.add(back);

    // Glass (front + sides) with env reflections and a soft diagonal gloss streak
    const streak = canvasTex(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const s = c.createLinearGradient(0, 0, w, h);
      s.addColorStop(0.25, 'rgba(255,255,255,0)'); s.addColorStop(0.32, 'rgba(255,255,255,0.28)'); s.addColorStop(0.4, 'rgba(255,255,255,0)');
      s.addColorStop(0.5, 'rgba(255,255,255,0)'); s.addColorStop(0.54, 'rgba(255,255,255,0.14)'); s.addColorStop(0.58, 'rgba(255,255,255,0)');
      c.fillStyle = s; c.fillRect(0, 0, w, h);
    });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6, clearcoat: 1 });
    const gloss = new THREE.MeshBasicMaterial({ map: streak, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, side: THREE.DoubleSide, fog: false });
    const panes = [
      { p: [0, 0.78, 2.24], r: 0, w: 4.4 }, { p: [-2.24, 0.78, 0], r: Math.PI / 2, w: 4.4 }, { p: [2.24, 0.78, 0], r: -Math.PI / 2, w: 4.4 }
    ];
    panes.forEach(({ p, r, w }) => {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.45), glassMat); pane.position.set(...p); pane.rotation.y = r; pane.renderOrder = 5; g.add(pane);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.45), gloss); gl.position.set(p[0] + Math.sin(r) * 0.005, p[1], p[2] + Math.cos(r) * 0.005); gl.rotation.y = r; gl.renderOrder = 6; g.add(gl);
    });

    // Control panel (joystick + drop button) on the front lip
    const panel = new THREE.Group(); panel.position.set(0, -1.5, 3.05); g.add(panel);
    const lip = mesh(new RoundedBoxGeometry(5.1, 0.34, 1.15, 5, 0.1), shellMat, { cast: false, receive: true }); lip.position.y = 0; lip.rotation.x = -0.1; panel.add(lip);
    const plate = mesh(new RoundedBoxGeometry(2.1, 0.05, 0.7, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x080b12, roughness: 0.5, metalness: 0.5 }), { cast: false }); plate.position.set(0, 0.2, 0.05); plate.rotation.x = -0.1; panel.add(plate);
    const stickBase = mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 24), trimMat, { cast: false }); stickBase.position.set(-0.55, 0.26, 0.05); panel.add(stickBase);
    this.stick = new THREE.Group(); this.stick.position.set(-0.55, 0.28, 0.05); panel.add(this.stick);
    const shaft = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.2 }), { cast: false }); shaft.position.y = 0.15; this.stick.add(shaft);
    const knob = mesh(new THREE.SphereGeometry(0.115, 24, 16), glossy(0xf87171, { emissive: 0xf87171, emissiveIntensity: 0.35 }), { cast: false }); knob.position.y = 0.34; this.stick.add(knob);
    const btnRing = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 28), trimMat, { cast: false }); btnRing.position.set(0.6, 0.26, 0.05); panel.add(btnRing);
    this.btn = mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.08, 28), glossy(0xa855f7, { emissive: 0xa855f7, emissiveIntensity: 1.6 }), { cast: false }); this.btn.position.set(0.6, 0.3, 0.05); panel.add(this.btn);
    this.leds.push(this.btn.material);

    this.scene.add(g);
  }

  marqueeTexture(text) {
    return canvasTex(1536, 256, (c, w, h) => {
      c.fillStyle = '#05060a'; c.fillRect(0, 0, w, h);
      const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#d8b4fe'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#f5c451');
      c.font = '700 168px Fredoka, "Arial Rounded MT Bold", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = '#a855f7'; c.shadowBlur = 40; c.fillStyle = gr; c.fillText(text, w / 2, h / 2 + 8);
      c.shadowBlur = 0; c.strokeStyle = 'rgba(168,85,247,0.9)'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
      for (let i = 0; i < 24; i++) { c.fillStyle = i % 2 ? '#a855f7' : '#f5c451'; c.beginPath(); c.arc(40 + i * ((w - 80) / 23), 28, 6, 0, 7); c.fill(); c.beginPath(); c.arc(40 + i * ((w - 80) / 23), h - 28, 6, 0, 7); c.fill(); }
    });
  }

  /* ----- prizes ---------------------------------------------------------- */
  buildPrizes() {
    this.prizeMeshes = [];
    // PORT: every plush sits exactly on one onchain circle (CIRCLES: 9 of them, 3/2/2/1/1 per creature),
    // so what the player aims at is what the chain measures, and EVERY plush in the machine is winnable.
    // There are no full-size decoration plush any more; the filler below is capsule toys only.
    this.heroMeshes = []; this.heroesBySlot = {};
    const spots = CIRCLES.map(c => ({
      x: floorToScene(c.x), z: floorToScene(c.z), c: CREATURES.findIndex(cr => cr.slot === c.slot),
      hero: true, slot: c.slot, circleRadius: c.radius,
    }));
    const discTex = canvasTex(256, 256, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });

    spots.forEach((s, idx) => {
      const creature = CREATURES[s.c];
      const group = makeCreature(creature);
      const tier = { Legendary: 1, Epic: 0.7, Rare: 0.45, Uncommon: 0.3, Common: 0.2 }[creature.rarity] || 0.2;
      const aura = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: discTex, color: creature.color, transparent: true, opacity: 0.12 + tier * 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      aura.rotation.x = -Math.PI / 2; aura.position.y = -0.395; group.add(aura);
      group.position.set(s.x, -1.02, s.z);
      group.userData = Object.assign(group.userData, {
        baseY: -1.02, homeX: s.x, homeZ: s.z, phase: idx * 1.1, creature,
        facing: (Math.random() - 0.5) * 0.6, aura, tier, pop: 1, hero: !!s.hero, slot: s.slot, circleRadius: s.circleRadius
      });
      this.scene.add(group);
      this.prizeMeshes.push(group);
      if (s.hero) { this.heroMeshes.push(group); (this.heroesBySlot[s.slot] ||= []).push(group); }
    });

    // decorative filler: capsule toys in the gaps (not targetable, and clearly not plush)
    const taken = spots.map(s => [s.x, s.z, 0.62]);
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const pal = [0xf472b6, 0x60a5fa, 0x34d399, 0xfbbf24, 0xc084fc, 0xfb7185, 0x22d3ee];
    const place = (rad) => { for (let k = 0; k < 60; k++) { const x = (rnd() - 0.5) * 4.0, z = (rnd() - 0.5) * 4.0; if (x < -1.0 && z > 1.0) continue; if (taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > tr + rad)) { taken.push([x, z, rad]); return [x, z]; } } return null; };
    for (let i = 0; i < 44; i++) {
      const r = 0.15 + (i % 3) * 0.02, p = place(r); if (!p) continue;
      const cap = new THREE.Group();
      cap.add(mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glossy(pal[i % pal.length], { roughness: 0.2 })),
              mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glossy(0xf8fafc, { roughness: 0.15 })));
      cap.rotation.set(rnd() * 3, rnd() * 3, 0);
      const holder = new THREE.Group(); holder.add(cap); holder.position.set(p[0], FLOOR_Y + r, p[1]); this.scene.add(holder);
    }

    // targeting ring: two nested rings + dashes so it reads on any prize colour
    const ringGeo = new THREE.RingGeometry(0.5, 0.62, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    // PORT: the "ghost": a thin ring on the floor where the CHAIN says the claw is. In a real game it
    // trails the claw by the round-trip time, which is the honest picture of what is confirmed.
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ghost.rotation.x = -Math.PI / 2; this.ghost.position.y = -1.385; this.ghost.visible = false; this.scene.add(this.ghost);
    this.targetRing = new THREE.Mesh(ringGeo, ringMat);
    this.targetRing.rotation.x = -Math.PI / 2; this.targetRing.position.y = -1.38; this.scene.add(this.targetRing);
    const dash = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.73, 6, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    dash.position.z = 0; this.targetRing.add(dash); this.targetDash = dash;
  }

  /* ----- gantry + claw --------------------------------------------------- */
  buildClawAssembly() {
    const steel = new THREE.MeshStandardMaterial({ color: 0xaab4c6, metalness: 0.95, roughness: 0.22 });
    // side rails (fixed, along z) and cross bar (moves in z)
    [-1, 1].forEach(s => {
      const rail = mesh(new THREE.CylinderGeometry(0.045, 0.045, 4.3, 14), steel, { cast: false }); rail.rotation.x = Math.PI / 2; rail.position.set(s * 2.12, GANTRY_Y + 0.0, 0); this.scene.add(rail);
    });
    this.gantryBar = new THREE.Group();
    const bar = mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.3, 14), steel); bar.rotation.z = Math.PI / 2; this.gantryBar.add(bar);
    [-1, 1].forEach(s => { const sl = mesh(new RoundedBoxGeometry(0.22, 0.2, 0.3, 3, 0.04), glossy(0x2b3550, { metalness: 0.8 })); sl.position.set(s * 2.12, 0, 0); this.gantryBar.add(sl); });
    this.gantryBar.position.set(0, GANTRY_Y, 0); this.scene.add(this.gantryBar);

    // trolley that rides the cross bar (moves in x)
    this.trolley = mesh(new RoundedBoxGeometry(0.42, 0.26, 0.4, 4, 0.06), glossy(0x1e293b, { metalness: 0.8, emissive: 0xa855f7, emissiveIntensity: 0.25 }));
    this.trolley.position.y = GANTRY_Y; this.scene.add(this.trolley);

    // claw head
    this.clawGroup = new THREE.Group();
    const hubMat = glossy(0x1e293b, { metalness: 0.85, emissive: 0xa855f7, emissiveIntensity: 0.2 });
    const hub = mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 24), hubMat); this.clawGroup.add(hub);
    const collar = mesh(new THREE.TorusGeometry(0.21, 0.025, 10, 28), glow(0xc084fc, 3), { cast: false }); collar.rotation.x = Math.PI / 2; collar.position.y = -0.13; this.clawGroup.add(collar); this.leds.push(collar.material);
    const cap = mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.12, 20), steel); cap.position.y = 0.2; this.clawGroup.add(cap);

    this.prongs = []; this.tips = [];
    const prongMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.95, roughness: 0.16 });
    const tipMat = glossy(0xf8fafc, { metalness: 0.5, roughness: 0.2 });
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group(); pivot.rotation.y = (i * Math.PI * 2) / 3 + Math.PI / 6;
      const joint = new THREE.Group(); joint.position.set(0.22, -0.1, 0); // rotates about z (swing outward = +z rot)
      const upper = mesh(new RoundedBoxGeometry(0.09, 0.5, 0.1, 2, 0.03), prongMat); upper.position.y = -0.25; joint.add(upper);
      const elbow = ball(0.06, tipMat); elbow.position.y = -0.5; joint.add(elbow);
      const knee = new THREE.Group(); knee.position.y = -0.5; joint.add(knee); // curls inward
      const lower = mesh(new RoundedBoxGeometry(0.075, 0.34, 0.09, 2, 0.025), prongMat); lower.position.y = -0.17; knee.add(lower);
      const tip = cone(0.05, 0.14, tipMat); tip.position.y = -0.38; tip.rotation.z = 0; knee.add(tip);
      pivot.add(joint); this.clawGroup.add(pivot);
      this.prongs.push(joint); this.tips.push(knee);
    }
    this.clawGroup.position.copy(this.clawPos); this.scene.add(this.clawGroup);

    const cableMat = new THREE.MeshStandardMaterial({ color: 0xd8b4fe, emissive: 0xa855f7, emissiveIntensity: 0.8, roughness: 0.4 });
    this.cableMesh = mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 8), cableMat, { cast: false }); this.scene.add(this.cableMesh);

    // soft laser cone + dot (additive, reads better than a pencil line)
    this.laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.6, 8), new THREE.MeshBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.laserBeam);
    this.laserDot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshBasicMaterial({ color: 0xff8080, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laserDot.rotation.x = -Math.PI / 2; this.laserDot.position.y = -1.37; this.scene.add(this.laserDot);
  }

  /* ----- particles ------------------------------------------------------- */
  buildParticles() {
    const N = 160;
    this.pN = N;
    this.pPos = new Float32Array(N * 3); this.pCol = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3); this.pLife = new Float32Array(N); this.pMax = new Float32Array(N).fill(1);
    this.pPos.fill(-999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const spark = canvasTex(64, 64, (g, w, h) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, map: spark, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.particles.frustumCulled = false; this.scene.add(this.particles);
    this.pCursor = 0;
  }
  burst(pos, color, n = 40, speed = 2.2, up = 1.2) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.pCursor++ % this.pN;
      const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random()) * speed;
      this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
      this.pVel[i * 3] = Math.cos(a) * s; this.pVel[i * 3 + 1] = (Math.random() * up + 0.2) * s * 0.7; this.pVel[i * 3 + 2] = Math.sin(a) * s;
      this.pLife[i] = this.pMax[i] = 0.6 + Math.random() * 0.7;
      const m = 0.6 + Math.random() * 0.8; this.pCol[i * 3] = c.r * m; this.pCol[i * 3 + 1] = c.g * m; this.pCol[i * 3 + 2] = c.b * m;
    }
  }
  stepParticles(dt) {
    const gArr = this.pPos.length / 3;
    for (let i = 0; i < gArr; i++) {
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -999; continue; }
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 4.2 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pPos[i * 3 + 1] < FLOOR_Y) { this.pPos[i * 3 + 1] = FLOOR_Y; this.pVel[i * 3 + 1] *= -0.3; }
      const f = Math.max(0, this.pLife[i] / this.pMax[i]);
      this.pCol[i * 3] *= 1 - dt * 1.2 * (1 - f); this.pCol[i * 3 + 1] *= 1 - dt * 1.2 * (1 - f); this.pCol[i * 3 + 2] *= 1 - dt * 1.2 * (1 - f);
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
  }

  /* ----- post ------------------------------------------------------------ */
  buildPost(w, h) {
    try {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.lowPower ? 2 : 4 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), this.lowPower ? 0.35 : 0.45, 0.5, 1.05);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    } catch (e) { console.warn('Bloom disabled', e); this.composer = null; }
  }

  bindOrbitEvents() {
    const dom = this.renderer.domElement;
    // PORT: handlers are kept so dispose() can remove them (React mounts and unmounts the canvas).
    this._onDown = e => { this.isOrbiting = true; this.prevPointer = { x: e.clientX, y: e.clientY }; };
    this._onMove = e => {
      if (!this.isOrbiting) return;
      const dx = e.clientX - this.prevPointer.x, dy = e.clientY - this.prevPointer.y;
      this.prevPointer = { x: e.clientX, y: e.clientY };
      this.orbitYaw -= dx * 0.007;
      this.orbitYaw = Math.max(-1.1, Math.min(1.1, this.orbitYaw));
      this.orbitPitch = Math.max(0.06, Math.min(0.75, this.orbitPitch + dy * 0.005));
    };
    this._onUp = () => { this.isOrbiting = false; };
    dom.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
  }

  /** PORT: release GPU memory, the WebGL context and every listener. Safe to call twice. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this.renderer.domElement.removeEventListener('pointerdown', this._onDown);
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); });
    });
    this.scene.environment && this.scene.environment.dispose();
    if (this.composer) { this.composer.dispose && this.composer.dispose(); }
    this.renderer.dispose();
    this.renderer.forceContextLoss && this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  /* ----- public API ------------------------------------------------------ */
  /** The plush of `slot` standing closest to a point on the floor (scene units): the one the claw is over. */
  nearestHero(slot: number | null | undefined, sx: number, sz: number) {
    const list = slot === null || slot === undefined ? null : this.heroesBySlot[slot];
    if (!list || !list.length) return null;
    let best = list[0], bd = Infinity;
    for (const m of list) { const d = Math.hypot(m.userData.homeX - sx, m.userData.homeZ - sz); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  triggerDropAnimation(won: boolean | null, callback: () => void, slot: number | null = null) {
    this.holdT = 0;   // PORT: `won === null` means the VRF result is still on its way: the claw hangs closed
    // PORT: the prize the claw closes on is the one the program targeted (null = nothing under the claw).
    this.nearestPrize = this.nearestHero(slot, this.clawPos.x, this.clawPos.z);
    this.dropPhase = 'descending'; this.phaseT = 0;
    this.wonCurrentDrop = won; this.dropCallback = callback;
  }

  resetToAttract() {
    this.dropPhase = 'idle'; this.phaseT = 0;
    this.prizeMeshes.forEach(p => {
      const u = p.userData;
      if (p === this.grabbedMesh || p === this.slipMesh || p.visible === false || p.scale.x < 0.99 || this.fallers.some(f => f.m === p)) {
        p.position.set(u.homeX, u.baseY, u.homeZ); p.visible = true; u.pop = 0; p.scale.setScalar(0.001);
      }
    });
    this.fallers = []; this.grabbedMesh = null; this.slipMesh = null;
    this.clawPos.set(0, CLAW_HOME_Y, 0); this.clawOpenAngle = 0.55;
  }

  update(dt, elapsed) {
    if (this.disposed) return;
    /* camera: orbit + responsive distance so the whole machine fits any aspect */
    const aspect = this.camera.aspect;
    let radius = (this.isArcade ? 11.2 : 11.6) * (aspect < 1 ? 1 + (1 - aspect) * 1.05 : 1 + Math.min(0.2, (aspect - 1) * 0.3));
    this.camera.position.x = Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * radius;
    this.camera.position.z = Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * radius;
    this.camera.position.y = 0.9 + Math.sin(this.orbitPitch) * radius;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.2); this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.12; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.12; }
    this.camera.lookAt(0, this.isArcade ? 0.55 : 0.35, 0.2);

    /* idle prize life: breathing, tiny sway, face camera-ish, pop-in after restock */
    this.prizeMeshes.forEach(m => {
      const u = m.userData;
      if (u.pop < 1) { u.pop = Math.min(1, u.pop + dt * 2.2); const k = u.pop; const s = 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k * 0.2); m.scale.setScalar(Math.max(0.001, k < 1 ? ease(k) * s : 1)); }
      if (m !== this.grabbedMesh && m !== this.slipMesh && !this.fallers.some(f => f.m === m)) {
        m.position.y = u.baseY + Math.sin(elapsed * 2 + u.phase) * 0.018;
        m.rotation.y = u.facing + Math.sin(elapsed * 0.7 + u.phase) * 0.35;
        m.rotation.x = 0; m.rotation.z = 0;
        const br = 1 + Math.sin(elapsed * 2.4 + u.phase) * 0.018; u.inner.scale.set(1 / br, br, 1 / br);
      }
      { const bk = blinkK(elapsed + u.phase * 1.7); u.eyes.forEach(e => { e.scale.y = (e.userData.s0 || (e.userData.s0 = e.scale.y)) * bk; }); }
      if (u.gem) u.gem.material.emissiveIntensity = 2.4 + Math.sin(elapsed * 4 + u.phase) * 0.9;
      u.aura.material.opacity = (0.12 + u.tier * 0.28) * (0.85 + Math.sin(elapsed * 2.2 + u.phase) * 0.15);
    });

    /* claw state machine */
    // PORT: the driver owns the claw's position (floor coordinates, clamped, and in a real game
    // confirmed by the chain). The scene only follows it. It no longer integrates the joystick.
    const st = useGameStore.getState();
    const follow = this.isArcade && (st.mode === 'playing' || st.mode === 'dropping');
    const prevX = this.clawPos.x, prevZ = this.clawPos.z;

    if (follow && this.dropPhase === 'idle') {
      const k = Math.min(1, dt * 22);
      this.clawPos.x += (floorToScene(st.claw.x) - this.clawPos.x) * k;
      this.clawPos.z += (floorToScene(st.claw.z) - this.clawPos.z) * k;
      this.clawOpenAngle += (0.55 - this.clawOpenAngle) * Math.min(1, dt * 6);
    } else if (this.dropPhase === 'idle') {
      const k = Math.min(1, dt * 4);   // PORT: ease into the sweep instead of snapping to it
      this.clawPos.x += (Math.sin(elapsed * 0.85) * 1.15 - this.clawPos.x) * k;
      this.clawPos.z += (Math.cos(elapsed * 0.65) * 0.95 - this.clawPos.z) * k;
      this.clawOpenAngle = 0.52 + Math.sin(elapsed * 2.5) * 0.08;
    } else if (this.dropPhase === 'descending') {
      this.clawPos.y -= 3.2 * dt; this.clawOpenAngle += (0.7 - this.clawOpenAngle) * Math.min(1, dt * 8);
      if (this.clawPos.y <= CLAW_BOTTOM_Y) {
        this.clawPos.y = CLAW_BOTTOM_Y; this.dropPhase = 'closing';
        this.burst(new THREE.Vector3(this.clawPos.x, FLOOR_Y + 0.1, this.clawPos.z), 0xd8c8ff, 18, 1.1, 0.8);
        this.shake = 0.5;
      }
    } else if (this.dropPhase === 'closing') {
      this.clawOpenAngle = Math.max(0.12, this.clawOpenAngle - 2.4 * dt);
      if (this.clawOpenAngle <= 0.13) {
        // PORT: with a real game the result arrives after the claw has closed. Hang here until the
        // driver publishes it (the store's dropRequest.won), then lift or slip. 40 s ceiling.
        const dr = st.dropRequest;
        if (dr && dr.won === null && this.holdT < 40) { this.holdT += dt; }
        else {
          if (dr && dr.won !== null) this.wonCurrentDrop = dr.won;
          if (this.nearestPrize) { if (this.wonCurrentDrop) this.grabbedMesh = this.nearestPrize; else this.slipMesh = this.nearestPrize; }
          this.dropPhase = 'rising';
        }
      }
    } else if (this.dropPhase === 'rising') {
      this.clawPos.y += 2.6 * dt;
      const carry = this.grabbedMesh || this.slipMesh;
      if (carry) {
        carry.position.set(this.clawPos.x, this.clawPos.y - 0.62, this.clawPos.z);
        carry.rotation.z = Math.sin(this.clawPos.y * 6) * 0.08;
      }
      // a miss: the plush slips free partway up and drops back to the pile
      if (this.slipMesh && this.clawPos.y > 0.55) {
        this.clawOpenAngle = 0.5;
        this.fallers.push({ m: this.slipMesh, vy: 0, vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8, bounces: 0 });
        this.shake = 0.25;
        this.slipMesh = null;
      }
      if (this.clawPos.y >= CLAW_HOME_Y) {
        this.clawPos.y = CLAW_HOME_Y;
        if (this.grabbedMesh) { this.dropPhase = 'carrying'; this.phaseT = 0; this.carryFrom = { x: this.clawPos.x, z: this.clawPos.z }; }
        else { this.finishDrop(); }
      }
    } else if (this.dropPhase === 'carrying') {
      this.phaseT += dt / 0.9; const k = ease(Math.min(1, this.phaseT));
      this.clawPos.x = this.carryFrom.x + (CHUTE.x - this.carryFrom.x) * k;
      this.clawPos.z = this.carryFrom.z + (CHUTE.z - this.carryFrom.z) * k;
      this.grabbedMesh.position.set(this.clawPos.x, this.clawPos.y - 0.62, this.clawPos.z);
      if (this.phaseT >= 1) {
        this.dropPhase = 'releasing'; this.phaseT = 0;
        this.fallers.push({ m: this.grabbedMesh, vy: 0, vx: 0, vz: 0, bounces: 0, chute: true });
        this.burst(new THREE.Vector3(CHUTE.x, 1.4, CHUTE.z), this.grabbedMesh.userData.creature.color, 36, 2, 1.4);
        this.grabbedMesh = null;
      }
    } else if (this.dropPhase === 'releasing') {
      this.phaseT += dt; this.clawOpenAngle += (0.75 - this.clawOpenAngle) * Math.min(1, dt * 8);
      if (this.phaseT > 0.85) this.finishDrop();
    }
    this.clawVel = { x: (this.clawPos.x - prevX) / Math.max(dt, 1e-3), z: (this.clawPos.z - prevZ) / Math.max(dt, 1e-3) };

    /* fallers (slipped plush / prize dropping in the chute) */
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i], m = f.m, u = m.userData;
      f.vy -= 9.5 * dt; m.position.y += f.vy * dt; m.position.x += f.vx * dt; m.position.z += f.vz * dt;
      m.rotation.z += dt * 2.5; m.rotation.x += dt * 1.6;
      if (f.chute) {
        if (m.position.y < FLOOR_Y + 0.2) { m.visible = false; this.fallers.splice(i, 1); this.burst(new THREE.Vector3(CHUTE.x, FLOOR_Y + 0.15, CHUTE.z), 0xf0abfc, 20, 1.2, 1); this.shake = 0.35; }
      } else {
        const lim = u.baseY;
        if (m.position.y <= lim) {
          m.position.y = lim; f.vy = -f.vy * 0.35; f.vx *= 0.5; f.vz *= 0.5; f.bounces++;
          m.rotation.x *= 0.4; m.rotation.z *= 0.4;
          if (f.bounces === 1) this.burst(new THREE.Vector3(m.position.x, FLOOR_Y + 0.1, m.position.z), 0xd8c8ff, 10, 0.9, 0.6);
          if (f.bounces > 2 || Math.abs(f.vy) < 0.4) { u.homeX = m.position.x = Math.max(-1.8, Math.min(1.8, m.position.x)); u.homeZ = m.position.z = Math.max(-1.8, Math.min(1.8, m.position.z)); this.fallers.splice(i, 1); }
        }
      }
    }

    /* targeting ring */
    // PORT: while playing, the ring is the grip circle the PROGRAM uses: centred on the creature
    // grip.ts targets, as wide as its radius. The edge is the minimum grip. Off every circle there
    // is no ring. In attract mode (and on the landing machine) it just drifts to the nearest hero.
    if (this.dropPhase === 'idle') {
      let prize = null, scale = 1;
      if (follow) {
        const slot = st.aim.slot;
        prize = this.nearestHero(slot, floorToScene(st.claw.x), floorToScene(st.claw.z));
        // the ring is the circle that was hit: its own radius, not the creature's
        if (prize) scale = Math.max(0.12, (prize.userData.circleRadius / 1000) * 3.5 / 0.56);
      } else {
        let minDist = Infinity;
        this.heroMeshes.forEach(p => {
          if (!p.visible) return;
          const d = Math.hypot(p.position.x - this.clawPos.x, p.position.z - this.clawPos.z);
          if (d < minDist) { minDist = d; prize = p; }
        });
        scale = 0.85 + Math.min(0.45, minDist * 0.35);
      }
      this.nearestPrize = prize;
      if (prize) {
        this.targetRing.visible = true;
        this.targetRing.position.set(prize.position.x, -1.38, prize.position.z);
        this.targetRing.material.color.set(prize.userData.creature.color);
        this.targetRing.rotation.z = elapsed * 0.9;
        const pulse = scale + Math.sin(elapsed * 5) * 0.025;
        this.targetRing.scale.set(pulse, pulse, 1);
      } else this.targetRing.visible = false;
    } else { this.targetRing.visible = false; }

    // PORT: show the ghost while playing, once it is a visible distance from the claw
    if (this.ghost) {
      const c = follow ? st.confirmed : null;
      if (c) {
        const gx = floorToScene(c.x), gz = floorToScene(c.z);
        this.ghost.visible = Math.hypot(gx - this.clawPos.x, gz - this.clawPos.z) > 0.05 && this.dropPhase === 'idle';
        this.ghost.position.x = gx; this.ghost.position.z = gz;
      } else this.ghost.visible = false;
    }

    /* sync claw, gantry, trolley, cable, laser */
    this.gantryBar.position.z = this.clawPos.z;
    this.trolley.position.set(this.clawPos.x, GANTRY_Y, this.clawPos.z);
    this.clawGroup.position.copy(this.clawPos);
    this.clawGroup.rotation.z = Math.sin(elapsed * 1.7) * 0.012 * (this.dropPhase === 'idle' ? 1 : 0.3);
    this.prongs.forEach(j => { j.rotation.z = this.clawOpenAngle * 0.9; });
    this.tips.forEach(k => { k.rotation.z = -(0.25 + (0.7 - this.clawOpenAngle) * 1.5); });
    const cableLen = Math.max(0.1, GANTRY_Y - this.clawPos.y - 0.1);
    this.cableMesh.scale.set(1, cableLen, 1);
    this.cableMesh.position.set(this.clawPos.x, GANTRY_Y - cableLen / 2, this.clawPos.z);
    const laserLen = Math.max(0.1, this.clawPos.y - (-1.37));
    this.laserBeam.scale.set(1, laserLen / 3.6, 1);
    this.laserBeam.position.set(this.clawPos.x, -1.37 + laserLen / 2, this.clawPos.z);
    this.laserBeam.visible = this.dropPhase === 'idle';
    this.laserDot.position.set(this.clawPos.x, -1.37, this.clawPos.z);
    this.laserDot.visible = this.dropPhase === 'idle';
    this.laserDot.scale.setScalar(1 + Math.sin(elapsed * 8) * 0.12);

    /* cabinet life: LED pulse, joystick tilt, button glow, halo breathing */
    const pulse = 0.82 + Math.sin(elapsed * 2.3) * 0.18;
    this.leds.forEach((m, i) => { if (m.emissiveIntensity !== undefined) m.emissiveIntensity = (m.userData.k || (m.userData.k = m.emissiveIntensity)) * (0.8 + 0.2 * Math.sin(elapsed * 2.3 + i)); });
    this.violetLight.intensity = 6 + pulse * 3;
    this.halo.material.opacity = 0.75 + Math.sin(elapsed * 0.8) * 0.15;
    const tx = Math.max(-1, Math.min(1, (this.clawVel.x || 0) / 2.6)), tz = Math.max(-1, Math.min(1, (this.clawVel.z || 0) / 2.6));
    this.joy.x += (tx - this.joy.x) * Math.min(1, dt * 12); this.joy.z += (tz - this.joy.z) * Math.min(1, dt * 12);
    this.stick.rotation.z = -this.joy.x * 0.35; this.stick.rotation.x = this.joy.z * 0.35;
    this.btn.position.y = this.dropPhase === 'idle' ? 0.3 : 0.27;

    this.starShell.rotation.y = elapsed * 0.012; this.starShell.rotation.x = Math.sin(elapsed * 0.05) * 0.04;
    this.stepParticles(dt);
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  finishDrop() {
    this.dropPhase = 'idle'; this.phaseT = 0;
    this.clawOpenAngle = 0.55;
    if (this.dropCallback) { const cb = this.dropCallback; this.dropCallback = null; cb(); }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) { this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
  }
}


/* =========================================================================
   Creature Stage: ONE shared WebGL renderer draws live, animated 3D creatures
   into any <canvas data-creature="gilded-wyrm" data-mode="idle|celebrate|turntable">.
   Only visible canvases render; capped at ~40fps.
   ========================================================================= */
const Stage = (() => {
  let renderer, scene, camera, shadowMesh, ready = false, running = false;
  const items = new Set();
  const pointer = { x: -1e4, y: -1e4 };
  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.9; pm.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa8, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0xc4b5fd, 1.4); rim.position.set(-3, 1.5, -2); scene.add(rim);
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30); camera.position.set(0, 0.22, 3.0); camera.lookAt(0, 0.08, 0);
    const sh = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false }));
    shadowMesh.rotation.x = -Math.PI / 2; shadowMesh.position.y = -0.46; scene.add(shadowMesh);
    window.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
    ready = true;
  }
  const io = new IntersectionObserver(es => es.forEach(en => { const it = en.target.__stage; if (it) it.visible = en.isIntersecting; }), { rootMargin: '80px' });

  function mount(canvas, id, opts = {}) {
    if (canvas.__stage) return;
    if (!ready) init();
    const c = CREATURES.find(x => x.id === id) || CREATURES[0];
    const group = makeCreature(c); group.userData.baseS = opts.scale || 1; group.scale.setScalar(group.userData.baseS);
    const it = { canvas, ctx: canvas.getContext('2d'), group, mode: canvas.dataset.mode || opts.mode || 'idle', visible: false, t0: performance.now() / 1000, hop: -1, lookX: 0, lookY: 0, phase: Math.random() * 6, over: false };
    canvas.__stage = it; items.add(it); io.observe(canvas);
    const card = canvas.closest('[data-hover-card]') || canvas.closest('.glass-card') || canvas;
    card.addEventListener('pointerenter', () => { it.hop = 0; });
    start();
  }
  function start() { if (running) return; running = true; let last = 0; requestAnimationFrame(function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || now - last < 24) return; last = now;
    const tNow = now / 1000;
    items.forEach(it => {
      if (!it.canvas.isConnected) { items.delete(it); io.unobserve(it.canvas); return; }
      if (!it.visible) return;
      const r = it.canvas.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      if (it.canvas.width !== W || it.canvas.height !== H) { it.canvas.width = W; it.canvas.height = H; }
      if (renderer.domElement.width !== W || renderer.domElement.height !== H) renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      const g = it.group, t = tNow - it.t0 + it.phase;
      // look toward the pointer
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const tx = Math.max(-1, Math.min(1, (pointer.x - cx) / 400)), ty = Math.max(-1, Math.min(1, (pointer.y - cy) / 400));
      it.lookX += (tx - it.lookX) * 0.08; it.lookY += (ty - it.lookY) * 0.08;
      let y = 0, sy = 1, yaw = 0;
      if (it.mode === 'celebrate') { const k = Math.abs(Math.sin(t * 3.2)); y = k * 0.38; sy = 1 + (1 - k) * -0.1 + k * 0.08; yaw = Math.sin(t * 1.6) * 0.8; }
      else if (it.mode === 'turntable') { y = Math.sin(t * 1.6) * 0.03; yaw = t * 0.9; }
      else { y = Math.sin(t * 2) * 0.035; sy = 1 + Math.sin(t * 2.4) * 0.018; yaw = it.lookX * 0.7 + Math.sin(t * 0.8) * 0.25; }
      if (it.hop >= 0) { it.hop += 0.045; const k = it.hop; if (k >= 1) it.hop = -1; else { y += Math.sin(k * Math.PI) * 0.34; sy *= 1 + Math.sin(k * Math.PI) * 0.08 - (k < 0.15 ? (1 - k / 0.15) * 0.14 : 0); yaw += k * Math.PI * 2; } }
      g.position.set(0, y, 0); g.rotation.set(it.lookY * 0.18, yaw, 0); g.scale.set(g.userData.baseS / Math.sqrt(sy), g.userData.baseS * sy, g.userData.baseS / Math.sqrt(sy));
      const bk = blinkK(t); g.userData.eyes.forEach(e => { e.scale.y = (e.userData.s0 || (e.userData.s0 = e.scale.y)) * bk; });
      if (g.userData.gem) g.userData.gem.material.emissiveIntensity = 2 + Math.sin(t * 4) * 0.7;
      shadowMesh.scale.setScalar(1 - y * 0.6); shadowMesh.material.opacity = 1 - y * 0.8;
      scene.add(g); renderer.render(scene, camera); scene.remove(g);
      it.ctx.clearRect(0, 0, W, H); it.ctx.drawImage(renderer.domElement, 0, 0, W, H);
    });
  }); }
  // auto-mount any <canvas data-creature> that appears in the DOM
  const scan = (root) => (root.querySelectorAll ? root.querySelectorAll('canvas[data-creature]') : []).forEach(c => mount(c, c.dataset.creature));
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('canvas[data-creature]')) mount(n, n.dataset.creature); scan(n); } }))).observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
  return { mount, shadow: null };
})();
export const CreatureStage = Stage;
export { ClawMachine3D };
