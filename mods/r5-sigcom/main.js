// R5-SIGCOM: Rig5ive Signals Command for the Herdr app.
// One mod, four roles set by props: "rail" (seal, identity, radar, assets, mesh),
// "banner" (OPS-CON strip; also runs the state machine), "feed" (spectrum, live
// intercept, sitrep log) and "dossier" (an agent's file card, opened as a dialog).
// Every code, compartment and directive is fictional flavor.

import { View, div, svg, image, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import GLOBE_FRAMES from "./globe-frames.js";
import {
  agents, run, shared, setShared, props, checking, hc, exec, panes, spaces,
  openOverlay, closeOverlay, notify, setBadge, setWindowTitle, setAgentOrder, knownAgents,
  focused, layout, window as appWindow,
} from "herdr";

const ART = "mods/r5-sigcom/";
const MONO = "JetBrains Mono";
const BUILD = "5.3.1";
const STATE = "r5.state";
const LOG = "r5.log";

const C = {
  panel: "#070D0A", rule: "#16301F", text: "#BFF5CF", hi: "#E6FFF0", dim: "#5E8F6E",
  faint: "#2A4A36", ghost: "#16281D", gold: "#C9A445", gold2: "#E3C76A", goldDim: "#4E4222",
  green: "#46D97A", red: "#FF4D42", blue: "#6FB7FF", idle: "#3E6B4F", olive: "#9C9A72",
  hex: "#3F8F5E", amber: "#F0D27A", flat: "#2F5A3E", sync: "#8A7A3A",
};
const STATUS_COLOR = { working: C.green, idle: C.idle, done: C.blue, blocked: C.red };
const LOG_COLOR = { ...STATUS_COLOR, gold: C.gold2, olive: C.olive };
const VERB = { working: "TASKED", idle: "STANDING BY", done: "MISSION COMPLETE", blocked: "NEEDS AUTH" };
const BOOT_LOG = [
  null,
  ["AUTH R5-CMDR ··· OK", "gold"],
  ["KEYS EXCHANGED · AES-256", "gold"],
  ["SEAL VERIFIED · RIGLINE OPEN", "gold"],
  ["ENUMERATING ASSETS", "gold"],
  null,
];
const BOOT_PHASE_MS = [0, 500, 1100, 1700, 2300, 2900];
const BOOT_DONE_MS = 3400;
const SPARK = "▁▂▃▄▅▆▇█";
const BANNER = {
  dormant: ["#1C1D14", C.olive], boot: ["#463612", C.amber],
  green: ["#0F3A20", C.text], amber: ["#463612", C.amber], red: ["#4D120D", "#FFC2BC"],
};

// ---------------------------------------------------------------- helpers
const pad2 = (n) => String(n).padStart(2, "0");
function utc(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}Z`;
}
function stamp(d) {
  return `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let x = seed || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
}
function defaultState() {
  return { mode: "dormant", phase: 0, bootAt: 0, since: 0, caseNo: "", signs: {}, next: 1 };
}
function readState() {
  const s = shared(STATE);
  return s && typeof s === "object" ? { ...defaultState(), ...s, signs: { ...(s.signs || {}) } } : defaultState();
}
function readLog() {
  const l = shared(LOG);
  return Array.isArray(l) ? l : [];
}
function opsLevel(list) {
  const b = list.filter((a) => a.status === "blocked").length;
  if (b && b === list.length && b > 1) return 1;
  if (b > 1) return 2;
  if (b) return 3;
  return 5;
}
function sign(st, a) { return st.signs[a.address] || "R5-??"; }
function unit(a) {
  const n = (a.program && a.program.name) || a.app || "AGENT";
  return String(n).toUpperCase();
}

// Operation codenames: one per space, stable, Permian Basin flavored.
const OPS = ["NIGHTJAR", "PUMPJACK", "ROUGHNECK", "SIDEWINDER", "MESQUITE", "CALDERA", "DUSTDEVIL",
  "WILDCAT", "LONGHORN", "OVERWATCH", "SANDGLASS", "IRONWOOD", "DEEPWELL", "HIGHPLAINS", "NORTHSTAR",
  "TUMBLEWEED", "BLACKSAGE", "COPPERHEAD", "WINDMILL", "CROWNBLOCK", "CALICHE", "JACKRABBIT"];
function opName(spaceId) { return OPS[hash("op:" + String(spaceId || "")) % OPS.length]; }

// Terminal text to intercept lines: strip escapes and TUI chrome, keep real words.
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)/g;
const CHROME = /[\u2500-\u259f\u2800-\u28ff\u25a0-\u25ff\u2580-\u259f]/g;
function cleanLines(text) {
  return String(text || "").replace(ANSI, "").split("\n")
    .map((l) => l.replace(CHROME, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 4 && /[A-Za-z]{3}/.test(l) && !/^[>$%#\u276f\u203a]\s*$/.test(l) && !/^\[hc\]/.test(l) && !/^[>\u276f\u203a]\s/.test(l));
}
// Black bars over anything that looks private: keys, tokens, emails, long hashes, home paths.
const SECRETS = [
  /\b(?:sk|pk|rk|ghp|gho|ghs|ghu|xox[abprs]|AKIA|AIza|eyJ)[-_A-Za-z0-9.]{8,}/g,
  /\b[A-Za-z0-9+/_-]{32,}={0,2}/g,
  /[\w.+-]+@[\w-]+\.[\w.]+/g,
  /(?:~|\/(?:Users|home|private|var|opt|etc|root))(?:\/[^\s'"`)\]]+)+/g,
];
function redact(text) {
  let t = String(text || "");
  for (const rx of SECRETS) t = t.replace(rx, (m) => "\u2588".repeat(Math.min(m.length, 22)));
  return t;
}
// A path with everything but its last folder blacked out.
function redactPath(p) {
  if (!p) return "\u2014";
  const parts = String(p).split("/").filter(Boolean);
  const last = parts.pop() || "/";
  return "\u2588".repeat(Math.min(14, Math.max(4, parts.join("/").length))) + "/" + last;
}
const SCRAMBLE = "\u2593\u2592\u2591#%&@$01<>/\\*";
function decrypt(text, progress, seed) {
  const r = rng(seed);
  const cut = Math.floor(text.length * progress);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += i < cut || ch === " " ? ch : SCRAMBLE[Math.floor(r() * SCRAMBLE.length)];
  }
  return out;
}
function agoText(ms) {
  if (!ms) return "\u2014";
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 60 ? `${m} MIN` : `${Math.floor(m / 60)} HR ${pad2(m % 60)} MIN`;
}
function button(id, label, color, onClick) {
  return div().id(id).px(12).py(5).rounded(3).border(1).border_color(color).text_color(color).cursor_pointer()
    .hover((s) => s.bg(C.ghost)).on_click(onClick).child(label);
}

// Braille waveform rows for .frames(): 3 text rows, 4 dots tall each.
const WAVE_P = 32; // columns per repeat: the strip scrolls one column a frame
// Analyzer frames: `rows` rows of block characters above the center line (8 levels
// a row) plus 2 reflection rows below it, periodic every WAVE_P columns so a
// window sliding one column a frame loops without a seam.
function waveFrames(cols, mode, working, seed, rows) {
  const rand = rng(seed);
  const top = rows * 8;
  const noise = Array.from({ length: WAVE_P }, () => rand());
  const total = cols + WAVE_P;
  const levels = new Array(total);
  for (let x = 0; x < total; x++) {
    const px = x % WAVE_P, ph = (px / WAVE_P) * Math.PI * 2;
    let v;
    if (mode === "dormant") {
      const dx = px - WAVE_P * 0.6;
      v = 1 + (Math.abs(dx) < 3 ? (3 - Math.abs(dx)) * (top / 6) : 0);
    } else if (mode === "boot") {
      v = 1 + noise[px] * top * 0.45;
    } else {
      // A spectrum shape: a few bands that breathe, more energy with more agents working.
      const energy = 0.6 + Math.min(4, working) * 0.1;
      const bands = Math.abs(Math.sin(ph * 3 + 0.6) * 0.7 + Math.sin(ph * 5 + 1.7) * 0.3);
      v = 1 + top * energy * (0.14 + 0.86 * Math.pow(bands, 1.15)) * (0.62 + 0.38 * noise[px]);
    }
    levels[x] = Math.max(1, Math.min(top, Math.round(v)));
  }
  const strips = [];
  for (let r = 0; r < rows; r++) {
    const floor = (rows - 1 - r) * 8;
    let s = "";
    for (let x = 0; x < total; x++) {
      const lv = Math.max(0, Math.min(8, levels[x] - floor));
      s += lv === 0 ? " " : SPARK[lv - 1];
    }
    strips.push(s);
  }
  // Reflection: a third as tall, drawn with half blocks hanging from the center line.
  for (let r = 0; r < 2; r++) {
    let s = "";
    for (let x = 0; x < total; x++) {
      const h = Math.round((levels[x] / top) * 3) - r * 2; // 0..3 half-rows
      s += h >= 2 ? "█" : h === 1 ? "▀" : " ";
    }
    strips.push(s);
  }
  return strips.map((s) => Array.from({ length: WAVE_P }, (_, f) => s.slice(f, f + cols)));
}

const AUDIO_P = 48; // columns per repeat of the audio trace
// An oscilloscope trace in 3 text rows: each row holds a low, middle or high stroke
// (9 heights). A vertical stroke fills only rows the line skips over. Periodic, so
// the sliding window streams without a seam.
function audioFrames(cols, mode, working, blocked, seed) {
  const rand = rng(seed);
  const total = cols + AUDIO_P;
  const noise = Array.from({ length: AUDIO_P }, () => rand() - 0.5);
  const lv = new Array(total);
  for (let x = 0; x < total; x++) {
    const px = x % AUDIO_P, ph = (px / AUDIO_P) * Math.PI * 2;
    let y; // -1..1
    if (mode === "active") {
      const amp = 0.4 + Math.min(4, working) * 0.14;
      y = amp * (0.75 * Math.sin(ph * 3) + 0.25 * Math.sin(ph * 7 + 1.2)) + noise[px] * (blocked ? 0.8 : 0.08);
    } else if (mode === "boot") {
      y = noise[px] * 1.3;
    } else {
      const dx = px - AUDIO_P * 0.55;
      y = Math.abs(dx) < 3 ? Math.sin(((dx + 3) / 6) * Math.PI * 2) * 0.85 : 0;
    }
    lv[x] = Math.max(0, Math.min(8, Math.round((y + 1) * 4)));
  }
  const STROKE = ["▁", "─", "▔"]; // low, middle, high within a row
  const rowOf = (l) => 2 - Math.floor(l / 3);
  const rows = [[], [], []];
  for (let x = 0; x < total; x++) {
    const l = lv[x], row = rowOf(l);
    const pr = x > 0 ? rowOf(lv[x - 1]) : row;
    for (let r = 0; r < 3; r++) {
      if (r === row) rows[r].push(STROKE[l % 3]);
      else if (r > Math.min(row, pr) && r < Math.max(row, pr)) rows[r].push("│");
      else rows[r].push(" ");
    }
  }
  return rows.map((chars) => {
    const strip = chars.join("");
    return Array.from({ length: AUDIO_P }, (_, f) => strip.slice(f, f + cols));
  });
}

// A channel meter's column of frames (rows tall), by the agent's status.
function meterFrames(status, rows, seed) {
  const rand = rng(seed);
  const n = 12, top = rows * 8;
  const lv = Array.from({ length: n }, (_, i) => {
    if (status === "working") return Math.round(top * (0.35 + 0.6 * rand()));
    if (status === "blocked") return i % 2 ? top : Math.round(top * 0.3);
    if (status === "done") return Math.round(top * 0.45);
    return 2;
  });
  return Array.from({ length: rows }, (_, r) => {
    const floor = (rows - 1 - r) * 8;
    return lv.map((v) => { const l = Math.max(0, Math.min(8, v - floor)); return l === 0 ? "  " : SPARK[l - 1].repeat(2); });
  });
}

// A wireframe globe as dot-matrix text: one string per row per frame, in three
// layers (far side, near side, equator) that share the frames clock and stay in
// step. Lines every 30° of longitude and latitude, tilted 23° toward the viewer.
const GLOBE_N = 15; // frames per 30° step; the grid repeats every 30°, so this loops seamlessly
function globeFrames(cols, rows) {
  const layers = [0, 1, 2].map(() => Array.from({ length: rows }, () => []));
  const tilt = (23 * Math.PI) / 180, ct = Math.cos(tilt), st = Math.sin(tilt);
  const rx = (cols - 1) / 2, ry = (rows - 1) / 2;
  for (let f = 0; f < GLOBE_N; f++) {
    const rot = (f / GLOBE_N) * (Math.PI / 6);
    const g = [0, 1, 2].map(() => Array.from({ length: rows }, () => Array(cols).fill(" ")));
    const plot = (lat, lon, eq) => {
      const l = lon + rot;
      const x = Math.cos(lat) * Math.sin(l), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(l);
      const y2 = y * ct - z * st, z2 = y * st + z * ct;
      const c = Math.round(rx + x * rx), r = Math.round(ry - y2 * ry);
      if (r < 0 || r >= rows || c < 0 || c >= cols) return;
      if (z2 >= 0) { g[eq ? 2 : 1][r][c] = "•"; g[0][r][c] = " "; }
      else if (g[1][r][c] === " " && g[2][r][c] === " ") g[0][r][c] = "·";
    };
    const D = Math.PI / 180;
    for (let m = 0; m < 360; m += 30) for (let a = -72; a <= 72; a += 2) plot(a * D, m * D, false);
    for (const p of [-60, -30, 30, 60]) for (let a = 0; a < 360; a += 2) plot(p * D, a * D, false);
    for (let a = 0; a < 360; a += 1.5) plot(0, a * D, true);
    // a near-side cell beats the far side drawn earlier in the same cell
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (g[1][r][c] !== " " || g[2][r][c] !== " ") g[0][r][c] = " ";
    for (let k = 0; k < 3; k++) for (let r = 0; r < rows; r++) layers[k][r].push(g[k][r].join(""));
  }
  return layers;
}

function sparkFrames(seed, len) {
  const rand = rng(seed);
  const seq = Array.from({ length: 24 }, () => 2 + Math.floor(rand() * 6));
  const frames = [];
  for (let i = 0; i < 24; i++) {
    let s = "";
    for (let j = 0; j < len; j++) s += SPARK[seq[(i + j) % 24]];
    frames.push(s);
  }
  return frames;
}

function hexFrames(seed) {
  const rand = rng(seed);
  const tags = ["5V", "K5", "RL"];
  return Array.from({ length: 16 }, () => {
    const parts = Array.from({ length: 4 }, () => Math.floor(rand() * 65536).toString(16).padStart(4, "0"));
    return `${tags[Math.floor(rand() * 3)]} ${pad2(1 + Math.floor(rand() * 5))} ${parts.join(" ")}`;
  });
}

function rule(title, right) {
  // Title never shrinks; the right label truncates and the line gives way first,
  // so narrow columns clip instead of letting the two labels run into each other.
  return h_flex().w_full().min_w(0).overflow_hidden().items_center().gap(6).mb(4)
    .child(div().flex_shrink_0().whitespace_nowrap().text_color(C.dim).text_size(10).child(title))
    .child(div().flex_1().min_w(6).h(1).bg(C.rule))
    .when(right, (el) => el.child(div().min_w(0).truncate().text_color(C.dim).text_size(10).child(right)));
}

// Fixed relay stations around the mesh, as fractions of the network box.
const RELAYS = [
  { name: "K5-RLY", x: 0.07, y: 0.18 }, { name: "HBS-01", x: 0.93, y: 0.16 },
  { name: "GRID-32", x: 0.06, y: 0.86 }, { name: "SAT-5V", x: 0.94, y: 0.84 },
];

function strokeLines(pairs, width, dash) {
  let b = PathBuilder.stroke(width);
  if (dash) b = b.dash_array(dash);
  for (const [x1, y1, x2, y2] of pairs) b = b.move_to(x1, y1).line_to(x2, y2);
  return b.build();
}

// Pie slices as filled wedges: [[fraction, color], ...] around (c, c), radius r.
const MIX_W = 190;
const PIE_COLORS = ["#46D97A", "#E3C76A", "#6FB7FF", "#3FBF9A", "#B48EDC", "#F0D27A", "#9C9A72", "#7CF0A2"];
function pieSlices(parts, c, r) {
  const out = [];
  let a0 = -Math.PI / 2;
  const pt = (a) => [c + r * Math.cos(a), c + r * Math.sin(a)];
  for (const [f, color] of parts) {
    if (!(f > 0.001)) continue;
    if (f >= 0.999) { // a full circle: two half wedges
      const [x0, y0] = pt(a0), [x1, y1] = pt(a0 + Math.PI);
      out.push([PathBuilder.fill().move_to(x0, y0).arc_to(r, r, 0, false, true, x1, y1).arc_to(r, r, 0, false, true, x0, y0).close().build(), color]);
      break;
    }
    const a1 = a0 + f * Math.PI * 2;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    out.push([PathBuilder.fill().move_to(c, c).line_to(x0, y0).arc_to(r, r, 0, f > 0.5, true, x1, y1).close().build(), color]);
    a0 = a1;
  }
  return out;
}

// The dossier shows the agent's own logo (Herdr's program icon), framed like an ID plate.
function emblem(a, size) {
  const prog = a.program || {};
  const inner = Math.round(size * 0.56);
  const plate = div().relative().w(size).h(size).flex_shrink_0().rounded(3).bg("#081510")
    .border(1).border_color(C.rule).flex().items_center().justify_center().overflow_hidden();
  const corner = (l, t, sides) => {
    let c = div().absolute().w(12).h(12).border_color(C.gold);
    for (const sd of sides) c = c[sd](2);
    return c.left(l).top(t);
  };
  const mark = prog.icon
    ? (prog.tint ? svg(prog.icon).w(inner).h(inner).text_color(C.gold2) : image(prog.icon).w(inner).h(inner))
    : div().text_size(Math.round(size * 0.3)).font_weight(700).text_color(C.gold2)
      .child(String(prog.name || a.app || "AG").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase());
  return plate.child(mark)
    .child(corner(4, 4, ["border_t", "border_l"])).child(corner(size - 16, 4, ["border_t", "border_r"]))
    .child(corner(4, size - 16, ["border_b", "border_l"])).child(corner(size - 16, size - 16, ["border_b", "border_r"]));
}

// The dossier's alert says what the agent needs, not decoration.
const ALERT = {
  blocked: ["NEEDS AUTHORIZATION", "#FF4D42", true],
  working: ["ACTIVE \u00b7 TASKED", "#46D97A", false],
  done: ["MISSION COMPLETE \u00b7 REVIEW", "#6FB7FF", false],
  idle: ["STANDING BY", "#5E8F6E", false],
};

// ---- economic intel: World Bank GDP (current US$) and real growth, refreshed daily
const GDP_COUNTRIES = ["USA", "CHN", "DEU", "JPN", "IND", "GBR", "FRA", "ITA", "CAN", "BRA", "MEX", "RUS"];
// World Bank, 2025 values, used until the first live refresh.
const GDP_BASE = {
  year: "2025", at: 0, rows: [
    ["USA", 30769700000000, 2.16], ["CHN", 19498039388042, 4.96], ["DEU", 5050922925047, 0.24],
    ["JPN", 4435162999977, 1.19], ["IND", 3956067115772, 7.57], ["GBR", 4002587541846, 1.39],
    ["FRA", 3366315927447, 0.84], ["ITA", 2551556954100, 0.54], ["CAN", 2319899772426, 1.74],
    ["BRA", 2279920092492, 2.29], ["MEX", 1832641364776, 0.56], ["RUS", 2561310169359, 1.0],
  ],
};
const WB = "https://api.worldbank.org/v2/country/" + GDP_COUNTRIES.join(";") + "/indicator/";
function money(n, d) {
  const neg = n < 0, v = Math.abs(n);
  const [i, f] = v.toFixed(d === undefined ? 2 : d).split(".");
  return (neg ? "-$" : "$") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : "");
}
function trillions(n) { return n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : `$${(n / 1e9).toFixed(0)}B`; }
function readGdp() {
  const g = shared("r5.gdp");
  return g && Array.isArray(g.rows) && g.rows.length ? g : GDP_BASE;
}
async function fetchGdp() {
  const get = async (ind) => {
    const r = await exec("curl", ["-fsSL", "--max-time", "20", WB + ind + "?format=json&mrnev=1&per_page=100"], { timeout: 25000 });
    if (r.code !== 0) throw new Error("fetch failed");
    const j = JSON.parse(r.stdout);
    return Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
  };
  const [gdp, gr] = [await get("NY.GDP.MKTP.CD"), await get("NY.GDP.MKTP.KD.ZG")];
  const growth = Object.fromEntries(gr.filter((x) => x && x.value != null).map((x) => [x.countryiso3code, x.value]));
  const rows = GDP_COUNTRIES.map((c) => {
    const g = gdp.find((x) => x && x.countryiso3code === c && x.value != null);
    return g ? [c, g.value, growth[c] == null ? null : Math.round(growth[c] * 100) / 100] : null;
  }).filter(Boolean);
  const year = (gdp.find((x) => x && x.value != null) || {}).date || "";
  if (rows.length >= 6) setShared("r5.gdp", { year, at: Date.now(), rows });
}

// ---- treasury: dummy balances that drift, for show only
const ACCOUNTS = [["OPERATIONS", "R5-07-114", 4218093.17], ["RESERVE", "R5-07-220", 12750400.0], ["FIELD EXP.", "R5-07-305", 386211.42]];
const TXNS = ["WIRE OUT  RL-5V", "WIRE IN   K5-RLY", "ACH OUT   HBS-01", "SETTLE    GRID-32", "WIRE IN   SAT-5V", "FEE       RIGLINE", "ACH IN    CMDR-5", "WIRE OUT  OP-DESK"];
const TREASURY_STEPS = 30;
function treasuryFrames() {
  const rand = rng(5150);
  const walks = ACCOUNTS.map(([, , base]) => {
    const steps = Array.from({ length: TREASURY_STEPS }, () => (rand() - 0.5) * base * 0.0016);
    const drift = steps.reduce((a, b) => a + b, 0) / TREASURY_STEPS;
    let v = base;
    return steps.map((d) => (v += d - drift)); // returns to base: the loop has no seam
  });
  const balances = walks.map((w) => w.map((v) => money(v)));
  const totals = Array.from({ length: TREASURY_STEPS }, (_, i) => money(walks.reduce((n, w) => n + w[i], 0)));
  const txns = TXNS.map((t, i) => {
    const amt = (rng(77 + i)() * 48000 + 600) * (/OUT|FEE/.test(t) ? -1 : 1);
    return `${t}  ${money(amt)}`;
  });
  return { balances, totals, txns };
}

function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children || []) { const f = findNode(c, id); if (f) return f; }
  return null;
}
function dossierShown() {
  const L = layout(), panel = findNode(L, "panel"), body = findNode(L, "panel-body");
  return Boolean(panel && !panel.hidden && body && body.active === "dossier");
}
// Opens an agent's dossier in the side panel (rail clicks use this).
function showDossier(address) {
  setShared("r5.dossier", `${address}|${Date.now()}`);
  run("layout.select", { stack: "panel-body", child: "dossier" });
  run("layout.show", { id: "panel" });
}

// ---------------------------------------------------------------- the mod
export default class R5Sigcom extends View {
  init(_props, cx) {
    const p = props() || {};
    this.role = p.role || "rail";
    this.size = { width: 300, height: 600 };
    this.clock = utc(new Date());
    this.cache = {};
    this.prevStatus = null;
    this.empty = 0;
    this.title = null;
    this.badge = undefined;
    if (checking()) return;
    this.intel = [];
    this.seen = {};
    this.intelCount = {};
    if (this.role === "ticker") {
      if (!checking()) {
        const maybe = (cx) => {
          const g = readGdp();
          if (this.fetching || Date.now() - (g.at || 0) < 24 * 3600 * 1000) return;
          this.fetching = true;
          cx.spawn(async () => { try { await fetchGdp(); } catch (_e) { /* offline: keep the last figures */ } finally { this.fetching = false; } });
        };
        maybe(cx);
        cx.timer.every(3600 * 1000, maybe);
      }
      return;
    }
    if (this.role === "filemenu") {
      this.fm = { target: p.target, folder: p.folder, name: p.name, dir: p.dir, on: p.on || null };
      this.progs = null;
      if (!checking()) {
        cx.spawn(async (cx) => {
          try { this.progs = await knownAgents({ on: this.fm.on }); } catch (_e) { this.progs = []; }
          cx.notify();
        });
      }
      return;
    }
    if (this.role === "tabmenu") {
      this.tabId = p.tab;
      this.spaceId = p.space;
      this.progs = null;
      if (!checking()) {
        cx.spawn(async (cx) => {
          const sp = spaces().find((x) => x.id === this.spaceId);
          try { this.progs = await knownAgents({ on: sp ? sp.machine : null }); } catch (_e) { this.progs = []; }
          cx.notify();
        });
      }
      return;
    }
    if (this.role === "dossierpanel") {
      this.address = null;
      this.traffic = null;
      this.files = null;
      this.lastPin = null;
      this.lastFocus = null;
      this.loadedAt = 0;
      if (!checking()) {
        this.followDossier(cx);
        cx.timer.every(1200, (cx) => this.followDossier(cx));
      }
      return;
    }
    if (this.role === "dossier") {
      this.address = p.address;
      this.traffic = null;
      this.files = null;
      this.loadDossier(cx);
      return;
    }
    if (this.role === "rail") cx.timer.every(15000, (cx) => this.countIntel(cx));
    if (this.role === "feed") {
      cx.timer.every(6000, (cx) => this.poll(cx));
      this.hex = Array.from({ length: 12 }, (_, i) => hexFrames(7 + i * 13));
      this.sync = Array.from({ length: 12 }, (_, i) => hexFrames(101 + i).map((s) => "SYNC " + s.slice(6, 10).toUpperCase() + " \u00b7\u00b7\u00b7\u00b7"));
      this.prepWave(cx);
      cx.timer.every(500, (cx) => this.prepWave(cx));
      this.mix = {};      // address -> shown share (0..1)
      this.mixTo = {};    // address -> target share
      this.mixFrom = {};
      this.mixStep = 0;
      cx.timer.every(3000, (cx) => this.retargetMix(cx));
      cx.timer.every(90, (cx) => this.stepMix(cx));
    }
    if (this.role === "banner") {
      this.start();
      cx.timer.every(400, () => this.tick());
    }
    // Clocks change once a minute; nothing else needs a timer (animations are native).
    cx.timer.every(20000, (cx) => {
      const c = utc(new Date());
      if (c !== this.clock) { this.clock = c; cx.notify(); }
    });
  }

  // ---- live data (never inside render)
  // Reads a few busy agents' screens. Skips the one you're typing into and idle ones,
  // so typing never makes "new" lines; no animation timers, so no extra redraws.
  poll(cx) {
    const st = readState();
    if (st.mode !== "active" || this.polling || shared("r5.intercept") === "off") return;
    const busy = agents().filter((a) => !a.focused && (a.status === "working" || a.status === "blocked"));
    if (!busy.length) return;
    this.turn = (this.turn || 0) + 1;
    const pick = busy.map((_, i) => busy[(i + this.turn) % busy.length]).slice(0, 3);
    this.polling = true;
    cx.spawn(async (cx) => {
      try {
        const fresh = [];
        for (const a of pick) {
          let r;
          try { r = await hc(["read", a.address, "--lines", "10"]); } catch (_e) { continue; }
          if (!r || r.code !== 0) continue;
          const lines = cleanLines(r.stdout).slice(-2);
          const prev = this.seen[a.address] || [];
          for (const l of lines) {
            if (prev.includes(l)) continue;
            const text = redact(l);
            const dupe = this.intel.slice(0, 12).some((e) => e.text === text) || fresh.some((e) => e.text === text);
            if (!dupe) fresh.push({ sign: sign(st, a), text, col: STATUS_COLOR[a.status] || C.text, at: Date.now() });
          }
          this.seen[a.address] = lines;
        }
        if (fresh.length) {
          this.intel = fresh.reverse().concat(this.intel).slice(0, 24);
          cx.notify();
        }
      } finally {
        this.polling = false;
      }
    });
  }

  countIntel(cx) {
    if (readState().mode !== "active" || this.counting) return;
    const sp = spaces().filter((s) => agents().some((a) => a.space === s.id));
    this.counting = true;
    cx.spawn(async (cx) => {
      try {
        const next = {};
        for (const s of sp) {
          const ag = agents().find((a) => a.space === s.id);
          const pn = ag && panes().find((p) => p.pane === ag.pane);
          const cwd = (pn && pn.cwd) || s.folder;
          if (!cwd) continue;
          try {
            const r = await exec("git", ["-C", cwd, "status", "--porcelain"], { on: s.machine, timeout: 5000 });
            if (r.code === 0) next[s.id] = r.stdout.split("\n").filter((l) => l.trim()).length;
          } catch (_e) { /* not a repo, or the machine is away */ }
        }
        this.intelCount = next;
        cx.notify();
      } finally {
        this.counting = false;
      }
    });
  }

  // The panel shows the agent you last clicked in the rail, or else the one you're in.
  // Does nothing while the panel is hidden or showing Files/Changes.
  followDossier(cx) {
    if (!dossierShown()) return;
    const list = agents();
    const raw = shared("r5.dossier");
    const pin = typeof raw === "string" ? raw : null;
    const pinAddr = pin ? pin.split("|")[0] : null;
    const f = focused();
    const fa = f && f.terminal && list.some((a) => a.address === f.terminal) ? f.terminal : null;
    const pinChanged = pin && pin !== this.lastPin;
    const focusChanged = fa && fa !== this.lastFocus;
    this.lastPin = pin;
    if (fa) this.lastFocus = fa;
    let target = pinChanged ? pinAddr : focusChanged ? fa : this.address;
    if (!list.some((a) => a.address === target)) target = fa || (list[0] && list[0].address) || null;
    if (target !== this.address) {
      this.address = target;
      this.traffic = null;
      this.files = null;
      this.loadedAt = Date.now();
      this.loadDossier(cx);
      cx.notify();
    } else if (target && Date.now() - this.loadedAt > 10000) {
      this.loadedAt = Date.now();
      this.loadDossier(cx);
    }
  }

  loadDossier(cx) {
    if (checking()) return;
    const a = agents().find((x) => x.address === this.address);
    if (!a) return;
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["read", a.address, "--lines", "40"]);
        this.traffic = r.code === 0 ? cleanLines(r.stdout).slice(-8).map(redact) : [];
      } catch (_e) { this.traffic = []; }
      const pn = panes().find((p) => p.pane === a.pane);
      const s = spaces().find((x) => x.id === a.space);
      const cwd = (pn && pn.cwd) || (s && s.folder);
      if (cwd) {
        try {
          const g = await exec("git", ["-C", cwd, "status", "--porcelain"], { on: s ? s.machine : null, timeout: 5000 });
          this.files = g.code === 0 ? g.stdout.split("\n").filter((l) => l.trim()).length : null;
        } catch (_e) { this.files = null; }
      }
      cx.notify();
    });
  }

  // Opens terminal-browser in a split beside the focused pane, if it's installed.
  openBrowser(cx) {
    cx.spawn(async () => {
      let found = false;
      for (const sh of ["/bin/zsh", "/bin/bash", "/bin/sh"]) {
        try {
          const r = await exec(sh, ["-lc", "command -v terminal-browser"], { timeout: 8000 });
          if (r.code === 0 && r.stdout.trim()) { found = true; break; }
          if (r.code !== 127) break;
        } catch (_e) { /* that shell isn't here; try the next */ }
      }
      if (found) {
        run("pane.split", { direction: "right", argv: ["terminal-browser"] });
      } else {
        notify({ title: "Browser not installed", body: "Run in Terminal: brew install terminal-browser", level: "warning", timeout: 9000 });
      }
    });
  }

  // ---- state machine (banner copy only)
  start() {
    const st = readState();
    const list = agents();
    st.mode = list.length ? "active" : "dormant";
    st.phase = list.length ? 5 : 0;
    if (list.length && !st.since) st.since = Date.now();
    if (list.length && !st.caseNo) st.caseNo = this.newCase();
    for (const a of list) if (!st.signs[a.address]) st.signs[a.address] = "R5-" + pad2(st.next++);
    this.prevStatus = Object.fromEntries(list.map((a) => [a.address, a.status]));
    setShared(STATE, st);
  }

  newCase() {
    const d = new Date();
    return `5V-${String(d.getUTCFullYear()).slice(2)}${pad2(d.getUTCMonth() + 1)}-${String(1000 + (hash(String(d.getTime())) % 9000))}`;
  }

  tick() {
    const list = agents();
    const st = readState();
    const now = Date.now();
    const logs = [];
    let changed = false;
    const prev = this.prevStatus || {};

    for (const a of list) {
      if (!st.signs[a.address]) {
        st.signs[a.address] = "R5-" + pad2(st.next++);
        changed = true;
        if (st.mode === "active") logs.push([`ASSET ${st.signs[a.address]} ACQUIRED · ${unit(a)}`, "working"]);
      } else if (st.mode === "active" && prev[a.address] && prev[a.address] !== a.status) {
        logs.push([`${st.signs[a.address]} ${VERB[a.status] || "UPDATED"} \u00b7 OP ${opName(a.space)}`, a.status]);
      }
    }
    if (st.mode === "active" && list.length) {
      for (const addr of Object.keys(prev)) {
        if (!list.some((a) => a.address === addr) && st.signs[addr]) logs.push([`ASSET ${st.signs[addr]} OFF STATION`, "olive"]);
      }
    }
    this.prevStatus = Object.fromEntries(list.map((a) => [a.address, a.status]));

    if (list.length && st.mode === "dormant") {
      st.mode = "boot"; st.phase = 0; st.bootAt = now; changed = true;
      logs.push(["TASKING SIGNAL DETECTED", "gold"]);
    }
    if (st.mode === "boot") {
      const e = now - st.bootAt;
      let ph = 0;
      for (let i = 0; i < BOOT_PHASE_MS.length; i++) if (e >= BOOT_PHASE_MS[i]) ph = i;
      while (st.phase < ph) {
        st.phase += 1; changed = true;
        if (BOOT_LOG[st.phase]) logs.push(BOOT_LOG[st.phase]);
        if (st.phase === 5) for (const a of list) logs.push([`ASSET ${st.signs[a.address]} ACQUIRED · ${unit(a)}`, "working"]);
      }
      if (e >= BOOT_DONE_MS) {
        st.mode = "active"; st.since = now; st.caseNo = this.newCase(); changed = true;
        logs.push(["UPLINK ESTABLISHED", "working"]);
      }
    }
    if (!list.length && st.mode !== "dormant") {
      this.empty += 1;
      if (this.empty >= 3) {
        st.mode = "dormant"; st.phase = 0; st.caseNo = ""; changed = true;
        logs.push(["ALL ASSETS STOOD DOWN", "olive"]);
      }
    } else {
      this.empty = 0;
    }

    if (changed) setShared(STATE, st);
    if (logs.length) {
      const t = stamp(new Date());
      const entries = logs.map(([m, c]) => ({ t, m, c })).reverse();
      setShared(LOG, entries.concat(readLog()).slice(0, 40));
    }

    const blocked = list.filter((a) => a.status === "blocked").length;
    const title = st.mode === "dormant" ? "R5-SIGCOM · STANDBY" : `R5-SIGCOM · OPS-CON ${opsLevel(list)}`;
    if (title !== this.title) { this.title = title; setWindowTitle(title); }
    const badge = blocked ? String(blocked) : null;
    if (badge !== this.badge) { this.badge = badge; setBadge(badge); }
  }

  // ---- render
  render(_cx) {
    const st = readState();
    if (this.role === "banner") return this.renderBanner(st);
    if (this.role === "feed") return this.renderFeed(st);
    if (this.role === "dossier") return this.renderDossier(st, false);
    if (this.role === "dossierpanel") return this.renderDossier(st, true);
    if (this.role === "tabmenu") return this.renderTabMenu();
    if (this.role === "filemenu") return this.renderFileMenu();
    if (this.role === "ticker") return this.renderTicker(st);
    return this.renderRail(st);
  }

  root(el) {
    return el.id("r5-root").on_size_change((size, cx) => {
      if (Math.abs(size.width - this.size.width) > 2 || Math.abs(size.height - this.size.height) > 2) {
        this.size = size; cx.notify();
      }
    });
  }

  renderBanner(st) {
    const list = agents();
    let key, left, right;
    if (st.mode === "dormant") { key = "dormant"; left = "RIGLINE // STANDBY"; right = "OPS-CON —"; }
    else if (st.mode === "boot") { key = "boot"; left = "RIGLINE // HANDSHAKE"; right = "OPS-CON ···"; }
    else {
      const lv = opsLevel(list);
      key = lv === 5 ? "green" : lv === 4 ? "amber" : "red";
      left = "RIGLINE // R5-EYES ONLY"; right = `OPS-CON ${lv}`;
    }
    const [bg, fg] = BANNER[key];
    const text = (t) => div().text_color(fg).child(t);
    return this.root(h_flex()).size_full().px(12).items_center().justify_between()
      .bg(bg).font_family(MONO).text_size(11)
      .when(st.mode === "boot", (el) => el.loop("opacity", { from: 0.55, to: 1, period: 360 }))
      .child(h_flex().items_center().gap(8)
        .child(svg(ART + "mark.svg").w(16).h(11).text_color(fg))
        .child(text(left)))
      .when(this.size.width > 520, (el) => el.child(text(this.clock)))
      .child(text(right));
  }

  renderRail(st) {
    const list = agents();
    setAgentOrder(list.map((a) => a.address));
    const dormant = st.mode === "dormant";
    const boot = st.mode === "boot";
    const ph = dormant ? 0 : boot ? st.phase : 5;
    const compact = this.size.height < 1150;
    const S = Math.max(140, Math.min(compact ? 150 : 200, this.size.width - 60));
    const seal = div().relative().w(S).h(S).flex_shrink_0()
      .child(image(ART + "seal-rings.svg").absolute().left(0).top(0).w(S).h(S)
        .opacity(dormant ? 0.32 : ph >= 1 ? 1 : 0.08).transition("opacity", { duration: 600, easing: "ease-out" }))
      .child(svg(ART + "ticks.svg").absolute().left(0).top(0).w(S).h(S)
        .text_color(dormant ? C.goldDim : ph >= 2 ? C.gold : C.ghost)
        .when(!dormant && ph >= 2, (el) => el.spin(boot ? 2400 : 36000)))
      .child(image(ART + "seal-core.svg").absolute().left(0).top(0).w(S).h(S)
        .when(dormant, (el) => el.loop("opacity", { from: 0.22, to: 0.42, period: 4200 }))
        .when(!dormant, (el) => el.opacity(ph >= 3 ? 1 : 0.06).transition("opacity", { duration: 700, easing: "ease-out" })));

    const sub = dormant ? "STANDBY · PLATFORM DORMANT" : boot ? "INITIALIZING PLATFORM" : "RIG5IVE SIGNALS COMMAND";
    let uplink;
    if (dormant) uplink = "UPLINK IDLE · CARRIER HELD";
    else if (boot) uplink = "UPLINK NEGOTIATING";
    else {
      const m = Math.max(0, Math.floor((Date.now() - (st.since || Date.now())) / 60000));
      uplink = `UPLINK T+${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
    }
    const codes = [
      ["DIRECTIVE", "R5-DIR 5-05 REV C"],
      ["COMPARTMENT", "RIGLINE / HERDSMAN"],
      ["CASE NO.", dormant ? "— UNASSIGNED —" : boot ? "ASSIGNING···" : st.caseNo || "—"],
      ["POSTURE", dormant ? "COLD STANDBY" : boot ? "SPIN-UP" : "ACTIVE COLLECTION"],
      ["AUTH CHAIN", "CMDR-5 › OP-DESK"],
    ];
    const identity = v_flex().w_full().gap(2)
      .child(div().text_size(15).font_weight(700).text_color(dormant ? C.goldDim : C.gold2).child("R5-SIGCOM"))
      .child(div().text_color(dormant ? C.faint : C.hi).child("HERD OPERATIONS"))
      .child(div().text_color(C.dim).child(sub))
      .child(div().text_color(C.dim).when(boot, (el) => el.loop("opacity", { from: 0.4, to: 1, period: 700 })).child(uplink))
      .child(div().text_color(C.dim).child("STN HOBBS-NM-01 \u00b7 GRID 32-41"))
      .when(!dormant && !boot && list.length, (el) => el.child(div().truncate().text_color(C.gold2)
        .child("OPS \u00b7 " + [...new Set(list.map((a) => opName(a.space)))].join(" \u00b7 "))));
    const codeRows = v_flex().w_full().gap(2).children(codes.map(([k, v]) => h_flex().w_full()
      .child(div().w(96).flex_shrink_0().text_color(C.dim).child(k))
      .child(div().flex_1().truncate().text_color(dormant ? C.goldDim : C.gold2).child(v))));

    const visible = dormant || (boot && ph < 5) ? [] : list;
    const R = Math.max(96, Math.min(compact ? 116 : 128, Math.floor((this.size.width - 28 - 12) / 2)));
    const radar = div().relative().w(R).h(R).flex_shrink_0()
      .child(svg(ART + "radar-grid.svg").absolute().left(0).top(0).w(R).h(R).text_color(dormant ? C.ghost : C.rule))
      .child(svg(ART + "radar-sweep.svg").absolute().left(0).top(0).w(R).h(R)
        .text_color(dormant ? C.faint : C.green).spin(dormant ? 14000 : boot ? 1600 : 4000))
      .when(dormant, (el) => el.child(div().absolute().left(R / 2 - 3).top(R / 2 - 3).w(6).h(6).rounded(3).bg(C.gold)
        .loop("opacity", { from: 0.2, to: 0.9, period: 2400 })))
      .children(visible.map((a) => {
        const h = hash(a.address);
        const ang = ((h % 360) * Math.PI) / 180;
        const rr = (0.3 + ((h >>> 9) % 60) / 100) * (R / 2 - 8);
        const x = R / 2 + rr * Math.cos(ang) - 3.5, y = R / 2 + rr * Math.sin(ang) - 3.5;
        return div().absolute().left(Math.round(x)).top(Math.round(y)).w(7).h(7).rounded(4)
          .bg(STATUS_COLOR[a.status] || C.olive)
          .loop("opacity", a.status === "blocked" ? { from: 0.25, to: 1, period: 500 } : { from: 0.35, to: 1, period: 4000 });
      }));
    const anyBlocked = visible.some((a) => a.status === "blocked");
    const stat = (k, v, col) => v_flex().gap(1).child(div().text_color(C.dim).child(k)).child(div().text_color(col).child(v));
    const sweepLabel = h_flex().w_full().justify_between().text_size(10)
      .child(stat("SWEEP", dormant ? "LOW" : boot ? "FAST" : "NOMINAL", dormant ? C.faint : C.text))
      .child(stat("CONTACTS", String(visible.length), dormant ? C.faint : C.text))
      .child(stat("BLOCKED", String(visible.filter((a) => a.status === "blocked").length), anyBlocked ? C.red : dormant ? C.faint : C.text))
      .child(stat("INTEL", dormant ? "\u2014" : `${Object.values(this.intelCount).reduce((n, v) => n + v, 0)} FILES`, dormant ? C.faint : C.gold2));

    // Spinning wireframe globe beside the scope. 6px mono cells: 3.6px wide, 6px tall.
    const gCols = Math.floor(R / 3.6) | 1, gRows = Math.floor(R / 6) | 1;
    const gKey = "globe" + gCols + "x" + gRows;
    const gl = this.cache[gKey] || (this.cache[gKey] = GLOBE_FRAMES[gKey] || globeFrames(gCols, gRows));
    const gMs = dormant ? 400 : boot ? 45 : 110;
    const gCol = [dormant ? C.ghost : "#1E4A2E", dormant ? C.faint : anyBlocked ? C.red : C.green, dormant ? C.goldDim : C.gold2];
    const gPadX = Math.floor((R - gCols * 3.6) / 2), gPadY = Math.floor((R - gRows * 6) / 2);
    const globe = div().relative().w(R).h(R).flex_shrink_0()
      .child(svg(ART + "globe-ring.svg").absolute().left(0).top(0).w(R).h(R).text_color(dormant ? C.ghost : C.rule))
      .children(gl.map((rowsF, k) => v_flex().absolute().left(gPadX).top(gPadY).gap(0)
        .children(rowsF.map((fr) => div().h(6).line_height("6px").text_size(6).font_family(MONO).whitespace_nowrap()
          .text_color(gCol[k]).frames(fr, gMs)))));

    const sparkLen = Math.max(8, Math.floor((this.size.width - 44) / 6.8));  // 11px mono is ~6.6px a cell
    let assets;
    if (!visible.length) {
      assets = v_flex().w_full().py(10).items_center().gap(2)
        .child(div().text_color(C.idle).child(dormant ? "NO ASSETS ON STATION" : "ACQUIRING ASSETS···"))
        .when(dormant, (el) => el.child(div().text_color(C.faint).child("AWAITING TASKING")));
    } else {
      assets = v_flex().id("r5-assets").w_full().flex_1().min_h(0).overflow_y_scrollbar().gap(1)
        .children(visible.map((a) => {
          const col = STATUS_COLOR[a.status] || C.olive;
          const key = a.address + a.status + sparkLen;
          let tele;
          if (a.status === "working") {
            const fr = this.cache[key] || (this.cache[key] = sparkFrames(hash(a.address), sparkLen));
            tele = div().text_color(col).frames(fr, 260);
          } else if (a.status === "blocked") {
            tele = div().text_color(col).frames([SPARK[7].repeat(sparkLen), SPARK[2].repeat(sparkLen)], 450);
          } else {
            tele = div().text_color(col).child((a.status === "done" ? SPARK[1] : SPARK[0]).repeat(sparkLen));
          }
          return v_flex().id("r5-a-" + a.address).w_full().px(6).py(3).rounded(3).cursor_pointer()
            .when(a.focused, (el) => el.bg(C.ghost))
            .hover((s) => s.bg(C.ghost))
            .on_click(() => showDossier(a.address))
            .tooltip("Open asset dossier")
            .child(h_flex().w_full().gap(8)
              .child(div().w(42).flex_shrink_0().text_color(C.hi).child(sign(st, a)))
              .child(div().w(70).flex_shrink_0().text_color(col).child(a.status.toUpperCase()))
              .child(div().flex_1().truncate().text_color(C.dim).child(unit(a))))
            .child(div().w_full().overflow_hidden().whitespace_nowrap().child(tele));
        }));
    }

    const browse = h_flex().id("r5-browser").w_full().items_center().justify_center().gap(8).py(5).rounded(3)
      .border(1).border_color(dormant ? C.faint : C.gold).text_color(dormant ? C.dim : C.gold2).cursor_pointer()
      .hover((el) => el.bg(C.ghost))
      .on_click((_e, cx) => this.openBrowser(cx))
      .tooltip("Open a web browser beside your agents")
      .child("\u25ce OPEN BROWSER \u00b7 SOURCE INTEL");
    return this.root(v_flex()).size_full().bg(C.panel).font_family(MONO).text_size(11).text_color(C.text)
      .px(14).py(12).gap(10).overflow_hidden()
      .child(h_flex().w_full().justify_center().child(seal))
      .child(identity)
      .child(codeRows)
      .child(browse)
      .child(v_flex().w_full()
        .child(rule("RADAR \u00b7 GLOBAL COVERAGE", null))
        .child(h_flex().w_full().justify_between().items_center().child(radar).child(globe))
        .child(div().h(6))
        .child(sweepLabel))
      .child(v_flex().w_full().flex_1().min_h(0)
        .child(rule("ASSETS ON STATION", dormant ? "NONE" : `${list.length} TRACKED`))
        .child(assets))
      .child(v_flex().w_full().flex_shrink_0()
        .child(rule("NETWORK \u00b7 RIGLINE MESH", dormant ? "IDLE" : boot ? "LINKING" : `${visible.length + RELAYS.length} NODES`))
        .child(this.renderNetwork(st, visible, dormant, boot, ph, compact ? 124 : 150)))
      .child(div().w_full().text_size(9).text_color(dormant ? C.ghost : C.faint)
        .child(`FORM R5-1147 · HANDLE VIA RIGLINE ONLY · BUILD ${BUILD}`));
  }

  renderNetwork(st, visible, dormant, boot, ph, H) {
    const W = Math.max(200, this.size.width - 28);
    const hx = W / 2, hy = H / 2 - 4;
    const relays = RELAYS.map((r) => ({ ...r, px: r.x * W, py: r.y * H }));
    const nodes = visible.map((a, i) => {
      const n = visible.length;
      const ang = -Math.PI / 2 + (i + 0.5) * (2 * Math.PI / Math.max(n, 1)) + (n === 1 ? 0.6 : 0);
      return { a, px: hx + Math.cos(ang) * W * 0.3, py: hy + Math.sin(ang) * H * 0.36 };
    });
    const show = !dormant && (!boot || ph >= 3);
    const relayLinks = relays.map((r) => [hx, hy, r.px, r.py]);
    const ring = relays.map((r, i) => { const q = relays[(i + 1) % relays.length]; return [r.px, r.py, q.px, q.py]; });
    const quiet = [], live = [], hot = [];
    for (const nd of nodes) {
      const seg = [hx, hy, nd.px, nd.py];
      (nd.a.status === "blocked" ? hot : nd.a.status === "working" ? live : quiet).push(seg);
    }
    const layer = (pairs, color, width, dash) => pairs.length
      ? window.paint_path(strokeLines(pairs, width, dash), color).absolute().left(0).top(0).w(W).h(H)
      : null;
    const dot = (x, y, size, color) => div().absolute().left(Math.round(x - size / 2)).top(Math.round(y - size / 2))
      .w(size).h(size).rounded(size / 2).bg(color);
    // A packet rides a link: left and top swing together, so it stays on the line.
    const packet = (x1, y1, x2, y2, period, color, size = 4) => div().absolute()
      .left(Math.round(x1 - size / 2)).top(Math.round(y1 - size / 2)).w(size).h(size).rounded(size / 2).bg(color)
      .loop("left", { from: Math.round(x1 - size / 2), to: Math.round(x2 - size / 2), period, easing: "linear" })
      .loop("top", { from: Math.round(y1 - size / 2), to: Math.round(y2 - size / 2), period, easing: "linear" });
    const label = (x, y, text, color) => div().absolute().left(Math.round(x - 24)).top(Math.round(y)).w(48)
      .text_size(8).text_color(color).text_center().child(text);

    const box = div().relative().w(W).h(H).overflow_hidden();
    const els = [];
    els.push(layer(ring, dormant ? C.ghost : C.rule, 1, [2, 3]));
    els.push(layer(relayLinks, dormant ? C.ghost : C.faint, 1, dormant ? [2, 3] : null));
    if (show) {
      els.push(layer(quiet, C.faint, 1, [2, 2]));
      els.push(layer(live, C.idle, 1.2, null));
      els.push(layer(hot, C.red, 1.2, [3, 2]));
    }
    for (const [i, r] of relays.entries()) {
      els.push(dot(r.px, r.py, 6, dormant ? C.faint : C.dim));
      els.push(label(r.px, r.py + 5, r.name, dormant ? C.ghost : C.faint));
      if (!dormant) {
        const q = relays[(i + 1) % relays.length];
        els.push(packet(r.px, r.py, q.px, q.py, 5200 + i * 700, C.hex, 3));
        els.push(packet(hx, hy, r.px, r.py, 3800 + i * 500, C.idle, 3));
      }
    }
    if (show) {
      for (const [i, nd] of nodes.entries()) {
        const col = STATUS_COLOR[nd.a.status] || C.olive;
        if (nd.a.status === "working") {
          const per = 1100 + (hash(nd.a.address) % 700);
          els.push(packet(hx, hy, nd.px, nd.py, per, C.green));
          els.push(packet(nd.px, nd.py, hx, hy, per + 260, C.gold2, 3));
        }
        els.push(div().absolute().left(Math.round(nd.px - 7)).top(Math.round(nd.py - 7)).w(14).h(14).rounded(7)
          .border(1).border_color(col)
          .loop("opacity", nd.a.status === "blocked" ? { from: 0.2, to: 1, period: 500 } : { from: 0.3, to: 0.9, period: 1600 + i * 170 }));
        els.push(dot(nd.px, nd.py, 8, col).when(nd.a.status === "blocked", (el) => el.loop("opacity", { from: 0.35, to: 1, period: 500 })));
        els.push(label(nd.px, nd.py + 8, sign(st, nd.a), nd.a.status === "blocked" ? C.red : C.dim));
      }
    }
    // the command hub
    els.push(div().absolute().left(Math.round(hx - 11)).top(Math.round(hy - 11)).w(22).h(22).rounded(11)
      .border(1).border_color(dormant ? C.goldDim : C.gold)
      .loop("opacity", dormant ? { from: 0.25, to: 0.7, period: 3600 } : { from: 0.5, to: 1, period: 1400 }));
    els.push(dot(hx, hy, 12, dormant ? C.goldDim : boot ? C.amber : C.gold2)
      .when(boot, (el) => el.loop("opacity", { from: 0.3, to: 1, period: 300 })));
    els.push(label(hx, hy + 12, "R5-CMD", dormant ? C.goldDim : C.gold2));
    return box.children(els.filter(Boolean));
  }

  // Start a terminal or agent in a split of the right-clicked tab.
  splitTab(argv, direction) {
    const tab = this.tabId;
    const sp = spaces().find((s) => s.id === this.spaceId);
    const t = sp && sp.tabs.find((x) => x.id === tab);
    if (t && !t.active) run("tab.select", { id: tab });
    const pn = panes().find((p) => p.tab === tab && p.focused) || panes().find((p) => p.tab === tab);
    const args = { direction };
    if (pn) args.pane = pn.pane;
    if (argv) args.argv = argv;
    run("pane.split", args);
    closeOverlay((props() || {}).overlay);
  }

  renderTicker(st) {
    const g = readGdp();
    const dormant = st.mode === "dormant";
    const labelW = 108, srcW = 150;
    const cols = Math.max(20, Math.floor((this.size.width - labelW - srcW - 24) / 7.3));
    const key = `${g.at}|${cols}`;
    if (!this.tick || this.tick.key !== key) {
      const items = g.rows.map(([c, v, gr]) => `${c}  GDP ${trillions(v)}  ${gr == null ? "" : (gr >= 0 ? "\u25b2" : "\u25bc") + Math.abs(gr).toFixed(1) + "%"}`);
      const loop = items.join("   \u00b7   ") + "   \u00b7   ";
      let strip = loop;
      while (strip.length < loop.length + cols) strip += loop;
      const frames = [];
      for (let i = 0; i < loop.length; i++) frames.push(strip.slice(i, i + cols));
      this.tick = { key, frames };
    }
    return this.root(h_flex()).size_full().px(10).gap(10).items_center().bg("#050A07").font_family(MONO).text_size(12)
      .child(div().w(labelW).flex_shrink_0().text_size(10).text_color(dormant ? C.goldDim : C.gold2).child("ECON INTEL \u25b8"))
      .child(div().flex_1().min_w(0).overflow_hidden().whitespace_nowrap().text_color(dormant ? C.idle : C.text).frames(this.tick.frames, 140))
      .child(div().w(srcW).flex_shrink_0().text_size(9).text_color(C.dim).text_right()
        .child(`WORLD BANK \u00b7 ${g.year || "\u2014"}${g.at ? "" : " \u00b7 CACHED"}`));
  }

  // Start a terminal or agent working in the right-clicked folder.
  openIn(argv, place) {
    const args = { folder: this.fm.folder, place };
    if (argv) args.argv = argv;
    run("terminal.open", args);
    closeOverlay((props() || {}).overlay);
  }

  renderFileMenu() {
    const fm = this.fm;
    const close = () => closeOverlay((props() || {}).overlay);
    const stop = (_e, cx) => cx.stop_propagation();
    const where = fm.folder.split(/[\\/]/).filter(Boolean).pop() || fm.folder;
    const icon = (prog) => prog && prog.icon
      ? (prog.tint ? svg(prog.icon).size(14).flex_shrink_0().text_color(C.dim) : image(prog.icon).size(14).flex_shrink_0())
      : div().size(14).flex_shrink_0();
    const chip = (id, glyph, tip, onClick) => div().id(id).w(24).h(20).flex_shrink_0().flex().items_center().justify_center()
      .rounded(3).border(1).border_color(C.faint).text_color(C.dim).cursor_pointer()
      .hover((el) => el.bg(C.rule).text_color(C.gold2)).tooltip(tip)
      .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); onClick(); }).child(glyph);
    const row = (key, prog, name, argv, enabled) => h_flex().id("r5-fm-" + key).w_full().h(28).px(8).gap(6).items_center().rounded(4)
      .text_color(enabled ? C.text : C.faint)
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(C.ghost)).on_click(() => this.openIn(argv, "tab")))
      .child(icon(prog))
      .child(div().flex_1().min_w(0).truncate().child(name))
      .when(!enabled, (el) => el.child(div().text_size(10).text_color(C.faint).child("NOT INSTALLED")))
      .when(enabled, (el) => el
        .child(chip("r5-fm-t-" + key, "\u29c9", "New tab", () => this.openIn(argv, "tab")))
        .child(chip("r5-fm-r-" + key, "\u2192", "Split right", () => this.openIn(argv, "right")))
        .child(chip("r5-fm-d-" + key, "\u2193", "Split down", () => this.openIn(argv, "down"))));
    const rows = [row("terminal", null, "Terminal", null, true)];
    if (this.progs == null) rows.push(h_flex().h(28).px(8).items_center().text_color(C.sync)
      .child(div().frames(["SCANNING ASSETS \u00b7", "SCANNING ASSETS \u00b7\u00b7", "SCANNING ASSETS \u00b7\u00b7\u00b7"], 300)));
    else for (const pr of this.progs) rows.push(row(pr.key, pr, pr.name, pr.run, pr.installed));
    const w = appWindow();
    const canReveal = !fm.on && w && w.platform === "macos";
    return v_flex().w_full().bg(C.panel).font_family(MONO).text_size(12).text_color(C.text).p(6).gap(1)
      .child(v_flex().w_full().px(8).pt(4).pb(6).gap(2)
        .child(div().text_size(10).text_color(C.gold2).child("START AGENT HERE"))
        .child(div().truncate().text_color(C.hi).child((fm.dir ? "\u25b8 " : "\u25b8 ") + where + (fm.dir ? "/" : "")))
        .when(!fm.dir, (el) => el.child(div().truncate().text_size(10).text_color(C.dim).child("FROM FILE " + fm.name)))
        .child(div().text_size(10).text_color(C.dim).child("\u29c9 TAB   \u2192 RIGHT   \u2193 DOWN")))
      .children(rows)
      .when(canReveal, (el) => el
        .child(div().w_full().h(1).my(4).bg(C.rule))
        .child(h_flex().id("r5-fm-reveal").w_full().h(26).px(8).items_center().rounded(4).cursor_pointer()
          .hover((s) => s.bg(C.ghost)).on_click(() => { exec("open", ["-R", fm.target]).catch(() => null); close(); })
          .child("Reveal in Finder")));
  }

  renderTabMenu() {
    const close = () => closeOverlay((props() || {}).overlay);
    const stop = (_e, cx) => cx.stop_propagation();
    const icon = (prog) => prog && prog.icon
      ? (prog.tint ? svg(prog.icon).size(14).flex_shrink_0().text_color(C.dim) : image(prog.icon).size(14).flex_shrink_0())
      : div().size(14).flex_shrink_0();
    const chip = (id, glyph, tip, onClick) => div().id(id).w(22).h(20).flex_shrink_0().flex().items_center().justify_center()
      .rounded(3).border(1).border_color(C.faint).text_color(C.dim).cursor_pointer()
      .hover((el) => el.bg(C.rule).text_color(C.gold2)).tooltip(tip)
      .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); onClick(); }).child(glyph);
    const row = (key, prog, name, argv, enabled, note) => h_flex().id("r5-tm-" + key).w_full().h(28).px(8).gap(8).items_center().rounded(4)
      .text_color(enabled ? C.text : C.faint)
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(C.ghost)).on_click(() => this.splitTab(argv, "right")))
      .child(icon(prog))
      .child(div().flex_1().min_w(0).truncate().child(name))
      .when(!enabled, (el) => el.child(div().text_size(10).text_color(C.faint).child(note || "NOT INSTALLED")))
      .when(enabled, (el) => el
        .child(chip("r5-tm-r-" + key, "\u2192", "Split right", () => this.splitTab(argv, "right")))
        .child(chip("r5-tm-d-" + key, "\u2193", "Split down", () => this.splitTab(argv, "down"))));
    const action = (id, label, fn, color) => h_flex().id(id).w_full().h(26).px(8).items_center().rounded(4)
      .text_color(color || C.text).cursor_pointer().hover((s) => s.bg(C.ghost)).on_click(fn).child(label);
    const progs = this.progs;
    const rows = [];
    if (progs == null) rows.push(h_flex().h(28).px(8).items_center().text_color(C.sync)
      .child(div().frames(["SCANNING ASSETS \u00b7", "SCANNING ASSETS \u00b7\u00b7", "SCANNING ASSETS \u00b7\u00b7\u00b7"], 300)));
    else if (!progs.length) rows.push(h_flex().h(28).px(8).items_center().text_color(C.faint).child("NO AGENTS IN THE + MENU"));
    else for (const pr of progs) rows.push(row(pr.key, pr, pr.name, pr.run, pr.installed));
    const header = (t) => div().w_full().px(8).pt(6).pb(3).text_size(10).text_color(C.gold2).child(t);
    const sep = () => div().w_full().h(1).my(4).bg(C.rule);
    return v_flex().w_full().bg(C.panel).font_family(MONO).text_size(12).text_color(C.text).p(6).gap(1)
      .child(action("r5-tm-split-right", "\u2192  Split right", () => this.splitTab(null, "right")))
      .child(action("r5-tm-split-down", "\u2193  Split down", () => this.splitTab(null, "down")))
      .child(sep())
      .child(header("NEW AGENT IN SPLIT"))
      .children(rows)
      .child(sep())
      .child(action("r5-tm-rename", "Rename tab", () => { close(); run("tab.rename", { id: this.tabId }); }))
      .child(action("r5-tm-close", "Close tab", () => { close(); run("tab.close", { id: this.tabId }); }, C.red))
      .child(action("r5-tm-more", "More\u2026", () => {
        close();
        openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: this.tabId, space: this.spaceId } } });
      }, C.dim));
  }

  renderDossier(st, inPanel) {
    const a = agents().find((x) => x.address === this.address);
    const close = inPanel ? () => run("layout.hide", { id: "panel" }) : () => closeOverlay((props() || {}).overlay);
    const narrow = inPanel && this.size.width < 520;
    const shell = (body) => this.root(v_flex()).size_full().bg(C.panel).font_family(MONO).text_size(11).text_color(C.text)
      .p(inPanel ? 14 : 18).gap(10).overflow_hidden().children(body);
    if (!a) {
      return shell([
        div().text_size(15).font_weight(700).text_color(C.gold2).child("ASSET DOSSIER"),
        div().text_color(C.olive).child(inPanel ? "NO ASSET SELECTED \u00b7 START OR CLICK AN AGENT" : "ASSET OFF STATION \u00b7 NO CURRENT RECORD"),
        h_flex().child(button("r5-d-close", "CLOSE", C.dim, close)),
      ]);
    }
    const pn = panes().find((p) => p.pane === a.pane);
    const sp = spaces().find((s) => s.id === a.space);
    const tab = sp && sp.tabs.find((t) => t.id === a.tab);
    const col = STATUS_COLOR[a.status] || C.olive;
    const fields = [
      ["CALLSIGN", sign(st, a), C.hi],
      ["OPERATION", "OP " + opName(a.space), C.gold2],
      ["UNIT", unit(a), C.text],
      ["STATUS", a.status.toUpperCase(), col],
      ["THEATER", (a.space_name || "\u2014").toUpperCase(), C.text],
      ["POSITION", redactPath(pn && pn.cwd), C.text],
      ["BRANCH", (pn && pn.branch) || (sp && sp.branch) || "\u2014", C.text],
      ["TIME ON TASK", agoText(tab && tab.working_since), C.text],
      ["INTEL", this.files == null ? "\u2014" : `${this.files} FILES CHANGED`, C.gold2],
    ];
    const [alertText, alertColor, alertPulse] = ALERT[a.status] || ["SIGNAL UNCLEAR", C.olive, false];
    const alertBadge = h_flex().gap(6).items_center().px(8).py(4).border(1).border_color(alertColor).rounded(2)
      .when(alertPulse, (el) => el.bg("#2A0D0A").loop("opacity", { from: 0.55, to: 1, period: 700 }))
      .child(div().w(7).h(7).rounded(4).bg(alertColor))
      .child(div().text_color(alertColor).child(alertText));
    const header = (narrow ? v_flex().items_start().gap(8) : h_flex().justify_between().items_center()).w_full()
      .child(v_flex().gap(2)
        .child(div().text_size(10).text_color(C.dim).child("RIG5IVE SIGNALS COMMAND \u00b7 HOBBS STATION"))
        .child(div().text_size(17).font_weight(700).text_color(C.gold2).child("ASSET DOSSIER")))
      .child(alertBadge);
    const strip = div().w_full().px(8).py(3).bg("#0F3A20").text_color(C.text).text_size(10)
      .child(`CLEARANCE R5-HERDSMAN \u00b7 FORM R5-2290 \u00b7 COPY 1 OF 1 \u00b7 ${stamp(new Date())}`);
    const card = (narrow ? v_flex().items_center() : h_flex().items_start()).w_full().gap(narrow ? 10 : 18)
      .child(v_flex().flex_shrink_0().items_center().gap(3)
        .child(emblem(a, 120))
        .child(div().text_size(9).text_color(C.dim).child(`UNIT \u00b7 ${unit(a)}`)))
      .child(v_flex().w_full().flex_1().min_w(0).gap(3).children(fields.map(([k, v, c]) => h_flex().w_full()
        .child(div().w(narrow ? 96 : 110).flex_shrink_0().text_color(C.dim).child(k))
        .child(div().flex_1().truncate().text_color(c).child(v)))));
    const traffic = this.traffic == null
      ? [div().text_color(C.sync).frames(["DECRYPTING \u00b7", "DECRYPTING \u00b7\u00b7", "DECRYPTING \u00b7\u00b7\u00b7"], 300)]
      : this.traffic.length
        ? this.traffic.map((l) => div().truncate().text_color(C.hex).child(l))
        : [div().text_color(C.faint).child("NO TRAFFIC ON RECORD")];
    return shell([
      header,
      strip,
      card,
      rule("LAST TRAFFIC \u00b7 REDACTED", null),
      v_flex().w_full().flex_1().min_h(0).gap(1).overflow_hidden().children(traffic),
      h_flex().w_full().justify_between().items_center()
        .child(div().text_size(9).text_color(C.faint).child(narrow ? "" : `HANDLE VIA RIGLINE ONLY \u00b7 BUILD ${BUILD}`))
        .child(h_flex().gap(8)
          .child(button("r5-d-close", "CLOSE", C.dim, close))
          .child(button("r5-d-go", "GO TO TERMINAL", C.gold2, () => { close(); run("agent.focus", { terminal: a.address }); }))),
    ]);
  }

  // Analyzer geometry from the feed's size: rows above the line, columns across.
  specGeom() {
    const W = this.size.width, H = this.size.height;
    const specW = Math.max(220, Math.floor(W * 0.32));
    const rows = Math.max(2, Math.min(6, Math.floor((H - 20 - 18 - 14 - 2 * 10 - 4 - 31) / 12)));
    const meters = Math.min(6, agents().length);
    const meterW = meters ? meters * 24 + 8 : 0;
    const cols = Math.max(12, Math.min(140, Math.floor((specW - 34 - meterW) / 7.9)));
    return { specW, rows, cols, meters, meterW };
  }

  waveKey() {
    const st = readState();
    const g = this.specGeom();
    const working = Math.min(4, agents().filter((a) => a.status === "working").length);
    const shape = st.mode === "boot" ? "boot" : st.mode === "active" && working > 0 ? "active" : "dormant";
    const blocked = agents().some((a) => a.status === "blocked");
    return { key: `${shape}|${working}|${g.cols}|${g.rows}|${blocked}`, mode: shape, working, blocked, cols: g.cols, rows: g.rows };
  }

  // Analyzer frames are built here, on a timer, never inside render.
  prepWave(cx) {
    const k = this.waveKey();
    if (this.wave && this.wave.key === k.key) return;
    this.wave = { key: k.key, rows: k.rows, strips: waveFrames(k.cols, k.mode, k.working, 11, k.rows),
      audio: audioFrames(k.cols, k.mode, k.working, k.blocked, 23) };
    if (cx && !checking()) cx.notify();
  }

  // ---- signal mix: each asset's share of traffic. Targets move every 3s from
  // agent status, recent intercept lines and a little drift; the pie eases to
  // them in 4 short steps, so the feed redraws only a handful of times.
  retargetMix(cx) {
    const st = readState();
    if (st.mode !== "active" || !this.pieOn) return;
    const list = agents();
    if (!list.length) return;
    const base = { working: 4, blocked: 2.6, done: 1.2, idle: 0.5 };
    const now = Date.now();
    const recent = {};
    for (const e of this.intel) if (now - e.at < 45000) recent[e.sign] = (recent[e.sign] || 0) + 1;
    this.mixTick = (this.mixTick || 0) + 1;
    const w = {};
    let sum = 0;
    for (const a of list) {
      const r = rng(hash(a.address) + this.mixTick * 7919)();
      const v = (base[a.status] || 0.5) * (0.7 + 0.6 * r) * (1 + 0.35 * (recent[sign(st, a)] || 0));
      w[a.address] = v; sum += v;
    }
    this.mixFrom = {};
    for (const a of list) this.mixFrom[a.address] = this.mix[a.address] || 0;
    this.mixTo = {};
    for (const k in w) this.mixTo[k] = w[k] / sum;
    this.mixStep = 4;
    this.stepMix(cx);
  }
  stepMix(cx) {
    if (!this.mixStep) return;
    this.mixStep--;
    const t = 1 - this.mixStep / 4, e = t * t * (3 - 2 * t);
    const next = {};
    for (const k in this.mixTo) next[k] = (this.mixFrom[k] || 0) + (this.mixTo[k] - (this.mixFrom[k] || 0)) * e;
    this.mix = next;
    cx.notify();
  }

  renderMix(st, list, dormant, boot, H) {
    const P = Math.max(64, Math.min(96, H - 44));
    const c = P / 2, r = P / 2 - 3;
    const live = !dormant && !boot && list.length && Object.keys(this.mix).length;
    const rows = live ? list.filter((a) => this.mix[a.address] != null)
      .map((a, i) => ({ a, f: this.mix[a.address], col: a.status === "blocked" ? C.red : PIE_COLORS[(hash(a.address) >>> 3) % PIE_COLORS.length] }))
      .sort((x, y) => y.f - x.f) : [];
    const top = rows[0];
    const pie = div().relative().w(P).h(P).flex_shrink_0()
      .when(!live, (el) => el.child(div().absolute().left(3).top(3).w(P - 6).h(P - 6).rounded(P).bg(dormant ? C.ghost : "#0C1F15")))
      .when(live, (el) => el.children(pieSlices(rows.map((x) => [x.f, x.col]), c, r)
        .map(([path, col]) => window.paint_path(path, col).absolute().left(0).top(0).w(P).h(P))))
      .when(live && rows.length > 1, (el) => {
        let a = -Math.PI / 2;
        const cuts = rows.map((x) => { const v = [c, c, c + r * Math.cos(a), c + r * Math.sin(a)]; a += x.f * Math.PI * 2; return v; });
        return el.child(window.paint_path(strokeLines(cuts, 1.5), C.panel).absolute().left(0).top(0).w(P).h(P));
      })
      .child(svg(ART + "globe-ring.svg").absolute().left(0).top(0).w(P).h(P).text_color(dormant ? C.ghost : C.rule))
      .child(v_flex().absolute().left(Math.round(c - r * 0.52)).top(Math.round(c - r * 0.52)).w(Math.round(r * 1.04)).h(Math.round(r * 1.04))
        .rounded(P).bg(C.panel).items_center().justify_center().gap(0)
        .child(div().text_size(P >= 90 ? 15 : 12).font_weight(700).text_color(live ? C.hi : dormant ? C.faint : C.gold2)
          .when(!live && !dormant, (el) => el.loop("opacity", { from: 0.3, to: 1, period: 700 }))
          .child(live ? Math.round(top.f * 100) + "%" : dormant ? "—" : "SYNC"))
        .child(div().text_size(8).text_color(C.dim).child(live ? sign(st, top.a) : dormant ? "NO TRAFFIC" : "···")));
    const legend = v_flex().flex_1().min_w(0).gap(1)
      .when(!rows.length, (el) => el.child(div().text_color(C.faint).child(dormant ? "NO SIGNAL" : "ACQUIRING")))
      .children(rows.slice(0, Math.max(2, Math.floor((H - 40) / 15))).map((x) => h_flex().h(15).gap(6).items_center().min_w(0)
        .tooltip(unit(x.a))
        .child(div().w(7).h(7).flex_shrink_0().rounded(1).bg(x.col))
        .child(div().w(36).flex_shrink_0().text_color(C.hi).child(sign(st, x.a)))
        .child(div().flex_shrink_0().text_color(x.col).child(String(Math.round(x.f * 100)).padStart(3, " ") + "%"))));
    return v_flex().w(MIX_W).flex_shrink_0().gap(1).overflow_hidden()
      .child(rule("SIGNAL MIX", live ? "% TRAFFIC" : dormant ? "STANDBY" : "SYNC"))
      .child(h_flex().w_full().gap(10).items_start().pt(2).child(pie).child(legend));
  }

  renderFeed(st) {
    const list = agents();
    const dormant = st.mode === "dormant", boot = st.mode === "boot";
    const W = this.size.width, H = this.size.height;
    const working = list.filter((a) => a.status === "working").length;
    const blocked = list.some((a) => a.status === "blocked");
    const g = this.specGeom();
    const specW = g.specW;
    const flat = !this.wave || this.wave.key.startsWith("dormant");
    const R = this.wave ? this.wave.rows : g.rows;
    const strips = this.wave ? this.wave.strips : [];
    const rowH = 12;
    // Level colors, top row first: amber peaks, gold, then greens; red when blocked; dim when quiet.
    const ramp = (r) => {
      if (dormant) return C.flat;
      if (boot) return C.sync;
      if (flat) return C.idle;
      if (blocked) return r === 0 ? "#FF7A70" : C.red;
      const t = R <= 1 ? 1 : r / (R - 1);
      return t < 0.2 ? "#F0D27A" : t < 0.45 ? C.gold2 : t < 0.75 ? "#7CF0A2" : C.green;
    };
    const line = (fr, color, h) => div().h(h).line_height(`${h}px`).text_size(13).text_color(color).whitespace_nowrap().frames(fr, flat ? 120 : 110);
    const bars = v_flex().gap(0)
      .children(strips.slice(0, R).map((fr, r) => line(fr, ramp(r), rowH)))
      .child(div().w_full().h(1).bg(dormant ? C.ghost : flat ? C.rule : C.goldDim))
      .when(!flat && !dormant, (el) => el.children(strips.slice(R).map((fr, r) => line(fr, r === 0 ? "#1F4A30" : "#132A1C", 8))));
    const axis = v_flex().w(28).flex_shrink_0().justify_between().h(R * rowH).text_size(9).text_color(C.faint)
      .child(div().child("  0")).child(div().child("-12")).child(div().child("-24"));
    const freq = h_flex().w_full().justify_between().pl(34).pr(g.meterW).text_size(9).text_color(C.faint)
      .children(["60", "250", "1K", "4K", "16K"].map((f) => div().child(f)));
    const meters = h_flex().gap(4).pl(8).items_end().flex_shrink_0()
      .children(list.slice(0, g.meters).map((a, i) => {
        const cols = meterFrames(a.status, R, hash(a.address) + i);
        const col = STATUS_COLOR[a.status] || C.olive;
        return v_flex().w(20).items_center().gap(0)
          .children(cols.map((fr) => div().h(rowH).line_height(`${rowH}px`).text_size(13).text_color(col)
            .when(a.status === "working" || a.status === "blocked", (el) => el.frames(fr, a.status === "blocked" ? 450 : 160 + i * 23))
            .when(a.status !== "working" && a.status !== "blocked", (el) => el.child(fr[0]))))
          .child(div().h(11).text_size(8).text_color(C.dim).child(sign(st, a).slice(3)));
      }));
    const audioColor = dormant ? C.flat : boot ? C.sync : blocked ? C.red : flat ? C.idle : "#7CF0A2";
    const audio = h_flex().items_center().mb(4)
      .child(div().w(28).flex_shrink_0().text_size(8).text_color(C.faint).child("AUD"))
      .child(v_flex().flex_1().min_w(0).overflow_hidden().gap(0)
        .children((this.wave ? this.wave.audio : [[" "], ["\u2500"], [" "]]).map((fr) =>
          div().h(9).line_height("9px").text_size(12).text_color(audioColor).whitespace_nowrap().frames(fr, 70))))
      .child(div().w(g.meterW).flex_shrink_0().pl(8).text_size(8).text_color(C.faint).child(g.meterW ? "CH-1" : ""));
    const analyzer = v_flex().w(specW).flex_shrink_0().gap(2)
      .child(audio)
      .when(flat || boot, (el) => el.loop("opacity", { from: 0.45, to: 1, period: boot ? 500 : 1800 }))
      .child(h_flex().items_start().child(axis).child(v_flex().flex_1().min_w(0).overflow_hidden().child(bars)).child(meters))
      .child(freq);
    const rate = dormant ? "0 TOK/S \u00b7 QUIET" : boot ? "SYNCING\u00b7\u00b7\u00b7" : working ? `${working}/${list.length} TASKED` : `0/${list.length} TASKED \u00b7 CARRIER`;
    const spectrum = v_flex().w(specW).flex_shrink_0().gap(4)
      .child(rule("SPECTRUM \u00b7 BAND K5", rate))
      .child(analyzer);
    const lines = Math.max(2, Math.min(12, Math.floor((H - 40) / 15)));
    const interceptOff = shared("r5.intercept") === "off";
    let interLines;
    if (dormant) {
      interLines = [div().text_color(C.ghost).frames(["-- KEEPALIVE ACK --", " "], 2500)];
    } else if (boot) {
      interLines = Array.from({ length: lines }, (_, i) =>
        div().text_color(C.sync).frames(this.sync[i], 180 + i * 23));
    } else if (interceptOff) {
      interLines = [div().text_color(C.faint).child("INTERCEPT PAUSED \u00b7 CLICK HEADER TO RESUME")];
    } else if (this.intel.length) {
      interLines = this.intel.slice(0, lines).map((e, i) => h_flex().gap(8).min_w(0)
        .child(div().flex_shrink_0().text_color(C.dim).child(e.sign))
        .child(div().truncate().text_color(i === 0 ? C.hi : e.col).child(e.text)));
    } else {
      interLines = Array.from({ length: lines }, (_, i) =>
        div().text_color(i === 0 ? C.text : C.hex).frames(this.hex[i], 520 + i * 47));
    }
    const intercept = v_flex().flex_1().min_w(0).gap(1).overflow_hidden()
      .child(div().id("r5-intercept-toggle").cursor_pointer()
        .tooltip(interceptOff ? "Resume the live intercept" : "Pause the live intercept")
        .on_click(() => setShared("r5.intercept", interceptOff ? "on" : "off"))
        .child(rule("INTERCEPT", interceptOff ? "PAUSED" : !dormant && !boot && this.intel.length ? (this.pieOn ? "LIVE" : "LIVE \u00b7 REDACTED") : "STANDBY")))
      .children(interLines.map((el) => el.whitespace_nowrap().h(15)));

    const log = readLog().slice(0, lines);
    const tf = this.treasury || (this.treasury = treasuryFrames());
    const per = 2200;
    const txLines = Math.max(1, Math.min(4, lines - 5));
    const treasury = v_flex().w(260).flex_shrink_0().gap(1).overflow_hidden()
      .child(rule("TREASURY", "SIM"))
      .children(ACCOUNTS.map(([name, acct], i) => h_flex().w_full().h(15).gap(6)
        .child(div().w(76).flex_shrink_0().text_color(C.dim).child(name))
        .child(div().flex_1().min_w(0).truncate().text_size(9).text_color(C.faint).child(acct))
        .child(div().flex_shrink_0().text_color(dormant ? C.goldDim : C.gold2).frames(tf.balances[i], per))))
      .child(h_flex().w_full().h(16).gap(6).border_t(1).border_color(C.rule)
        .child(div().flex_1().text_color(C.hi).child("TOTAL"))
        .child(div().flex_shrink_0().text_color(dormant ? C.goldDim : C.hi).frames(tf.totals, per)))
      .children(Array.from({ length: txLines }, (_, k) => div().h(15).truncate().text_size(10)
        .text_color(k === 0 ? C.text : C.hex)
        .frames(tf.txns.map((_, i) => tf.txns[(i + tf.txns.length - k) % tf.txns.length]), 3300)));
    const sitrep = v_flex().w(Math.max(240, Math.min(380, Math.floor(W * 0.26)))).flex_shrink_0().gap(1).overflow_hidden()
      .child(rule("SITREP LOG", dormant ? "STANDBY" : null))
      .children(log.map((e) => h_flex().gap(8).h(15).whitespace_nowrap()
        .child(div().text_color(C.dim).flex_shrink_0().child(e.t))
        .child(div().truncate().text_color(LOG_COLOR[e.c] || C.text).child(e.m))));

    // Room left for the intercept column; the signal mix takes MIX_W of it when there's enough.
    const sitW = Math.max(240, Math.min(380, Math.floor(W * 0.26)));
    const room = W - 24 - specW - sitW - 32;               // intercept column before the treasury
    const showMix = room >= MIX_W + 14 + 120;               // the signal mix wins over the treasury
    const showTreasury = W > 1150 && room - 276 >= (showMix ? MIX_W + 14 + 120 : 180);
    if (showMix !== this.pieOn) this.pieOn = showMix;
    return this.root(h_flex()).size_full().items_start().bg(C.panel).font_family(MONO).text_size(11).text_color(C.text)
      .px(12).py(10).gap(16).overflow_hidden()
      .child(spectrum)
      .when(W > 640, (el) => el.child(showMix ? h_flex().flex_1().min_w(0).gap(14).items_start().child(intercept).child(this.renderMix(st, list, dormant, boot, H)) : intercept))
      .when(showTreasury, (el) => el.child(treasury))
      .child(sitrep);
  }
}
