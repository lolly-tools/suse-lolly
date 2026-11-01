/* SUSECON background renderer.
 *
 * One stateless WebGL2 fragment pass draws every look of the SUSECON 2027
 * orb: glass orb with its hairline ribbon, fibre orb, cloud dome with its dot
 * sheet, horizon bowl with its floor reflection, and the split composition.
 * Every frame is a pure function of (scene list, loop phase), so any frame can
 * be sought directly and a clip one loop long joins without a seam.
 *
 * Three primitives build each look:
 *   - light fields: soft Gaussian pools, a vertical beam, shadow pools;
 *   - body: a wobbling orb (or cloud: the orb plus two smooth-union lobes)
 *     with refraction, inner rim glow, hot spots, a specular, a rim line and
 *     an optional mirror reflection below a horizon;
 *   - strands: hairlines in ribbon coordinates around the orb (polar), or rows
 *     along a graph curve (dot sheet, fibres).
 * Looks are presets of one continuous state vector, so a scene change is an
 * interpolation of that vector.
 *
 * Exposes window.SuseconOrb.mount(host, cfg) -> controller.
 *
 * Orb design: Zvezdana Marjanovic, SUSE. This renderer draws her design.
 */
(function () {
  'use strict';
  if (window.SuseconOrb) return;

  var TAU = Math.PI * 2;

  /* ── colour ─────────────────────────────────────────────────────────── */
  function hexToRgb(hex) {
    var v = String(hex || '').replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var n = parseInt(v, 16);
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return [0, 0, 0];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function linRgb(hex) { return hexToRgb(hex).map(toLin); }
  function linToOklab(c) {
    var l = 0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2];
    var m = 0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2];
    var s = 0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2];
    l = Math.cbrt(l); m = Math.cbrt(m); s = Math.cbrt(s);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function oklabToLin(o) {
    var l = o[0] + 0.3963377774 * o[1] + 0.2158037573 * o[2];
    var m = o[0] - 0.1055613458 * o[1] - 0.0638541728 * o[2];
    var s = o[0] - 0.0894841775 * o[1] - 1.2914855480 * o[2];
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  var ROLES = ['ground', 'ground2', 'deep', 'key', 'core', 'lines', 'flare', 'haze', 'accent'];
  var BLENDS = ['light', 'smooth', 'vivid', 'srgb'];
  function rolesToLab(roles) {
    var out = {};
    ROLES.forEach(function (r) { out[r] = linToOklab(linRgb(roles && roles[r] ? roles[r] : '#000000')); });
    out.flareOn = roles && roles.flareOn === false ? 0 : 1;
    out.light = roles && roles.light ? 1 : 0;
    return out;
  }

  /* ── shader ─────────────────────────────────────────────────────────── */
  var VERT = '#version 300 es\nin vec2 a_pos;\nvoid main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }\n';

  var FRAG = `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;

uniform vec2 u_res;
uniform vec2 u_off;
uniform vec4 u_cam;      // centre x, centre y, zoom, hairline width (device px)
uniform float u_px;      // scene units per device pixel
uniform float u_exposure;
uniform float u_seed;
uniform vec3 u_ground, u_ground2, u_deep, u_key, u_core, u_lines, u_accent;
uniform vec4 u_pool[6];
uniform vec3 u_poolCol[6];
uniform vec4 u_poolS[6];   // x stretch, y stretch, rotation, -
uniform float u_beamR;     // beam direction, radians from straight down
uniform int u_blend;       // 0 light (additive), 1 smooth (OKLab), 2 vivid (OKLCH), 3 sRGB
uniform int u_hueLong;     // vivid: 1 travels the long way round the hue circle
uniform vec4 u_shade[3];
uniform vec4 u_beam;     // x, half width, strength, reach
uniform vec4 u_orb;      // cx, cy, R, body
uniform vec4 u_wobA;
uniform vec4 u_wobP;
uniform vec4 u_lobeL;    // dx, dy, r (R units), weight
uniform vec4 u_lobeR;
uniform vec4 u_glass;    // interior, refraction, shelf, dark rim
uniform vec4 u_rim;      // strength, band width, outer width, rim line
uniform vec4 u_rim2;     // band offset, fill amount, fill width, hot gain
uniform vec4 u_hotA;     // angle 1, angle 2, angle 3, spread
uniform vec4 u_hotB;     // weight 1, weight 2, weight 3, core
uniform vec4 u_tint;     // accent angle, amount, spread, light-mode
uniform vec4 u_spec;     // strength, length, width, inset
uniform vec4 u_refl;     // amount, horizon y, soften, line
uniform vec4 u_sk;       // kind (0 polar, 1 graph), count, alpha, glow
uniform vec4 u_sg;       // polar: base width, fan width, fan twist, offset; graph: band width
uniform vec4 u_sr;       // ripple amp, ripple cycles, ripple phase, kink
uniform vec4 u_sp;       // lift amp, fan centre, fan width, hot boost
uniform vec4 u_sd;       // dash duty, dash period, start dot radius, perspective
uniform vec4 u_sw;       // graph: y0, bump amp, bump sigma, slope
uniform vec4 u_sw2;      // graph: wave amp, wave freq, wave phase, bump x
uniform vec4 u_sf;       // fibres: on, end reach, start jitter, noise angle
uniform vec4 u_rbC0;     // ribbon centre offset Fourier: c0, a1, b1, a2
uniform vec4 u_rbC1;     // b2, a3, b3, per-line shimmer
uniform vec4 u_rbW0;     // ribbon width Fourier: w0, a1, b1, a2
uniform vec4 u_rbW1;     // b2, a3, b3, shimmer phase
uniform vec4 u_rbT;      // twist cycles, twist phase, tint amount, -
uniform vec4 u_rbP;      // peel: depth (R units, inward), centre angle, width, skew
uniform vec4 u_act;      // energy: rim wave amp (R units), line wave amp, wave phase, kick 0..1

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float hashu(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return float(x) * (1.0 / 4294967295.0);
}
float h1(int i, int salt) { return hashu(uint(i + 8192) * 2654435761u + uint(salt) * 40503u + 1013904223u); }
float angd(float a, float b) { return mod(a - b + PI, TAU) - PI; }

/* The rim: slow wobble harmonics, plus travelling waves that grow with the
   energy setting and kick with the beat (the music-reactive state). */
float orbR(float a) {
  float wave = u_act.x * (0.6 * sin(7.0 * a - u_act.z) + 0.4 * sin(11.0 * a + 2.0 * u_act.z)
    + 0.12 * sin(17.0 * a - 3.0 * u_act.z));
  return u_orb.z * (1.0 + u_wobA.x * cos(2.0 * a + u_wobP.x) + u_wobA.y * cos(3.0 * a + u_wobP.y)
    + u_wobA.z * cos(4.0 * a + u_wobP.z) + u_wobA.w * cos(5.0 * a + u_wobP.w) + wave);
}
float smin(float a, float b, float k) {
  if (k <= 1e-5) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float lobe(vec2 p, vec4 L, float d) {
  if (L.w <= 0.001) return d;
  float R = u_orb.z;
  vec2 c = u_orb.xy + L.xy * R * L.w;
  float r = mix(0.3, L.z, L.w) * R;
  return smin(d, length(p - c) - r, 0.05 * R * L.w);
}
float bodySdf(vec2 p, out float ang) {
  vec2 d = p - u_orb.xy;
  ang = atan(d.y, d.x);
  float s = length(d) - orbR(ang);
  s = lobe(p, u_lobeL, s);
  s = lobe(p, u_lobeR, s);
  return s;
}

/* Blend spaces. Colours are linear RGB everywhere else; a blend converts to
   its space, mixes there and converts back. Smooth is OKLab (perceptually
   even), Vivid is OKLCH (lightness and chroma blend straight, hue travels round
   the circle, so midtones keep their colour), sRGB is the classic gamma blend
   a CSS gradient makes, and Light adds colours as light. */
float cbrtS(float x) { return sign(x) * pow(abs(x), 1.0 / 3.0); }
vec3 linToLab(vec3 c) {
  float l = cbrtS(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  float m = cbrtS(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  float s = cbrtS(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 labToLin(vec3 o) {
  float l = o.x + 0.3963377774 * o.y + 0.2158037573 * o.z;
  float m = o.x - 0.1055613458 * o.y - 0.0638541728 * o.z;
  float s = o.x - 0.0894841775 * o.y - 1.2914855480 * o.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return max(vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0);
}
vec3 encodeS(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 decodeS(vec3 c) { return mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSpace(vec3 lin) {
  if (u_blend == 1) return linToLab(lin);
  if (u_blend == 2) { vec3 l = linToLab(lin); return vec3(l.x, length(l.yz), atan(l.z, l.y)); }
  if (u_blend == 3) return encodeS(lin);
  return lin;
}
vec3 fromSpace(vec3 s) {
  if (u_blend == 1) return labToLin(s);
  if (u_blend == 2) return labToLin(vec3(s.x, s.y * cos(s.z), s.y * sin(s.z)));
  if (u_blend == 3) return decodeS(s);
  return s;
}
vec3 mixS(vec3 a, vec3 b, float t) {
  if (u_blend != 2) return mix(a, b, t);
  // Hue is weighted by chroma, so a near-grey end takes the other end's hue
  // instead of swinging through colours neither end has.
  float d = angd(b.z, a.z);
  // The long way only between clearly different hues; near neighbours would
  // otherwise loop the whole wheel.
  if (u_hueLong == 1 && abs(d) > 0.6) d = d > 0.0 ? d - TAU : d + TAU;
  float th = t * b.y / max((1.0 - t) * a.y + t * b.y, 1e-5);
  return vec3(mix(a.x, b.x, t), mix(a.y, b.y, t), a.z + d * th);
}
vec3 mixC(vec3 a, vec3 b, float t) {
  t = clamp(t, 0.0, 1.0);
  if (u_blend == 0) return mix(a, b, t);
  return fromSpace(mixS(toSpace(a), toSpace(b), t));
}

float poolW(int i, vec2 p) {
  vec4 q = u_pool[i];
  if (q.w <= 0.0) return 0.0;
  vec2 d = p - q.xy;
  float cr = cos(u_poolS[i].z), sr = sin(u_poolS[i].z);
  d = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y) / u_poolS[i].xy;
  return q.w * exp(-dot(d, d) / (q.z * q.z));
}
float beamW(vec2 p) {
  if (u_beam.z <= 0.0) return 0.0;
  float cb = cos(u_beamR), sb = sin(u_beamR);
  vec2 r = vec2(cb * p.x + sb * p.y, -sb * p.x + cb * p.y);
  float bx = (r.x - u_beam.x) / u_beam.y;
  return u_beam.z * exp(-bx * bx) * exp(-max(0.5 - r.y, 0.0) / u_beam.w);
}
vec3 lightField(vec2 p, float sh) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 6; i++) c += u_poolCol[i] * poolW(i, p);
  c += u_accent * beamW(p);
  return c * (1.0 - 0.8 * sh);
}
float shadeAt(vec2 p) {
  float sh = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 s = u_shade[i];
    if (s.w <= 0.0) continue;
    vec2 d = p - s.xy;
    sh = max(sh, s.w * exp(-dot(d, d) / (s.z * s.z)));
  }
  return clamp(sh, 0.0, 1.0);
}
/* The background: ground, dark pools, light pools and the beam. Light adds
   the pools as light (linear, as the first version did); the other modes lay
   each pool over what is beneath it, in their blend space, with a coverage
   chosen so a pool reads about as strong as its added light would. */
vec3 backgroundAt(vec2 p, out float sh) {
  sh = shadeAt(p);
  if (u_blend == 0) return mix(u_ground, u_ground2, sh) + lightField(p, sh);
  vec3 c = mixS(toSpace(u_ground), toSpace(u_ground2), sh);
  float keep = 1.0 - 0.8 * sh;
  for (int i = 0; i < 6; i++) {
    float w = poolW(i, p);
    if (w <= 1e-4) continue;
    c = mixS(c, toSpace(u_poolCol[i]), (1.0 - exp(-1.9 * w)) * keep);
  }
  float bw = beamW(p);
  if (bw > 1e-4) c = mixS(c, toSpace(u_accent), (1.0 - exp(-1.9 * bw)) * keep);
  return fromSpace(c);
}

float hotAt(float a) {
  float s = u_hotA.w;
  float d1 = angd(a, u_hotA.x) / s;
  float d2 = angd(a, u_hotA.y) / s;
  float d3 = angd(a, u_hotA.z) / (s * 0.75);
  return u_hotB.x * exp(-d1 * d1) + u_hotB.y * exp(-d2 * d2) + u_hotB.z * exp(-d3 * d3);
}
float lineCov(float dist, float hw, float px) {
  float w = max(hw, 0.5 * px);
  return (hw / w) * clamp((w + 0.5 * px - dist) / px, 0.0, 1.0);
}

vec3 bodyLight(vec2 p, float soft, float px, out float dOut, out float angOut, out float hotOut, out float inside) {
  float ang;
  float d = bodySdf(p, ang);
  float R = u_orb.z;
  inside = (1.0 - smoothstep(-px, px, d)) * u_orb.w;
  // Angle-driven terms fade toward the centre, where every angle meets.
  float hotW = smoothstep(0.2, 0.7, clamp(1.0 + d / R, 0.0, 2.0));
  float hot = hotAt(ang) * hotW;
  dOut = d; angOut = ang; hotOut = hot;
  if (u_orb.w <= 0.0) return vec3(0.0);
  float bw = u_rim.y * R * soft;
  float sOut = u_rim.z * R * soft;
  float off = u_rim2.x * R;
  float bd = (min(d, 0.0) + off) / bw;
  float band = exp(-bd * bd) * inside;
  float fill = exp(min(d, 0.0) / max(u_rim2.z * R * soft, 1e-4)) * inside * u_rim2.y;
  float gout = exp(-max(d, 0.0) / sOut) * (1.0 - inside) * u_orb.w;
  float ta = angd(ang, u_tint.x) / u_tint.z;
  float tk = clamp(u_tint.y * exp(-ta * ta), 0.0, 1.0) * hotW;
  vec3 rimCol = mixC(u_key, u_accent, tk);
  float hg = u_rim2.w;
  vec3 L = rimCol * u_rim.x * (band * (0.14 + 0.3 * u_tint.w + hg * hot) + fill * (0.5 + 0.5 * hot) * (1.0 + 2.0 * u_tint.w) + gout * (0.06 + 0.4 * hot));
  // Hot cores: the band's tight middle, squared, left to clip in tone().
  float cd = (min(d, 0.0) + off) / (bw * 0.45);
  float core = exp(-cd * cd) * inside;
  vec3 coreCol = mixC(u_core, u_accent, tk * 0.5);
  L += coreCol * core * hot * hot * u_hotB.w * 1.4;
  if (u_spec.x > 0.0) {
    float a1 = u_hotA.x;
    vec2 dir = vec2(cos(a1), sin(a1));
    vec2 c = u_orb.xy + dir * (orbR(a1) - u_spec.w * R);
    vec2 rel = p - c;
    float along = dot(rel, vec2(-dir.y, dir.x)) / (u_spec.y * R * soft);
    float across = dot(rel, dir) / (u_spec.z * R * soft);
    float e = exp(-(along * along + across * across));
    vec3 sc = mixC(u_core, u_accent, tk * 0.6);
    L += mix(sc, vec3(1.0), 0.35) * u_spec.x * e * e * 2.0 + sc * u_spec.x * e * 0.6;
  }
  if (u_rim.w > 0.0) {
    float hw = 0.5 * u_cam.w * px * 1.25;
    float cov = lineCov(abs(d), hw * soft, px * soft);
    L += mixC(u_key, u_lines, 0.3) * cov * u_rim.w * (0.45 + 0.8 * hot) * (1.0 + 0.8 * u_act.w);
    L += u_key * exp(-abs(d) / (5.0 * px * soft)) * u_rim.w * 0.12 * (0.4 + hot);
  }
  return L;
}

/* Ribbon strands around the orb: strand i sits at a radial offset from the
   rim made of a twisted width profile, its own ripple and a peel excursion. */
/* The ribbon around the orb: a centre offset and a width that vary smoothly
   with angle (three harmonics each), a twist that pinches the ribbon and
   swaps its lines, and a small per-line shimmer. Lines stay near parallel,
   as in the reference. */
float fourier(vec4 A, vec4 B, float a) {
  return A.x + A.y * cos(a) + A.z * sin(a) + A.w * cos(2.0 * a) + B.x * sin(2.0 * a) + B.y * cos(3.0 * a) + B.z * sin(3.0 * a);
}
void ribbonAt(float a, out float centre, out float width) {
  float R = u_orb.z;
  centre = orbR(a) + R * fourier(u_rbC0, u_rbC1, a);
  width = R * max(fourier(u_rbW0, u_rbW1, a), 0.004) * cos(u_rbT.x * a + u_rbT.y);
}
float shimmer(int i, float fi, float a) {
  float ph = h1(i, 1) * TAU;
  float amp = 0.4 + h1(i, 3);
  float s = u_orb.z * u_rbC1.w * amp * sin(3.0 * a + ph + u_rbW1.w) * (0.6 + 0.4 * sin(2.0 * a - ph));
  // Energy: the lines part and rejoin like a waveform, each a little out of phase.
  return s + u_orb.z * u_act.y * (0.35 + 1.3 * abs(fi)) * sin(9.0 * a - 2.0 * u_act.z + fi * 3.2);
}
/* Peel: over one stretch of the rim the outer lines leave the bundle one by
   one and sweep into the glass, then return (the slide 6 close-ups). */
float peel(float fi, float a) {
  if (u_rbP.x <= 0.0) return 0.0;
  float z = angd(a, u_rbP.y) / u_rbP.z;
  float env = exp(-z * z) * (1.0 + u_rbP.w * tanh(z));
  float k = smoothstep(-0.2, 0.5, fi);
  return -u_orb.z * u_rbP.x * env * k * k;
}

float gY(float x) {
  float dx = (x - u_sw2.w) / u_sw.z;
  return u_sw.x + u_sw.y * exp(-dx * dx) + u_sw.w * x + u_sw2.x * sin(u_sw2.y * x + u_sw2.z);
}
float gD(float x) {
  float dx = (x - u_sw2.w) / u_sw.z;
  return u_sw.y * exp(-dx * dx) * (-2.0 * dx / u_sw.z) + u_sw.w + u_sw2.x * u_sw2.y * cos(u_sw2.y * x + u_sw2.z);
}
float vn(float x, int seed) {
  float fl = floor(x);
  float f = x - fl;
  int ii = int(fl);
  float a = h1(ii, seed);
  float b = h1(ii + 1, seed);
  float s = mix(f * f * (3.0 - 2.0 * f), f, u_sr.w);
  return mix(a, b, s) * 2.0 - 1.0;
}
float graphBase(float f) { return u_sg.x * (0.5 - pow(1.0 - f, 1.0 + u_sd.w)); }
float graphOffset(int i, float f, float s, float s0, float X) {
  float base = graphBase(f);
  if (u_sf.x > 0.5) base *= 1.0 - u_sp.x * clamp((s - s0) / max(2.0 * X, 1e-3), 0.0, 1.0);
  float grow = 1.0;
  if (u_sf.x > 0.5) grow = 0.3 + 0.7 * clamp((s - s0) / max(0.6 * X, 1e-3), 0.0, 1.0);
  float r;
  if (u_sr.w > 0.5) {
    float x = s * u_sr.y;
    r = vn(x, i * 7 + 3) * cos(u_sf.w) + vn(x + 17.0, i * 7 + 5) * sin(u_sf.w);
    r += 0.45 * vn(x * 2.7 + 5.0, i * 7 + 11);
  } else {
    float ph = h1(i, 4) * TAU;
    r = 0.7 * sin(u_sr.y * s + ph + u_sr.z) + 0.3 * sin(u_sr.y * 1.7 * s - ph + 2.0 * u_sr.z);
  }
  return base + u_sr.x * grow * r;
}

vec3 strands(vec2 p, float px, float hotNear) {
  int N = int(ceil(u_sk.y));
  if (N <= 0 || u_sk.z <= 0.0) return vec3(0.0);
  float hw = 0.5 * u_cam.w * px;
  vec3 col = vec3(0.0);
  float glow = 0.0;
  if (u_sk.x < 0.5) {
    vec2 rel = p - u_orb.xy;
    float r = length(rel);
    float a = atan(rel.y, rel.x);
    float da = 0.002;
    float c0, w0, c1, w1;
    ribbonAt(a, c0, w0);
    ribbonAt(a + da, c1, w1);
    float arc = da * max(r, 1e-4);
    float acc = 0.0;
    for (int i = 0; i < 40; i++) {
      if (i >= N) break;
      float al = clamp(u_sk.y - float(i), 0.0, 1.0);
      float fi = N > 1 ? float(i) / float(N - 1) - 0.5 : 0.0;
      float o = c0 + w0 * fi + shimmer(i, fi, a) + peel(fi, a);
      float rough = abs(r - o);
      if (rough > 40.0 * px) continue;
      float o2 = c1 + w1 * fi + shimmer(i, fi, a + da) + peel(fi, a + da);
      float slope = (o2 - o) / arc;
      float dist = rough / sqrt(1.0 + slope * slope);
      acc += lineCov(dist, hw * (0.85 + 0.3 * h1(i, 5)), px) * al * (0.6 + 0.4 * h1(i, 6));
      glow += exp(-dist / (2.5 * px)) * al;
    }
    float ta = angd(a, u_tint.x) / u_tint.z;
    float tk = clamp(u_rbT.z * exp(-ta * ta), 0.0, 1.0);
    vec3 lc = mixC(u_lines, u_accent, 0.6 * tk);
    col = lc * acc * (0.34 + u_sp.w * hotNear);
    col += mixC(lc, u_key, 0.5) * glow * u_sk.w * 0.05 * (0.4 + hotNear);
    return col * u_sk.z;
  }
  float x = p.x;
  float gy = gY(x);
  float gd = gD(x);
  float n = (p.y - gy) / sqrt(1.0 + gd * gd);
  float s = x;
  int i0 = 0;
  int i1 = N - 1;
  if (N > 40) {
    float W = u_sg.x;
    float fq = clamp(n / W + 0.5, 0.0, 1.0);
    float f = 1.0 - pow(1.0 - fq, 1.0 / (1.0 + u_sd.w));
    float ic = f * float(N - 1);
    float spacing = W / float(N - 1);
    int K = int(min(18.0, ceil(1.45 * u_sr.x / spacing) + 2.0));
    i0 = max(0, int(ic) - K);
    i1 = min(N - 1, int(ic) + K);
  }
  for (int j = 0; j < 40; j++) {
    int i = i0 + j;
    if (i > i1) break;
    float al = clamp(u_sk.y - float(i), 0.0, 1.0);
    float f = N > 1 ? float(i) / float(N - 1) : 0.5;
    float s0 = -1e3;
    float s1 = 1e3;
    float X = 1.0;
    if (u_sf.x > 0.5) {
      float b = graphBase(f) + u_sw.x - u_orb.y;
      X = sqrt(max(u_orb.z * u_orb.z - b * b, 0.0));
      if (X <= 0.002) continue;
      s0 = u_orb.x - X * (1.0 + u_sf.z * (h1(i, 9) - 0.5));
      s1 = u_orb.x + X * u_sf.y;
      if (s < s0 - 12.0 * px || s > s1 + 12.0 * px) continue;
    }
    float o = graphOffset(i, f, s, s0, X);
    float rough = abs(n - o);
    if (rough > 40.0 * px && u_sf.x < 0.5) continue;
    float o2 = graphOffset(i, f, s + 0.0015, s0, X);
    float slope = (o2 - o) / 0.0015;
    float dist = rough / sqrt(1.0 + slope * slope);
    vec3 c = u_lines;
    float cov;
    if (u_sd.x < 0.999) {
      float near = 1.0 - f;
      float period = u_sd.y * (0.5 + 0.9 * near);
      float cell = s / period + h1(i, 6) + u_sr.z * 0.0;
      float along = abs(fract(cell) - 0.5) * period;
      float halfLen = period * u_sd.x * 0.5;
      float rad = (0.7 + 1.1 * near) * max(hw, 0.5 * px);
      float dd = length(vec2(max(along - halfLen, 0.0), dist));
      cov = smoothstep(rad + px, rad - 0.5 * px, dd) * (0.3 + 0.7 * near);
      if (cov > 0.001) {
        float sx = clamp((s + 0.6) / 1.4, 0.0, 1.0);
        c = mixC(u_lines, u_accent, smoothstep(0.25, 0.75, sx));
        c = mixC(c, u_key, clamp(near * (1.0 - sx * 1.6), 0.0, 1.0) * 0.9);
      }
    } else {
      cov = lineCov(dist, hw * (0.8 + 0.4 * h1(i, 5)), px);
      glow += exp(-dist / (2.5 * px)) * al * 0.3;
    }
    float m = 1.0;
    if (u_sf.x > 0.5) {
      m = smoothstep(s0 - px, s0 + px, s) * (1.0 - smoothstep(s1 - 0.3 * u_orb.z, s1, s));
      float o0 = graphOffset(i, f, s0, s0, X);
      float dd0 = length(vec2(s - s0, n - o0));
      cov = max(cov * m, smoothstep(u_sd.z + px, u_sd.z - 0.5 * px, dd0));
      m = 1.0;
    }
    col += c * cov * m * al;
  }
  col += u_lines * glow * u_sk.w * 0.05;
  return col * u_sk.z * (1.0 + u_sp.w * hotNear * 0.5);
}

vec3 tone(vec3 c) {
  vec3 k = vec3(0.62);
  vec3 o = max(c - k, 0.0);
  return min(c, k) + (1.0 - k) * (1.0 - exp(-o / (1.0 - k)));
}
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 fc = gl_FragCoord.xy + u_off;
  vec2 uv = (fc - 0.5 * u_res) / u_res.y;
  vec2 p = uv / u_cam.z + u_cam.xy;
  float px = u_px;
  float sh;
  vec3 bg = backgroundAt(p, sh);
  vec3 light = vec3(0.0);
  float d, ang, hot, inside;
  vec3 B = bodyLight(p, 1.0, px, d, ang, hot, inside);
  float R = u_orb.z;
  if (inside > 0.0) {
    vec2 rel = p - u_orb.xy;
    float rr = clamp(length(rel) / R, 0.0, 1.0);
    vec2 q = u_orb.xy + rel * mix(1.0, 0.3 + 0.7 * rr * rr, u_glass.y);
    float sy = (p.y - u_orb.y) / R;
    float shelf = smoothstep(0.0, -0.75, sy) * u_glass.z;
    vec3 inBg;
    if (u_blend == 0) {
      float s2 = shadeAt(q);
      inBg = mix(mix(u_ground, u_ground2, s2), u_deep, u_glass.x) + lightField(q, s2) * (1.0 - 0.8 * u_glass.x);
    } else {
      float s2;
      inBg = mixC(backgroundAt(q, s2), u_deep, u_glass.x);
    }
    inBg += mixC(u_key, u_core, 0.3) * 0.3 * shelf;
    bg = mix(bg, inBg, inside);
  }
  if (u_glass.w > 0.0 && u_orb.w > 0.0) {
    float e = (d - 0.03 * R) / (0.016 * R);
    bg *= 1.0 - u_glass.w * exp(-e * e);
  }
  light += B;
  float hotNear = hot * exp(-abs(d) / (0.3 * R)) * u_orb.w;
  light += strands(p, px, hotNear);
  if (u_refl.x > 0.0 && p.y < u_refl.y) {
    vec2 q = vec2(p.x, 2.0 * u_refl.y - p.y);
    float d2, a2, h2, in2;
    vec3 Lr = bodyLight(q, u_refl.z, px, d2, a2, h2, in2);
    float fade = exp(-(u_refl.y - p.y) / 0.5);
    light += Lr * u_refl.x * fade;
  }
  vec3 c = tone((bg + light) * u_exposure);
  c = toSrgb(c);
  float dz = hashu(uint(fc.x) * 1973u + uint(fc.y) * 9277u + uint(u_seed) * 26699u) - 0.5;
  fragColor = vec4(c + dz / 255.0, 1.0);
}
`;

  /* ── looks ──────────────────────────────────────────────────────────── */
  function blank() {
    return {
      cam: [0, 0, 1], orb: [0, 0, 0.37, 0], wobA: [0, 0, 0, 0], wobP: [0, 0, 0, 0],
      lobeL: [0, 0, 0.5, 0], lobeR: [0, 0, 0.5, 0], glass: [0, 0, 0, 0], rim: [0, 0.2, 0.05, 0], rim2: [0, 0, 0.3, 1.3],
      hotA: [0, 0, 0, 0.4], hotB: [0, 0, 0, 0], tint: [0, 0, 1, 0], spec: [0, 0.14, 0.08, 0.08],
      refl: [0, -9, 1, 0], beam: [0, 0.2, 0, 0.5], beamR: 0,
      pools: [], shade: [],
      sk: [0, 0, 1, 0], sg: [0, 0, 0, 0], sr: [0, 0, 0, 0], sp: [0, 0, 1, 0], sd: [1, 0.02, 0, 0],
      sw: [0, 0, 1, 0], sw2: [0, 0, 0, 0], sf: [0, 1, 0, 0], exposure: 1,
      rbC0: [0, 0, 0, 0], rbC1: [0, 0, 0, 0], rbW0: [0.05, 0, 0, 0], rbW1: [0, 0, 0, 0], rbT: [0, 0, 0, 0], rbP: [0, 0, 1, 0], act: [0, 0, 0, 0],
    };
  }
  function pool(role, x, y, r, s, sx, sy) { return { role: role, v: [x, y, r, s], sh: [sx || 1, sy || 1, 0] }; }

  /* ctx: a (aspect), t (loop phase), mot (0..1 sway), cyc (whole cycles per
     loop), glow, lines, flow (0..1). osc() sways by an amount scaled by mot;
     trav() is a travelling phase with whole cycles so the loop closes. */
  function motion(ctx) {
    var t = ctx.t, mot = ctx.mot, cyc = ctx.cyc;
    return {
      osc: function (k, ph) { return mot * Math.sin(TAU * k * cyc * t + ph); },
      // Light sways: scaled by the light motion choice (0 when lights are still).
      lo: function (k, ph) { return mot * (ctx.lightDrift == null ? 1 : ctx.lightDrift) * Math.sin(TAU * k * cyc * t + ph); },
      trav: function (k) { return mot > 0 ? TAU * k * cyc * t : 0; },
    };
  }

  /* Fit harmonics 0..3 to eight values at 0, 45, ... 315 degrees, so a look
     can state its ribbon as measured offsets around the orb. */
  function fit8(v) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    for (var j = 0; j < 8; j++) {
      var a = j * TAU / 8;
      c[0] += v[j] / 8;
      c[1] += v[j] * Math.cos(a) / 4; c[2] += v[j] * Math.sin(a) / 4;
      c[3] += v[j] * Math.cos(2 * a) / 4; c[4] += v[j] * Math.sin(2 * a) / 4;
      c[5] += v[j] * Math.cos(3 * a) / 4; c[6] += v[j] * Math.sin(3 * a) / 4;
    }
    return c;
  }
  function ribbon(s, centre, width, twistK, twistPh, shimmer, shimmerPh, tint) {
    var C = fit8(centre), W = fit8(width);
    s.rbC0 = [C[0], C[1], C[2], C[3]]; s.rbC1 = [C[4], C[5], C[6], shimmer];
    s.rbW0 = [W[0], W[1], W[2], W[3]]; s.rbW1 = [W[4], W[5], W[6], shimmerPh];
    s.rbT = [twistK, twistPh, tint, 0];
  }

  var LOOKS = {
    /* Slides 1 and 2: wobbling glass orb, rim band with two hot spots, a
       tight hairline bundle that fans and crosses over the top right. */
    glass: function (c) {
      var m = motion(c), s = blank(), ex = c.a / 2, g = 0.45 + 1.1 * c.glow;
      s.orb = [0.016 + 0.008 * m.osc(1, 0.7), -0.012 + 0.006 * m.osc(1, 0.3), 0.35, 1];
      s.wobA = [0.03 + 0.01 * m.osc(1, 1.0), 0.016 + 0.008 * m.osc(1, 2.2), 0.007 + 0.004 * m.osc(2, 0.4), 0.004];
      s.wobP = [0.2 + 0.7 * m.osc(1, 0), 2.6 + 0.6 * m.osc(1, 1.7), 0.9 + 0.5 * m.osc(1, 0.4), 1.0 + 0.5 * m.osc(1, 2.9)];
      s.glass = [0.88, 0.35, 0.1, 0.0];
      s.rim = [g, 0.16, 0.07, 0.0];
      s.rim2 = [0.035, 0.2, 0.22, 1.35];
      s.hotA = [2.52 + 0.14 * m.osc(1, 0.5), -0.42 + 0.14 * m.osc(1, 2.0), 3.5 + 0.1 * m.osc(1, 1.1), 0.34];
      s.hotB = [1.1, 0.95, 0.5, 0.8 + 0.6 * c.glow];
      s.tint = [2.52, 0.75, 0.6, 0];
      s.spec = [0.45 * g, 0.15, 0.085, 0.09];
      s.pools = [
        pool('flare', -1.0 * ex + 0.03 * m.lo(1, 0.2), -0.02 + 0.025 * m.lo(1, 1.4), 0.3, 0.95, 1.7, 0.72),
        pool('key', 0.98 * ex, 0.55 + 0.02 * m.lo(1, 2.1), 0.48, 0.5),
        pool('haze', 0.95 * ex, -0.45, 0.32, 0.16),
        pool('key', -0.7 * ex, -0.62, 0.36, 0.26),
        pool('flare', -0.95 * ex, -0.5, 0.25, 0.22),
        pool('key', 0.75 * ex, -0.6, 0.3, 0.22),
      ];
      s.shade = [[-0.02, 0.62, 0.45, 1.0], [0.95 * ex, 0.0, 0.38, 0.8], [0.25, 0.1, 0.3, 0.3]];
      s.sk = [0, Math.round(c.lines * 26 * 10) / 10, 0.9, 0.3];
      s.sp = [0, 0, 1, 1.5];
      var fl = 0.4 + 1.2 * c.flow, sw = m.osc(1, 0.8);
      // Measured from slide 1, counter-clockwise from 3 o'clock (R units).
      ribbon(s,
        [0.08, 0.06 + 0.03 * sw, 0.13 + 0.025 * m.osc(1, 2.1), 0.0, 0.035, 0.03, 0.035, 0.06],
        [0.14 * fl, (0.36 + 0.06 * sw) * fl, 0.26 * fl, 0.05 * fl, 0.05 * fl, 0.05 * fl, 0.08 * fl, 0.11 * fl],
        1, -0.7 + 0.35 * m.osc(1, 1.5), 0.006 * fl, m.trav(2), 0.8);
      s.rbP = [(0.2 + 0.12 * m.osc(1, 0.6)) * fl, 1.35 + 0.25 * m.osc(1, 2.4), 0.38, 0.5];
      return s;
    },
    /* Slide 3, left: kinked fibres from a hemisphere of dots. */
    fibres: function (c) {
      var m = motion(c), s = blank(), ex = c.a / 2;
      s.orb = [-0.02, 0.0, 0.64, 0];
      s.pools = [
        pool('key', -0.95 * ex, -0.55 + 0.03 * m.lo(1, 0.3), 0.6, 0.45, 1.3, 1),
        pool('key', 0.92 * ex, 0.55, 0.45, 0.25),
        pool('haze', 0.6 * ex, -0.45, 0.4, 0.1),
      ];
      s.shade = [[-0.45 * ex, 0.6, 0.45, 0.55], [0.95 * ex, -0.05, 0.45, 0.6]];
      s.sk = [1, Math.round(c.lines * 260), 0.55, 0.0];
      s.sg = [1.3, 0, 0, 0];
      s.sr = [0.03 * (0.3 + 1.4 * c.flow), 9.0, 0, 1];
      s.sd = [1, 0.02, 0.0042, 0];
      s.sw = [0.0, 0, 1, 0];
      s.sf = [1, 1.0, 0.55, m.trav(1) + 0.4];
      s.sp = [0.16, 0, 1, 0];
      return s;
    },
    /* Slide 3, right: the same sphere as glass, lit from the top right. */
    rim: function (c) {
      var m = motion(c), s = blank(), ex = c.a / 2, g = 0.45 + 1.1 * c.glow;
      s.orb = [-0.03, 0.0, 0.5, 1];
      s.wobA = [0.012, 0.01 + 0.005 * m.osc(1, 0.5), 0.004, 0];
      s.wobP = [0.4 + 0.5 * m.osc(1, 0.2), 1.2, 2.0, 0];
      s.glass = [0.85, 0.3, 0, 0];
      s.rim = [g, 0.16, 0.08, 0.5];
      s.rim2 = [0.04, 0.12, 0.25, 1.6];
      s.hotA = [1.05 + 0.12 * m.osc(1, 0.3), 0.2, -1.3, 0.5];
      s.hotB = [1.3, 0.3, 0.12, 0.9 + 0.5 * c.glow];
      s.tint = [1.0, 0.4, 0.5, 0];
      s.pools = [pool('key', 0.7 * ex, 0.62, 0.45, 0.4), pool('key', 0.1, -0.65, 0.35, 0.2)];
      s.shade = [[0.98 * ex, -0.1, 0.45, 0.95]];
      return s;
    },
    /* Slide 4: the dome with two lobes, a blue beam and a draped dot sheet. */
    cloud: function (c) {
      var m = motion(c), s = blank(), ex = c.a / 2, g = 0.45 + 1.1 * c.glow;
      s.orb = [0.065, -0.32 + 0.005 * m.osc(1, 0.4), 0.512, 1];
      s.wobA = [0.003 * m.osc(1, 0), 0.003 * m.osc(1, 1), 0, 0];
      s.lobeL = [-1.33, -0.17, 0.66, 1];
      s.lobeR = [1.33, -0.29, 0.4, 1];
      s.glass = [0.75, 0.3, 0, 0];
      s.rim = [g * 1.3, 0.035, 0.02, 0.9];
      s.rim2 = [0.0, 0.32, 0.1, 1.5];
      s.hotA = [2.3 + 0.1 * m.osc(1, 0.6), -0.35 + 0.08 * m.osc(1, 2), 3.0, 0.6];
      s.hotB = [1.0, 1.0, 0.9, 0.6 + 0.5 * c.glow];
      s.tint = [0.75, 0.95, 0.65, 0];
      s.beam = [-0.02 + 0.02 * m.lo(1, 0.1), 0.28, 1.0 + 0.12 * m.lo(1, 1.3), 0.4];
      s.pools = [
        pool('key', 0.98 * ex, 0.45, 0.42, 0.42),
        pool('key', 0.9 * ex, -0.5, 0.3, 0.3),
        pool('haze', -0.95 * ex, -0.3, 0.35, 0.16),
      ];
      s.shade = [[-0.7 * ex, 0.5, 0.5, 0.95], [0.55 * ex, 0.2, 0.25, 0.3]];
      s.sk = [1, Math.min(40, Math.round(c.lines * 62 * 10) / 10), 0.95, 0];
      s.sg = [0.22, 0, 0, 0];
      s.sr = [0.006 * (0.3 + 1.4 * c.flow), 5.5, m.trav(1), 0];
      s.sd = [0.18, 0.0105, 0, 1.5];
      s.sw = [-0.2, 0.36 + 0.015 * m.osc(1, 0.8), 0.62, 0.0];
      s.sw2 = [0.03 * (0.4 + c.flow), 3.2, m.trav(1), -0.09];
      s.sp = [0, 0, 1, 0.9];
      return s;
    },
    /* Slide 5: the bottom of a giant orb, a crescent glow just inside the
       rim line, and its mirror reflection below the horizon. */
    horizon: function (c) {
      var m = motion(c), s = blank(), g = 0.45 + 1.1 * c.glow;
      s.orb = [0.0, 0.867, 1.054, 1];
      s.wobA = [0.002 * m.osc(1, 0), 0.0015 * m.osc(1, 1.3), 0, 0];
      s.glass = [0.1, 0.0, 0, 0];
      s.rim = [g, 0.075, 0.02, 0.85];
      s.rim2 = [0.13, 0.1, 0.36, 1.7];
      s.hotA = [-1.5708 + 0.06 * m.osc(1, 0.3), -0.45, -2.69, 0.34];
      s.hotB = [1.25 + 0.12 * m.osc(1, 1.1), 0.2, 0.2, 0.75 + 0.5 * c.glow];
      s.tint = [-1.5708, 0.15, 0.3, 0];
      s.refl = [0.3, -0.187, 1.8, 0.5];
      s.pools = [];
      return s;
    },
  };
  LOOKS.split = LOOKS.glass; // placeholder: split is composed from fibres + rim in frameOf()

  /* Placement moves and scales the orb (and what hangs off it: ribbon, fibres,
     dot sheet, beam, reflection) inside the frame; the light pools stay where
     the look put them, so the orb can move clear of a title. */
  function applyPlacement(s, pl) {
    var x = pl && pl.x || 0, y = pl && pl.y || 0, z = pl && pl.zoom || 1;
    if (!x && !y && z === 1) return s;
    var cx = s.orb[0], cy = s.orb[1], nx = cx + x, ny = cy + y;
    s.orb = [nx, ny, s.orb[2] * z, s.orb[3]];
    if (s.refl[0] > 0) s.refl[1] = ny - s.orb[2];
    s.beam[0] += x;
    if (s.sk[0] >= 0.5) {
      s.sw[0] = ny + (s.sw[0] - cy) * z;
      s.sw[1] *= z; s.sw[2] *= z; s.sw[3] *= 1;
      s.sw2[0] *= z; s.sw2[1] /= z; s.sw2[3] = nx + (s.sw2[3] - cx) * z;
      s.sg[0] *= z; s.sr[0] *= z; s.sr[1] /= z; s.sd[1] *= z; s.sd[2] *= Math.sqrt(z);
    }
    return s;
  }
  /* Framings move the camera relative to the (placed) orb. */
  function applyFraming(s, framing) {
    var cx = s.orb[0], cy = s.orb[1], R = s.orb[2];
    if (framing === 'edge-left') s.cam = [cx - 0.7 * R, cy + 0.06 * R, 2.3];
    else if (framing === 'edge-right') s.cam = [cx + 0.7 * R, cy - 0.08 * R, 2.3];
    else if (framing === 'low') s.cam = [cx - 0.42 * R, cy - 0.5 * R, 1.9];
    else s.cam = [0, 0, 1];
    return s;
  }

  /* Light motion: the pools, the shadow pools and the beam move about the
     frame centre on the frame's own ellipse (so an edge light stays near an
     edge). Orbit and swirl turn a whole number of times per loop; sweep
     swings and returns. With highlights following, the rim hot spots and
     their tint turn with the light, as reflections of it would. */
  function rotNorm(x, y, ex, th) {
    var nx = x / ex, ny = y / 0.5, c = Math.cos(th), sn = Math.sin(th);
    return [(nx * c - ny * sn) * ex, (nx * sn + ny * c) * 0.5];
  }
  function lightAngle(c) {
    var L = c.light || {}, n = Math.max(1, Math.round(L.speed || 1)), ph = TAU * n * c.t;
    if (L.motion === 'orbit' || L.motion === 'swirl') return ph;
    if (L.motion === 'sweep') return (L.swing || 1.2) * Math.sin(ph);
    if (L.motion === 'drift') return 0.14 * Math.sin(ph);
    return 0;
  }
  function moveLights(s, c) {
    var L = c.light || {};
    var th = lightAngle(c);
    if (!th) return s;
    var ex = c.a / 2;
    s.pools.forEach(function (p, i) {
      var a = L.motion === 'swirl' && i % 2 ? -th : th;
      var q = rotNorm(p.v[0], p.v[1], ex, a);
      p.v[0] = q[0]; p.v[1] = q[1];
      p.sh[2] = (p.sh[2] || 0) + a;
    });
    s.shade = s.shade.map(function (sh) { var q = rotNorm(sh[0], sh[1], ex, th); return [q[0], q[1], sh[2], sh[3]]; });
    s.beamR = th;
    if (L.follow !== false) {
      s.hotA = [s.hotA[0] + th, s.hotA[1] + th, s.hotA[2] + th, s.hotA[3]];
      s.tint = [s.tint[0] + th, s.tint[1], s.tint[2], s.tint[3]];
    }
    return s;
  }

  /* Energy: from calm drift (0) to the orb reacting as if to music (1). The
     beat is simulated, with a whole number of beats per loop so clips still
     loop: a kick on every beat, a lighter off-beat, and a slow swell. */
  function energise(s, c) {
    var e = c.energy || 0;
    if (e <= 0) return s;
    var A = e * (0.3 + 0.7 * Math.min(1, 0.65 * c.kick + 0.2 * c.hat + 0.35 * c.swell));
    var kick = e * c.kick;
    s.act = [0.034 * A, 0.05 * A, TAU * 4 * c.cyc * c.t, kick];
    var p = 1 + 0.55 * kick;
    s.hotB = [s.hotB[0] * p, s.hotB[1] * p, s.hotB[2] * p, s.hotB[3] * (1 + 0.5 * kick)];
    s.rim[0] *= 1 + 0.25 * kick;
    s.spec[0] *= 1 + 0.4 * kick;
    s.pools.forEach(function (pl) { pl.v[3] *= 1 + 0.15 * kick; });
    s.sr[0] *= 1 + (s.sf[0] > 0.5 ? 1.1 : 2.2) * A;
    s.sw2[0] *= 1 + 3 * A;
    s.rbC1[3] *= 1 + 3 * A;
    s.rbW0[0] *= 1 + 0.3 * kick;
    s.rbP[0] *= 1 + 0.6 * A;
    if (s.sf[0] > 0.5) s.sf[3] += A * Math.sin(TAU * 2 * c.cyc * c.t) * 1.5;
    return s;
  }

  function resolvePools(s, C) {
    var pools = [];
    for (var i = 0; i < 6; i++) {
      var p = s.pools[i];
      if (!p) { pools.push({ v: [0, 0, 1, 0], c: [0, 0, 0], sh: [1, 1, 0] }); continue; }
      var col = C[p.role] || C.key;
      var str = p.v[3] * (p.role === 'flare' ? C.flareOn : 1);
      pools.push({ v: [p.v[0], p.v[1], p.v[2], str], c: col.slice(), sh: p.sh.slice() });
    }
    s.pools = pools;
    var shade = [];
    for (var j = 0; j < 3; j++) shade.push(s.shade[j] ? s.shade[j].slice() : [0, 0, 1, 0]);
    s.shade = shade;
    s.col = {};
    ROLES.forEach(function (r) { s.col[r] = C[r].slice(); });
    s.light = C.light;
    if (C.light) {
      // Light grounds: glows read as tinted light, not additive blow-out.
      s.exposure = 0.95;
      s.tint[3] = 1;
      s.glass[0] *= 0.7;
      s.glass[2] = Math.max(s.glass[2], 0.6);
      s.pools.forEach(function (p) { p.v[3] *= 0.5; });
    }
    return s;
  }

  function stateFor(look, ctx, scene) {
    var fn = LOOKS[look] || LOOKS.glass;
    var c = Object.assign({}, ctx, { energy: scene.energy || 0 });
    var s = fn(c);
    energise(s, c);
    moveLights(s, c);
    applyPlacement(s, scene.placement);
    applyFraming(s, scene.framing);
    return resolvePools(s, scene.C);
  }

  /* ── interpolation ──────────────────────────────────────────────────── */
  var ANGLE_KEYS = { hotA: [0, 1, 2], tint: [0], sp: [1], rbP: [1] };
  function lerp(a, b, k) { return a + (b - a) * k; }
  function lerpArr(a, b, k, angles) {
    return a.map(function (v, i) {
      if (angles && angles.indexOf(i) >= 0) {
        var d = ((b[i] - v + Math.PI) % TAU + TAU) % TAU - Math.PI;
        return v + d * k;
      }
      return lerp(v, b[i], k);
    });
  }
  /* Scene-to-scene colour changes follow the chosen blend too. Colours are
     held as OKLab; this blends two of them in the blend's own space. */
  function lerpColour(a, b, k, blend) {
    var mode = blend && blend.mode;
    if (mode === 'vivid') {
      var ca = Math.hypot(a[1], a[2]), cb = Math.hypot(b[1], b[2]);
      var ha = Math.atan2(a[2], a[1]), hb = Math.atan2(b[2], b[1]);
      var d = ((hb - ha + Math.PI) % TAU + TAU) % TAU - Math.PI;
      if (blend.hue === 'long' && Math.abs(d) > 0.6) d = d > 0 ? d - TAU : d + TAU;
      var th = k * cb / Math.max((1 - k) * ca + k * cb, 1e-5);
      var c = lerp(ca, cb, k), h = ha + d * th;
      return [lerp(a[0], b[0], k), c * Math.cos(h), c * Math.sin(h)];
    }
    if (mode === 'srgb' || mode === 'light') {
      var enc = function (v) { return mode === 'srgb' ? (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) : v; };
      var dec = function (v) { return mode === 'srgb' ? (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)) : v; };
      var la = oklabToLin(a).map(enc), lb = oklabToLin(b).map(enc);
      return linToOklab(la.map(function (v, i) { return dec(lerp(v, lb[i], k)); }));
    }
    return lerpArr(a, b, k);
  }
  function lerpState(A, B, k, blend) {
    if (k <= 0) return A;
    if (k >= 1) return B;
    var out = {};
    Object.keys(A).forEach(function (key) {
      var a = A[key], b = B[key];
      if (key === 'pools') out.pools = a.map(function (p, i) { return { v: lerpArr(p.v, b[i].v, k), c: lerpColour(p.c, b[i].c, k, blend), sh: lerpArr(p.sh, b[i].sh, k) }; });
      else if (key === 'shade') out.shade = a.map(function (v, i) { return lerpArr(v, b[i], k); });
      else if (key === 'col') { out.col = {}; ROLES.forEach(function (r) { out.col[r] = lerpColour(a[r], b[r], k, blend); }); }
      else if (Array.isArray(a)) out[key] = lerpArr(a, b, k, ANGLE_KEYS[key]);
      else if (typeof a === 'number') out[key] = lerp(a, b, k);
      else out[key] = k < 0.5 ? a : b;
    });
    // Strands of different kinds cannot blend point for point: the outgoing
    // set fades away over the first half, the incoming set over the second.
    if (A.sk[0] !== B.sk[0] || (A.sf[0] !== B.sf[0])) {
      var src = k < 0.5 ? A : B;
      ['sk', 'sg', 'sr', 'sp', 'sd', 'sw', 'sw2', 'sf', 'rbC0', 'rbC1', 'rbW0', 'rbW1', 'rbT', 'rbP'].forEach(function (key) { out[key] = src[key].slice(); });
      out.sk[2] = src.sk[2] * (k < 0.5 ? 1 - 2 * k : 2 * k - 1);
    }
    return out;
  }

  /* ── timeline ───────────────────────────────────────────────────────── */
  /* One beat's envelope: a short rise (6% of the beat, so a kick never steps
     between frames) and an exponential fall. */
  function beatEnv(b, fall) {
    var x = b - Math.floor(b), att = 0.06;
    return x < att ? Math.sin((x / att) * Math.PI / 2) : Math.exp(-fall * (x - att));
  }
  function ease(x) { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); }

  function buildTimeline(cfg) {
    var scenes = (cfg.scenes && cfg.scenes.length ? cfg.scenes : [cfg.base]).map(function (sc) {
      return {
        look: sc.look, framing: sc.framing, placement: sc.placement, energy: (sc.energy || 0) / 100, C: rolesToLab(sc.colours),
        hold: Math.max(0, sc.hold || 0), trans: Math.max(0, sc.trans || 0), style: sc.style || 'morph',
      };
    });
    if (scenes.length === 1) { scenes[0].hold = cfg.loop || 12; scenes[0].trans = 0; }
    var total = scenes.reduce(function (n, sc) { return n + sc.hold + sc.trans; }, 0) || 12;
    return { scenes: scenes, total: total };
  }

  function sceneFrame(sc, ctx) {
    if (sc.look === 'split') {
      var left = stateFor('fibres', ctx, sc);
      var right = stateFor('rim', ctx, sc);
      return [{ s: left, x0: 0, x1: 0.49 }, { s: right, x0: 0.49, x1: 1 }];
    }
    return [{ s: stateFor(sc.look, ctx, sc), x0: 0, x1: 1 }];
  }
  function spanAt(spans, x) {
    for (var i = 0; i < spans.length; i++) if (x < spans[i].x1) return spans[i];
    return spans[spans.length - 1];
  }
  function cuts(a, b) {
    var xs = [0, 1];
    a.concat(b).forEach(function (sp) { xs.push(sp.x0, sp.x1); });
    xs = xs.filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort(function (p, q) { return p - q; });
    return xs;
  }

  /* Spans to draw at loop phase u. */
  function frameAt(tl, cfg, u, aspect) {
    var cyc = Math.max(1, Math.round(tl.total / 12)) * Math.max(1, Math.round(cfg.speed || 1));
    var t = ((u % 1) + 1) % 1;
    var beats = Math.max(1, Math.round((cfg.bpm || 120) * tl.total / 60));
    var bt = t * beats;
    var ctx = {
      a: aspect, t: u, mot: cfg.motion, cyc: cyc, glow: cfg.glow, lines: cfg.lines, flow: cfg.flow,
      light: cfg.light, lightDrift: !cfg.light ? 1 : cfg.light.motion === 'still' ? 0 : cfg.light.motion === 'drift' ? 2.5 : 1,
      kick: beatEnv(bt, 7),
      hat: 0.6 * beatEnv(bt + 0.5, 10),
      swell: 0.5 - 0.5 * Math.cos(TAU * t * Math.max(1, Math.round(beats / 16))),
    };
    var tau = (((u % 1) + 1) % 1) * tl.total, start = 0;
    var n = tl.scenes.length;
    for (var i = 0; i < n; i++) {
      var sc = tl.scenes[i];
      var end = start + sc.hold + sc.trans;
      if (tau < end || i === n - 1) {
        var A = sceneFrame(sc, ctx);
        var local = tau - start;
        if (n === 1 || local < sc.hold || sc.trans <= 0) return A;
        var k = ease((local - sc.hold) / sc.trans);
        var B = sceneFrame(tl.scenes[(i + 1) % n], ctx);
        if (sc.style === 'wipe') {
          // The next scene is revealed from the left; the seam is a hard cut,
          // as on slide 3.
          var seam = k;
          var out = [];
          B.forEach(function (sp) { if (sp.x0 < seam) out.push({ s: sp.s, x0: sp.x0, x1: Math.min(sp.x1, seam) }); });
          A.forEach(function (sp) { if (sp.x1 > seam) out.push({ s: sp.s, x0: Math.max(sp.x0, seam), x1: sp.x1 }); });
          return out;
        }
        var xs = cuts(A, B), spans = [];
        for (var j = 0; j < xs.length - 1; j++) {
          var mid = (xs[j] + xs[j + 1]) / 2;
          spans.push({ s: lerpState(spanAt(A, mid).s, spanAt(B, mid).s, k, { mode: cfg.blend, hue: cfg.hue }), x0: xs[j], x1: xs[j + 1] });
        }
        return spans;
      }
      start = end;
    }
    return sceneFrame(tl.scenes[0], ctx);
  }

  /* ── GL ─────────────────────────────────────────────────────────────── */
  var UNIFORMS = ['u_res', 'u_off', 'u_cam', 'u_px', 'u_exposure', 'u_seed', 'u_ground', 'u_ground2', 'u_deep', 'u_key',
    'u_core', 'u_lines', 'u_accent', 'u_pool', 'u_poolCol', 'u_poolS', 'u_beamR', 'u_blend', 'u_hueLong', 'u_rim2', 'u_shade', 'u_beam', 'u_orb', 'u_wobA', 'u_wobP',
    'u_lobeL', 'u_lobeR', 'u_glass', 'u_rim', 'u_hotA', 'u_hotB', 'u_tint', 'u_spec', 'u_refl', 'u_sk', 'u_sg',
    'u_sr', 'u_sp', 'u_sd', 'u_sw', 'u_sw2', 'u_sf', 'u_rbC0', 'u_rbC1', 'u_rbW0', 'u_rbW1', 'u_rbT', 'u_rbP', 'u_act'];

  function createRenderer(canvas) {
    var gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) return null;
    function sh(type, src) {
      var o = gl.createShader(type);
      gl.shaderSource(o, src);
      gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) || 'shader compile failed');
      return o;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var loc = {};
    UNIFORMS.forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });

    function set(state, W, H) {
      var u = function (n) { return loc[n]; };
      var lw = Math.max(1.0, 0.0013 * H);
      var zoom = state.cam[2];
      gl.uniform2f(u('u_res'), W, H);
      gl.uniform4f(u('u_cam'), state.cam[0], state.cam[1], zoom, lw);
      gl.uniform1f(u('u_px'), 1 / (H * zoom));
      gl.uniform1f(u('u_exposure'), state.exposure);
      ['ground', 'ground2', 'deep', 'key', 'core', 'lines', 'accent'].forEach(function (r) {
        gl.uniform3fv(u('u_' + r), oklabToLin(state.col[r]));
      });
      var pv = [], pc = [], ps = [];
      state.pools.forEach(function (p) { pv.push.apply(pv, p.v); pc.push.apply(pc, oklabToLin(p.c)); ps.push(p.sh[0], p.sh[1], p.sh[2] || 0, 0); });
      gl.uniform4fv(u('u_pool'), pv);
      gl.uniform3fv(u('u_poolCol'), pc);
      gl.uniform4fv(u('u_poolS'), ps);
      gl.uniform1f(u('u_beamR'), state.beamR || 0);
      var sv = [];
      state.shade.forEach(function (s) { sv.push.apply(sv, s); });
      gl.uniform4fv(u('u_shade'), sv);
      ['beam', 'orb', 'wobA', 'wobP', 'lobeL', 'lobeR', 'glass', 'rim', 'rim2', 'hotA', 'hotB', 'tint', 'spec', 'refl',
        'sk', 'sg', 'sr', 'sp', 'sd', 'sw', 'sw2', 'sf', 'rbC0', 'rbC1', 'rbW0', 'rbW1', 'rbT', 'rbP', 'act'].forEach(function (k) { gl.uniform4fv(u('u_' + k), state[k]); });
    }

    return {
      gl: gl,
      draw: function (spans, W, H, seed, blend) {
        gl.viewport(0, 0, W, H);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform2f(loc.u_off, 0, 0);
        gl.uniform1f(loc.u_seed, seed || 0);
        gl.uniform1i(loc.u_blend, BLENDS.indexOf(blend && blend.mode) >= 0 ? BLENDS.indexOf(blend.mode) : 2);
        gl.uniform1i(loc.u_hueLong, blend && blend.hue === 'long' ? 1 : 0);
        gl.enable(gl.SCISSOR_TEST);
        spans.forEach(function (sp) {
          var x0 = Math.round(sp.x0 * W), x1 = Math.round(sp.x1 * W);
          if (x1 <= x0) return;
          gl.scissor(x0, 0, x1 - x0, H);
          set(sp.s, W, H);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
        gl.disable(gl.SCISSOR_TEST);
        gl.flush();
      },
      dispose: function () {
        try {
          gl.deleteProgram(prog); gl.deleteBuffer(buf); gl.deleteVertexArray(vao);
          var lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        } catch (e) { /* already lost */ }
      },
    };
  }

  /* ── mount ──────────────────────────────────────────────────────────── */
  var MAX_LIVE_PIXELS = 2600000;

  function mount(host, cfg, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'sb-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var r;
    try { r = createRenderer(canvas); } catch (e) { canvas.remove(); throw e; }
    if (!r) { canvas.remove(); return null; }
    var tl = buildTimeline(cfg);
    var phase0 = (cfg.phase || 0) / 100;
    var calm = !!opts.calm;
    var disposed = false, raf = 0, t0 = 0, exportSize = null;

    function liveSize() {
      var w = host.clientWidth || cfg.width || 1600, h = host.clientHeight || cfg.height || 900;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.round(w * dpr), H = Math.round(h * dpr);
      var over = (W * H) / MAX_LIVE_PIXELS;
      if (over > 1) { var f = Math.sqrt(over); W = Math.round(W / f); H = Math.round(H / f); }
      return [Math.max(2, W), Math.max(2, H)];
    }
    function paint(u, size) {
      var W = size[0], H = size[1];
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      r.draw(frameAt(tl, cfg, u, W / H), W, H, Math.floor(u * 997), { mode: cfg.blend, hue: cfg.hue });
    }
    function loop(now) {
      if (disposed) return;
      if (!document.contains(canvas)) { dispose(); return; }
      raf = requestAnimationFrame(loop);
      if (canvas.__lollyFrameDriven) return;
      if (!t0) t0 = now;
      paint(phase0 + (now - t0) / 1000 / tl.total, liveSize());
    }
    function dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      r.dispose();
    }

    paint(phase0, liveSize());
    requestAnimationFrame(function () { if (!disposed && document.contains(canvas)) paint(phase0, liveSize()); });
    if (!calm && cfg.motion > 0) raf = requestAnimationFrame(loop);

    /* Deterministic export clock (shells/web/src/bridge/frame-clock.ts):
       t in [0, 1) over the clip, clipSec its real length, size the target
       pixels. A clip one loop long (the default, via data-clip-ms) is a
       seamless loop; hairlines are re-rendered at the target size rather than
       upscaled. */
    var driving = false;
    function watchRelease() {
      if (disposed || !document.contains(canvas)) return;
      if (canvas.__lollyFrameDriven) { requestAnimationFrame(watchRelease); return; }
      driving = false;
      exportSize = null;
      paint(phase0, liveSize());
    }
    canvas.__lollyFrameRender = function (t, clipSec, size) {
      if (!driving) { driving = true; requestAnimationFrame(watchRelease); }
      if (size && size.width > 0 && size.height > 0) exportSize = [Math.round(size.width), Math.round(size.height)];
      var secs = clipSec || tl.total;
      paint(phase0 + (t || 0) * secs / tl.total, exportSize || liveSize());
    };

    return {
      canvas: canvas,
      total: tl.total,
      renderAt: function (u, W, H) { paint(u, [W || canvas.width, H || canvas.height]); },
      dispose: dispose,
    };
  }

  window.SuseconOrb = { mount: mount, version: 1, _frameAt: frameAt, _buildTimeline: buildTimeline, _lerpColour: lerpColour, _rgbToLab: function (hex) { return linToOklab(linRgb(hex)); } };
})();
