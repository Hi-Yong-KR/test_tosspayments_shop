// 150 BPM 배경음(29초)을 직접 합성해 assets/music.wav 로 저장한다. 외부 음원 저작권 문제 없음.
import { writeFileSync } from "node:fs";

const SR = 44100, DUR = 29, N = SR * DUR;
const BEAT = 0.4, BAR = BEAT * 4;
const L = new Float32Array(N), R = new Float32Array(N);
const add = (i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

function kick(t, g = 1) {
  const s = Math.floor(t * SR);
  let ph = 0;
  for (let n = 0; n < SR * 0.45; n++) {
    const x = n / SR;
    ph += (2 * Math.PI * (45 + 110 * Math.exp(-x * 28))) / SR;
    add(s + n, Math.sin(ph) * Math.exp(-x * 7) * 0.9 * g);
  }
}
function hat(t, g = 1, len = 0.05) {
  const s = Math.floor(t * SR);
  let prev = 0;
  for (let n = 0; n < SR * len; n++) {
    const w = rnd(), hp = w - prev; prev = w;
    const e = Math.exp((-n / SR) * 70) * 0.13 * g;
    add(s + n, hp * e * 0.9, hp * e * 1.1);
  }
}
function clap(t, g = 1) {
  const s = Math.floor(t * SR);
  let lp = 0;
  for (let n = 0; n < SR * 0.25; n++) {
    const x = n / SR;
    lp += (rnd() - lp) * 0.35;
    const e = (Math.exp(-x * 22) + (x < 0.02 ? 0.6 : 0)) * 0.28 * g;
    add(s + n, (rnd() - lp) * e);
  }
}
function tone(t, dur, m, g, shape = "saw", cutoff = 0.08, pan = 0) {
  const s = Math.floor(t * SR), f = hz(m);
  let lp = 0;
  for (let n = 0; n < SR * dur; n++) {
    const x = n / SR;
    const ph = (x * f) % 1;
    let v = shape === "saw" ? ph * 2 - 1 : shape === "sq" ? (ph < 0.5 ? 1 : -1) : Math.sin(2 * Math.PI * ph);
    lp += (v - lp) * cutoff;
    const env = Math.min(1, x / 0.01) * Math.min(1, (dur - x) / 0.05);
    add(s + n, lp * env * g * (1 - pan), lp * env * g * (1 + pan));
  }
}
function pad(t, dur, notes, g) {
  for (const m of notes) for (const d of [-0.08, 0.08]) {
    const s = Math.floor(t * SR), f = hz(m + d);
    let lp = 0;
    for (let n = 0; n < SR * dur; n++) {
      const x = n / SR;
      lp += (((x * f) % 1) * 2 - 1 - lp) * 0.02;
      const env = Math.min(1, x / 0.6) * Math.min(1, (dur - x) / 0.6);
      add(s + n, lp * env * g * (d < 0 ? 1.2 : 0.8), lp * env * g * (d < 0 ? 0.8 : 1.2));
    }
  }
}
function riser(t0, t1, g) {
  const s = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  let lp = 0;
  for (let n = 0; n < len; n++) {
    const p = n / len;
    lp += (rnd() - lp) * (0.02 + p * 0.5);
    add(s + n, lp * p * p * g);
  }
}

// Am - F - C - G
const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const BASS = [33, 29, 36, 31];

// 0~3.2 인트로: 패드 + 잔잔한 펄스
pad(0, 3.4, CH[0].map((m) => m + 12), 0.05);
for (let b = 0; b < 8; b++) tone(b * BEAT, 0.12, 69 + (b % 2 ? 7 : 0), 0.05, "sin");
riser(1.6, 3.2, 0.25);

// 3.2 히트, 3.2~5.6 하프타임
kick(3.2, 1.1); clap(3.2, 0.8);
pad(3.2, 2.6, CH[1].map((m) => m + 12), 0.05);
for (let b = 0; b < 6; b++) { hat(3.2 + b * BEAT + BEAT / 2, 0.7); if (b % 2 === 0) kick(3.2 + b * BEAT, 0.8); }
riser(4.4, 5.6, 0.3);

// 5.6~25.2 메인 그루브
for (let t = 5.6, bar = 0; t < 25.2 - 1e-6; t += BAR, bar++) {
  const c = bar % 4;
  const breakdown = t >= 16.4 && t < 17.9; // 결제 흐름 진입 시 잠깐 숨 고르기
  pad(t, BAR, CH[c].map((m) => m + 12), 0.035);
  for (let b = 0; b < 4; b++) {
    const bt = t + b * BEAT;
    if (bt >= 25.2) break;
    if (!breakdown) kick(bt);
    if (b % 2 === 1) clap(bt, breakdown ? 0.5 : 0.9);
    hat(bt + BEAT / 2, 1);
    hat(bt + BEAT / 4, 0.4); hat(bt + (3 * BEAT) / 4, 0.4);
    for (let e = 0; e < 2; e++) tone(bt + (e * BEAT) / 2, BEAT / 2 - 0.02, BASS[c] + (e ? 12 : 0), 0.22, "saw", 0.04);
    // 아르페지오
    const arp = CH[c][(b * 2) % 3] + 24, arp2 = CH[c][(b * 2 + 1) % 3] + 24;
    tone(bt, 0.12, arp, 0.035, "sq", 0.15, -0.4);
    tone(bt + BEAT / 2, 0.12, arp2, 0.035, "sq", 0.15, 0.4);
  }
}
riser(15.2, 16.4, 0.3);
riser(24.0, 25.2, 0.35);

// 25.2 로고: 마지막 히트 + 긴 패드
kick(25.2, 1.2); clap(25.2, 0.9);
pad(25.2, 3.8, [57, 64, 69, 72], 0.06);
tone(25.2, 3.0, 33, 0.25, "sin");

// 마스터: 소프트 클리핑 + 끝 페이드
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  const x = n / SR;
  const g = Math.min(1, x / 0.3) * Math.min(1, (DUR - x) / 1.0);
  buf.writeInt16LE(Math.round(Math.tanh(L[n] * 0.9) * g * 32000), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.tanh(R[n] * 0.9) * g * 32000), 46 + n * 4);
}
writeFileSync(new URL("./assets/music.wav", import.meta.url), buf);
console.log("assets/music.wav", DUR + "s");
