// Gera um "podcast" sintetico de 2 pessoas e confere as decisoes de camera.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const A = require(path.join(__dirname, '..', 'AutoCut', 'js', 'analysis.js'));

const SR = 16000, DUR = 42;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pctest-'));

// fala: ruido modulado em ~4 Hz (silabas)
function speech(t, seed) {
  const syl = 0.5 + 0.5 * Math.sin(2 * Math.PI * (3.7 + seed) * t);
  return (Math.random() * 2 - 1) * syl;
}
const talkA = [[1, 9], [16, 24], [27, 36]];
const talkB = [[9.3, 16], [20, 24], [24.5, 25.3], [36.2, 41]];
const on = (ranges, t) => ranges.some(([s, e]) => t >= s && t < e);

function writeWav(file, channels) {
  const n = channels[0].length, ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(channels[c][i] * 32767))), 44 + (i * ch + c) * 2);
  }
  fs.writeFileSync(file, buf);
}

const N = SR * DUR;
const micA = new Float32Array(N), micB = new Float32Array(N);
const bleed = Math.pow(10, -14 / 20);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const a = on(talkA, t) ? 0.3 * speech(t, 0) : 0;
  const b = on(talkB, t) ? 0.15 * speech(t, 0.6) : 0; // B grava mais baixo de proposito
  const noise = () => (Math.random() * 2 - 1) * 0.001;
  micA[i] = a + b * bleed + noise();
  micB[i] = b + a * bleed + noise();
}
writeWav(path.join(dir, 'a.wav'), [micA]);
writeWav(path.join(dir, 'b.wav'), [micB]);
writeWav(path.join(dir, 'stereo.wav'), [micA, micB]);

const opts = { hop: 0.05, smooth: 0.3, thrFrac: 0.4, overlapDb: 6, wide: true, overlapMin: 1.5,
  minShot: 2.5, preRoll: 0.25, maxShot: 0, wideLen: 3 };

function show(title, res) {
  console.log('\n' + title);
  for (const s of res.segments) {
    const who = s.label === A.WIDE ? 'ABERTO' : 'Pessoa ' + 'AB'[s.label];
    console.log(`  ${s.start.toFixed(2).padStart(6)} - ${s.end.toFixed(2).padStart(6)}  ${who}`);
  }
}

function check(res, expected) {
  // expected: [[tempo, label]] - confere a camera no meio de cada trecho
  let ok = true;
  for (const [t, label] of expected) {
    const sg = res.segments.find((s) => t >= s.start && t < s.end);
    const got = sg ? sg.label : null;
    if (got !== label) { ok = false; console.log(`  FALHOU em t=${t}: esperado ${label}, veio ${got}`); }
  }
  return ok;
}

(async () => {
  const ff = A.findFfmpeg();
  const exp = [[5, 0], [12, 1], [18, 0], [22, A.WIDE], [31, 0], [39, 1]];
  let allOk = true;

  // 1) um arquivo por microfone, comecando em 0
  const envs = await A.buildEnvelopes(ff, [
    { clips: [{ path: path.join(dir, 'a.wav'), inPoint: 0, start: 0, end: DUR }], channel: 'mix' },
    { clips: [{ path: path.join(dir, 'b.wav'), inPoint: 0, start: 0, end: DUR }], channel: 'mix' }
  ], DUR, 0.05);
  const r1 = A.decide(envs, opts);
  show('Teste 1 - mics separados', r1);
  allOk = check(r1, exp) && allOk;

  // 2) arquivo estereo (mic A na esquerda, B na direita)
  const envs2 = await A.buildEnvelopes(ff, [
    { clips: [{ path: path.join(dir, 'stereo.wav'), inPoint: 0, start: 0, end: DUR }], channel: 'L' },
    { clips: [{ path: path.join(dir, 'stereo.wav'), inPoint: 0, start: 0, end: DUR }], channel: 'R' }
  ], DUR, 0.05);
  const r2 = A.decide(envs2, opts);
  show('Teste 2 - estereo L/R', r2);
  allOk = check(r2, exp) && allOk;

  // 3) clipe com inPoint e posicao deslocada na timeline (audio comeca 2s depois na seq, cortado 1s no inicio)
  const envs3 = await A.buildEnvelopes(ff, [
    { clips: [{ path: path.join(dir, 'a.wav'), inPoint: 1, start: 2, end: DUR + 1 }], channel: 'mix' },
    { clips: [{ path: path.join(dir, 'b.wav'), inPoint: 1, start: 2, end: DUR + 1 }], channel: 'mix' }
  ], DUR + 1, 0.05);
  const r3 = A.decide(envs3, opts);
  show('Teste 3 - deslocado +1s', r3);
  allOk = check(r3, exp.map(([t, l]) => [t + 1, l])) && allOk;

  // 4) sem camera aberta + plano aberto em close longo
  const r4 = A.decide(envs, Object.assign({}, opts, { wide: false }));
  show('Teste 4 - sem camera aberta', r4);
  allOk = !r4.segments.some((s) => s.label === A.WIDE) && allOk;
  const r5 = A.decide(envs, Object.assign({}, opts, { maxShot: 7, wideLen: 2 }));
  show('Teste 5 - plano aberto a cada 7s de close', r5);
  allOk = r5.segments.filter((s) => s.label === A.WIDE).length >= 3 && allOk;

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(allOk ? '\nTODOS OS TESTES PASSARAM' : '\nALGUM TESTE FALHOU');
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
