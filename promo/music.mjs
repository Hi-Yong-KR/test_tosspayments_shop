// 150 BPM 배경음과 효과음(29.5초)을 직접 합성해 assets/music.wav 로 저장한다. 외부 음원을 쓰지 않아 저작권 문제가 없다.
// 이벤트 시각은 promo.html 의 씬 시간표와 맞춘다.
import { writeFileSync } from "node:fs";

const SR = 48000, DUR = 29.5, N = Math.floor(SR * DUR);
const BEAT = 0.4, BAR = BEAT * 4;
const bus = () => [new Float32Array(N), new Float32Array(N)];
const drums = bus(), music = bus(), send = bus(), sfx = bus();
const put = (b, i, l, r = l) => { if (i >= 0 && i < N) { b[0][i] += l; b[1][i] += r; } };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const kicks = [];

// ---------- 악기 ----------
function kick(t, g = 1) {
  kicks.push(t);
  const s = Math.floor(t * SR);
  let ph = 0;
  for (let n = 0; n < SR * 0.5; n++) {
    const x = n / SR;
    ph += (2 * Math.PI * (48 + 140 * Math.exp(-x * 30))) / SR;
    const click = x < 0.004 ? rnd() * 0.3 * (1 - x / 0.004) : 0;
    put(drums, s + n, (Math.sin(ph) * Math.exp(-x * 6.5) + click) * 0.95 * g);
  }
}
function hat(t, g = 1, open = false) {
  const s = Math.floor(t * SR), len = open ? 0.25 : 0.06;
  let p1 = 0, p2 = 0;
  for (let n = 0; n < SR * len; n++) {
    const w = rnd(); const hp = w - 2 * p1 + p2; p2 = p1; p1 = w;
    const e = Math.exp((-n / SR) * (open ? 14 : 75)) * 0.055 * g;
    put(drums, s + n, hp * e * 0.85, hp * e * 1.15);
  }
}
function clap(t, g = 1) {
  const s = Math.floor(t * SR);
  let lp = 0;
  for (let n = 0; n < SR * 0.3; n++) {
    const x = n / SR;
    lp += (rnd() - lp) * 0.4;
    const burst = [0, 0.011, 0.022].reduce((a, d) => a + (x >= d ? Math.exp(-(x - d) * 160) : 0), 0);
    const e = (burst * 0.5 + Math.exp(-x * 18)) * 0.24 * g;
    const v = (rnd() - lp) * e;
    put(drums, s + n, v); put(send, s + n, v * 0.6);
  }
}
function crash(t, g = 1) {
  const s = Math.floor(t * SR);
  let p = 0;
  for (let n = 0; n < SR * 2.2; n++) {
    const w = rnd(), hp = w - p; p = w;
    const e = Math.exp((-n / SR) * 2.2) * 0.09 * g;
    put(drums, s + n, hp * e * 0.8, hp * e * 1.2); put(send, s + n, hp * e * 0.5);
  }
}
function tone(b, t, dur, m, g, shape = "saw", cutoff = 0.08, pan = 0, sendAmt = 0, rel = 0.05) {
  const s = Math.floor(t * SR), f = hz(m);
  let lp = 0, lp2 = 0;
  for (let n = 0; n < SR * (dur + rel); n++) {
    const x = n / SR, ph = (x * f) % 1;
    const v = shape === "saw" ? ph * 2 - 1 : shape === "sq" ? (ph < 0.5 ? 1 : -1) : Math.sin(2 * Math.PI * ph);
    lp += (v - lp) * cutoff; lp2 += (lp - lp2) * cutoff;
    const env = Math.min(1, x / 0.006) * (x < dur ? 1 : Math.max(0, 1 - (x - dur) / rel));
    const o = lp2 * env * g;
    put(b, s + n, o * (1 - pan), o * (1 + pan));
    if (sendAmt) put(send, s + n, o * sendAmt);
  }
}
// 피아노 비슷한 플럭(배음 3개 + 감쇠)
function pluck(t, m, g, sendAmt = 0.6) {
  const s = Math.floor(t * SR), f = hz(m);
  for (let n = 0; n < SR * 2.5; n++) {
    const x = n / SR;
    const v = Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 2.2) + 0.35 * Math.sin(4 * Math.PI * f * x) * Math.exp(-x * 4) + 0.12 * Math.sin(6 * Math.PI * f * x) * Math.exp(-x * 7);
    const o = v * Math.min(1, x / 0.003) * g;
    put(music, s + n, o * 0.9, o * 1.1); put(send, s + n, o * sendAmt);
  }
}
function pad(t, dur, notes, g, bright = 0.02) {
  for (const m of notes) for (const d of [-0.1, 0, 0.1]) {
    const s = Math.floor(t * SR), f = hz(m + d);
    let lp = 0;
    for (let n = 0; n < SR * dur; n++) {
      const x = n / SR;
      lp += (((x * f) % 1) * 2 - 1 - lp) * bright;
      const env = Math.min(1, x / 0.5) * Math.min(1, (dur - x) / 0.5);
      const o = lp * env * g, pan = d * 4;
      put(music, s + n, o * (1 - pan), o * (1 + pan)); put(send, s + n, o * 0.4);
    }
  }
}
function sub(t, dur, m, g) {
  const s = Math.floor(t * SR), f = hz(m);
  for (let n = 0; n < SR * dur; n++) {
    const x = n / SR;
    put(music, s + n, Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 1.2) * Math.min(1, x / 0.01) * g);
  }
}
// 노이즈 상승음
function riser(t0, t1, g) {
  const s = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  let lp = 0, ph = 0;
  for (let n = 0; n < len; n++) {
    const p = n / len;
    lp += (rnd() - lp) * (0.01 + p * 0.45);
    ph += (2 * Math.PI * (200 + p * p * 1800)) / SR;
    const o = (lp * 0.8 + Math.sin(ph) * 0.08) * p * p * g;
    put(sfx, s + n, o * (1 - p * 0.5), o * (1 + p * 0.5)); put(send, s + n, o * 0.5);
  }
}
// 휙 지나가는 소리
function whoosh(t, dur, g, dir = 1) {
  const s = Math.floor(t * SR), len = Math.floor(dur * SR);
  let lp = 0, bp = 0;
  for (let n = 0; n < len; n++) {
    const p = n / len;
    const cut = 0.02 + Math.sin(Math.PI * p) * 0.35;
    lp += (rnd() - lp) * cut; bp += (lp - bp) * cut;
    const e = Math.sin(Math.PI * p) ** 2 * g;
    const pan = dir * (p * 2 - 1) * 0.8;
    put(sfx, s + n, (lp - bp) * e * (1 - pan) * 2.2, (lp - bp) * e * (1 + pan) * 2.2);
    put(send, s + n, (lp - bp) * e * 0.8);
  }
}
// 마우스 클릭
function click(t, g = 1) {
  const s = Math.floor(t * SR);
  for (let n = 0; n < SR * 0.03; n++) {
    const x = n / SR;
    const o = (Math.sin(2 * Math.PI * 3200 * x) * 0.5 + rnd() * 0.5) * Math.exp(-x * 400) * 0.35 * g;
    put(sfx, s + n, o);
  }
  tone(sfx, t + 0.012, 0.02, 100, 0.05, "sin", 0.5, 0, 0, 0.02);
}
// 화면 탭(부드러운 톡)
function tapSnd(t, g = 1) {
  const s = Math.floor(t * SR);
  let ph = 0;
  for (let n = 0; n < SR * 0.08; n++) {
    const x = n / SR;
    ph += (2 * Math.PI * (900 - x * 5000)) / SR;
    put(sfx, s + n, Math.sin(ph) * Math.exp(-x * 60) * 0.3 * g);
  }
}
// 결제 완료 차임
function chime(t) {
  [[88, 0], [93, 0.11], [100, 0.22]].forEach(([m, d]) => {
    const s = Math.floor((t + d) * SR), f = hz(m);
    for (let n = 0; n < SR * 2; n++) {
      const x = n / SR;
      const v = (Math.sin(2 * Math.PI * f * x) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * x) * Math.exp(-x * 6)) * Math.exp(-x * 2.6) * 0.16;
      put(sfx, s + n, v * 0.9, v * 1.1); put(send, s + n, v * 0.9);
    }
  });
}

// ---------- 편곡 ----------
const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const BASS = [33, 29, 36, 31];

// A 0~3.6: 공간감 패드 + 문장에 맞춘 플럭
pad(0, 3.9, [57, 64, 69, 72], 0.022, 0.012);
sub(0, 3.6, 33, 0.18);
pluck(0.35, 76, 0.13); pluck(0.8, 72, 0.08); pluck(1.45, 79, 0.13); pluck(1.9, 76, 0.08); pluck(2.4, 74, 0.07);
riser(2.0, 3.6, 0.32);
whoosh(3.15, 0.5, 0.5, 1);

// B 3.6~5.2: 히트 + 하프타임
kick(3.6, 1.15); clap(3.6, 0.9); crash(3.6, 0.8); sub(3.6, 1.2, 33, 0.35);
pad(3.6, 1.7, CH[1].map((m) => m + 12), 0.03);
hat(4.0, 0.8); hat(4.4, 0.8); kick(4.4, 0.7); hat(4.8, 0.9);
pluck(4.35, 88, 0.1, 0.4); // 빨간 점 등장
riser(4.4, 5.2, 0.28);
whoosh(4.85, 0.4, 0.55, -1);

// 메인 그루브 5.2~25.2
for (let t = 5.2, bar = 0; t < 25.2 - 1e-6; t += BAR, bar++) {
  const c = bar % 4;
  const breakdown = t >= 16.4 - 1e-6 && t < 17.2; // 모바일 결제 진입 시 숨 고르기
  pad(t, BAR + 0.05, CH[c].map((m) => m + 12), 0.026, breakdown ? 0.008 : 0.02);
  for (let b = 0; b < 4; b++) {
    const bt = t + b * BEAT;
    if (bt >= 25.2 - 1e-6) break;
    if (!breakdown || b >= 2) kick(bt);
    if (b % 2 === 1) clap(bt, breakdown ? 0.5 : 0.85);
    hat(bt + BEAT / 2, 1);
    hat(bt + BEAT / 4, 0.35); hat(bt + (3 * BEAT) / 4, 0.35);
    if (!breakdown) for (let e = 0; e < 2; e++) tone(music, bt + (e * BEAT) / 2, BEAT / 2 - 0.03, BASS[c] + (e ? 12 : 0), 0.24, "saw", 0.035);
    const arp = CH[c][(b * 2) % 3] + 24, arp2 = CH[c][(b * 2 + 1) % 3] + 24;
    tone(music, bt, 0.1, arp, 0.03, "sq", 0.12, -0.45, 0.5);
    tone(music, bt + BEAT / 2, 0.1, arp2, 0.03, "sq", 0.12, 0.45, 0.5);
  }
  if (bar % 2 === 1) hat(t + BAR - BEAT / 2, 0.8, true);
}
crash(5.2, 1); sub(5.2, 1.4, 33, 0.3);
crash(9.2, 0.7);
whoosh(11.25, 0.45, 0.5, 1); crash(11.6, 0.6);
// 데스크톱 클릭
click(13.2); click(14.0); click(14.8, 1.2);
riser(15.0, 16.4, 0.38); whoosh(15.9, 0.55, 0.6, 1);
// 모바일 탭과 결제 완료
crash(16.4, 0.6);
tapSnd(18.3); tapSnd(19.2);
chime(19.5);
whoosh(20.85, 0.4, 0.55, -1);
// 혜택 패널 전환
[21.2, 22.4, 23.6].forEach((t, i) => { crash(t, 0.55); whoosh(t - 0.12, 0.35, 0.5, i % 2 ? -1 : 1); });
riser(24.0, 25.2, 0.4);

// H 25.2~: 로고
kick(25.2, 1.3); clap(25.2, 0.9); crash(25.2, 1.1); sub(25.2, 3.5, 33, 0.45);
pad(25.2, 4.3, [45, 57, 64, 69, 72, 76], 0.024, 0.015);
pluck(25.2, 81, 0.12, 1); pluck(26.4, 76, 0.07, 1); pluck(26.45, 84, 0.06, 1);

// ---------- 믹스 ----------
// 사이드체인: 킥마다 음악 버스를 눌렀다 놓는다
const duck = new Float32Array(N).fill(1);
for (const kt of kicks) {
  const s = Math.floor(kt * SR);
  for (let n = 0; n < SR * 0.3 && s + n < N; n++) duck[s + n] = Math.min(duck[s + n], 1 - 0.55 * Math.exp(-(n / SR) * 12));
}
// 간단한 Schroeder 리버브
function reverb(inp) {
  const out = bus();
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => Math.floor(d * SR / 44100));
  for (let ch = 0; ch < 2; ch++) {
    const x = inp[ch], y = out[ch];
    for (const [ci, d0] of combs.entries()) {
      const d = d0 + ch * 23, buf = new Float32Array(d);
      let idx = 0, lp = 0;
      for (let n = 0; n < N; n++) {
        const o = buf[idx];
        lp = o * 0.7 + lp * 0.3;
        buf[idx] = x[n] + lp * 0.84;
        idx = (idx + 1) % d;
        y[n] += o / combs.length;
      }
    }
    for (const d0 of [556, 441, 341]) {
      const d = Math.floor(d0 * SR / 44100) + ch * 7, buf = new Float32Array(d);
      let idx = 0;
      for (let n = 0; n < N; n++) {
        const b = buf[idx], v = y[n];
        const o = -v + b;
        buf[idx] = v + b * 0.5;
        idx = (idx + 1) % d;
        y[n] = o;
      }
    }
  }
  return out;
}
const rev = reverb(send);

const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
let peak = 0;
const mixed = [new Float32Array(N), new Float32Array(N)];
for (let ch = 0; ch < 2; ch++) for (let n = 0; n < N; n++) {
  mixed[ch][n] = drums[ch][n] * 0.9 + music[ch][n] * duck[n] + sfx[ch][n] + rev[ch][n] * 0.28;
  peak = Math.max(peak, Math.abs(mixed[ch][n]));
}
const pre = 1.15 / Math.max(peak, 1e-6) * 1.3; // 약간 밀어서 tanh로 눌러 음압을 확보
for (let n = 0; n < N; n++) {
  const x = n / SR;
  const g = Math.min(1, x / 0.05) * Math.min(1, (DUR - x) / 1.2);
  for (let ch = 0; ch < 2; ch++) {
    const v = Math.tanh(mixed[ch][n] * pre) / Math.tanh(1.5) * 0.93 * g;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + n * 4 + ch * 2);
  }
}
writeFileSync(new URL("./assets/music.wav", import.meta.url), buf);
console.log("assets/music.wav", DUR + "s");
