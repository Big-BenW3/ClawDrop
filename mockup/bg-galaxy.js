
    /* ---------- Background: Galaxy shader, ported from React Bits (reactbits.dev · Galaxy, MIT + Commons Clause) ----------
       Vanilla WebGL2 port: 4 parallax star layers, twinkle, flares, mouse parallax, intro warp, click warp. */
    (function () {
      const cv = document.getElementById('bg-space'); if (!cv) return;
      const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
      if (!gl) { cv.style.background = '#05060b'; return; }
      const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uGloss;
uniform float uDepth;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uStarGlow;
uniform float uFlareGain;
uniform float uSquash;
uniform float uSaturation;
uniform float uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationAngle;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform int uLayers;
uniform vec3 uColors[4];
uniform int uColorCount;
uniform float uWarp;
uniform float uReveal;
uniform float uMode;
uniform vec3 uBackground;
uniform float uOpacity;
out vec4 outColor;

#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare, vec2 radial, float invReach) {
#ifdef WARP
  float along = dot(uv, radial);
  float d = sqrt(max(dot(uv, uv) - uSquash * along * along, 0.0));
#else
  float d = length(uv);
#endif
  float m = uStarGlow / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uFlareGain;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uFlareGain;
  m *= smoothstep(1.0, 0.2, d * invReach);
#ifdef WARP
  m *= mix(1.0, smoothstep(1.0, 0.55, length(uv) * invReach), min(uWarp * 4.0, 1.0));
#endif
  return m;
}

vec3 StarLayer(vec2 uv, vec2 radial, vec2 repelAt, float pushCells, float spread) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + offset;
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uGloss / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

#ifdef PALETTE
      float pick = Hash21(si + 7.0) * float(uColorCount);
      vec3 base = uColors[int(min(floor(pick), float(uColorCount - 1)))];
#else
      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);
      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));
#endif

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
      vec2 shift = vec2(0.0);
      float invReach = 1.0;
#ifdef REPEL
      vec2 away = si + 0.5 + pad - repelAt;
      float dist = length(away);
      float q = dist * spread;
      float cells = pushCells * exp(-q * q);
      float moved = cells * inversesqrt(1.0 + cells * cells * 2.78);
      shift = away * (moved / max(dist, 0.0001));
      invReach = 1.0 / (1.0 - moved);
#endif
      float star = Star(gv - offset - pad - shift, flareSize, radial, invReach);
      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      col += star * twinkle * size * base;
    }
  }
  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution;
  vec2 uv = (gl_FragCoord.xy - focalPx) / uResolution.y;
  vec2 mouseNorm = uMouse - vec2(0.5);

  vec2 repelAt = vec2(0.0);
  float strength = 0.0;
  float push = 0.0;
  if (uAutoCenterRepulsion > 0.0) {
    strength = uAutoCenterRepulsion;
    push = strength * 0.05;
  } else if (uMouseRepulsion > 0.5) {
    repelAt = (uMouse * uResolution - focalPx) / uResolution.y;
    strength = max(uRepulsionStrength, 0.0);
    push = strength * 0.05 * uMouseActiveFactor;
  } else {
    uv += mouseNorm * 0.1 * uMouseActiveFactor;
  }
  float radius = 0.16 + 0.04 * strength;

  vec2 radial = length(uv) > 0.0001 ? normalize(uv) : vec2(1.0, 0.0);
  float angle = uRotationAngle;
  uv = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv;
  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;
  radial = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * radial;
  radial = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * radial;
  repelAt = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * repelAt;
  repelAt = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * repelAt;

  vec3 col = vec3(0.0);
  float layers = float(uLayers);
  for (int k = 0; k < 8; k++) {
    if (k >= uLayers) break;
    float i = float(k) / layers;
    float depth = fract(i + uDepth);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    vec2 offset = vec2(i * 453.32);
    col += StarLayer(uv * scale + offset, radial, repelAt * scale + offset, push * scale, 1.0 / (scale * radius)) * fade;
  }
  col *= uReveal;

  if (uMode > 1.5) {
    vec3 lit = col * smoothstep(0.0, 0.3, length(col));
    float energy = max(max(lit.r, lit.g), lit.b);
    vec3 tint = lit / max(energy, 0.0001);
    vec3 ink = tint * (0.16 / max(dot(tint, vec3(0.2126, 0.7152, 0.0722)), 0.16));
    float coverage = pow(min(energy * 1.3, 1.0), 1.3) * 0.92 * uOpacity;
    outColor = uMode > 2.5 ? vec4(ink * coverage, coverage) : vec4(mix(uBackground, ink, coverage), 1.0);
  } else if (uMode > 0.5) {
    float alpha = min(smoothstep(0.0, 0.3, length(col)), 1.0) * uOpacity;
    outColor = vec4(col * alpha, alpha);
  } else {
    outColor = vec4(mix(uBackground, col, uOpacity), 1.0);
  }
}`;
      const VERT = `#version 300 es
in vec2 aPosition; void main(){ gl_Position = vec4(aPosition,0.0,1.0); }`;
      const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
      const prog = gl.createProgram();
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG.replace('\n', '\n#define PALETTE\n#define REPEL\n')));
      gl.bindAttribLocation(prog, 0, 'aPosition'); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); cv.style.background = '#05060b'; return; }
      const U = {}; for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) { const a = gl.getActiveUniform(prog, i); U[a.name.replace('[0]', '')] = gl.getUniformLocation(prog, a.name); }
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
      const colors = new Float32Array([...hex('#C4B5FD'), ...hex('#A855F7'), ...hex('#F5C451'), ...hex('#E8ECF4')]);
      const bg = hex('#08090D'); const coarse = matchMedia('(pointer: coarse)').matches;
      const S = { time: 0, gloss: 0, depth: 0, angle: 0, mx: .5, my: .5, active: 0, boost: 0, reveal: 0, px: .5, py: .5 };
      const host = cv.parentElement; let vis = true; new IntersectionObserver(e => { vis = e[0].isIntersecting; }).observe(host);
      const resize = () => { const r = Math.min(devicePixelRatio || 1, coarse ? 1 : 1.25); cv.width = Math.max(1, Math.round(host.clientWidth * r)); cv.height = Math.max(1, Math.round(host.clientHeight * r)); };
      resize(); addEventListener('resize', resize);
      addEventListener('pointermove', e => { const rc = host.getBoundingClientRect(); S.px = (e.clientX - rc.left) / rc.width; S.py = 1 - (e.clientY - rc.top) / rc.height; S.on = (e.clientY >= rc.top && e.clientY <= rc.bottom) ? 1 : 0; }, { passive: true });
      addEventListener('pointerdown', () => { S.boost = Math.min(1.6, S.boost + 1); }, { passive: true });
      document.documentElement.addEventListener('pointerleave', () => { S.on = 0; });
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; if (reduce) S.reveal = 1;
      let last = 0;
      (function frame(now) {
        requestAnimationFrame(frame);
        if (document.hidden || !vis || (window.appState && appState.currentView !== 'landing')) { last = 0; return; }
        const dt = last ? Math.min(.05, Math.max(.0005, (now - last) / 1000)) : 1 / 60; last = now;
        if (S.reveal < 1) { S.reveal = Math.min(1, S.reveal + dt / 2.2); S.boost = Math.max(S.boost, Math.pow(1 - S.reveal, 2) * 1.4); }
        const flight = .5 / 10; const mo = reduce ? 0 : 1;
        S.time += dt * mo; S.gloss += dt * flight * mo; S.depth += dt * flight * mo * (1 + S.boost * 14); S.angle += dt * .06 * mo;
        S.boost *= Math.exp(-dt * 1.3); if (S.boost < .001) S.boost = 0;
        const f = 1 - Math.exp(-dt / .325); S.mx += (S.px - S.mx) * f; S.my += (S.py - S.my) * f; S.active += ((S.on || 0) - S.active) * f;
        gl.viewport(0, 0, cv.width, cv.height); gl.useProgram(prog); gl.bindVertexArray(vao);
        const stretch = 1 + S.boost * 5;
        gl.uniform1f(U.uTime, S.time); gl.uniform2f(U.uResolution, cv.width, cv.height); gl.uniform2f(U.uFocal, .5, .5); gl.uniform2f(U.uRotation, 1, 0);
        gl.uniform1f(U.uGloss, S.gloss); gl.uniform1f(U.uDepth, S.depth); gl.uniform1f(U.uDensity, coarse ? .8 : 1); gl.uniform1f(U.uHueShift, 0); gl.uniform1f(U.uSpeed, 1);
        gl.uniform2f(U.uMouse, S.mx, S.my); gl.uniform1f(U.uStarGlow, (.05 * .3) / Math.pow(stretch, .6)); gl.uniform1f(U.uFlareGain, .3); gl.uniform1f(U.uSquash, 1 - 1 / (stretch * stretch));
        gl.uniform1f(U.uSaturation, 0); gl.uniform1f(U.uMouseRepulsion, 1); gl.uniform1f(U.uTwinkleIntensity, .3); gl.uniform1f(U.uRotationAngle, S.angle);
        gl.uniform1f(U.uRepulsionStrength, 1.6); gl.uniform1f(U.uMouseActiveFactor, S.active); gl.uniform1f(U.uAutoCenterRepulsion, 0);
        gl.uniform1i(U.uLayers, coarse ? 3 : 4); gl.uniform3fv(U.uColors, colors); gl.uniform1i(U.uColorCount, 4); gl.uniform1f(U.uWarp, S.boost);
        const fd = Math.min(1, S.reveal / .35); gl.uniform1f(U.uReveal, fd * fd * (3 - 2 * fd)); gl.uniform1f(U.uMode, 0); gl.uniform3fv(U.uBackground, bg); gl.uniform1f(U.uOpacity, .9);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      })(0);
    })();
