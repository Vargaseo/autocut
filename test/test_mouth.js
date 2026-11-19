// Testa o modo "audio unico": audio misturado + abertura da boca simulada por camera.
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'AutoCut', 'js', 'analysis.js'));

const HOP = 0.05, FPS = 10, DUR = 42;
const talkA = [[1, 9], [16, 24], [27, 36]];
const talkB = [[9.3, 16], [20, 24], [24.5, 25.3], [36.2, 41]];
const on = (r, t) => r.some(([s, e]) => t >= s && t < e);

// audio unico: alto se qualquer um fala
const N = Math.ceil(DUR / HOP) + 1;
const audio = new Float32Array(N);
for (let f = 0; f < N; f++) {
  const t = f * HOP;
  // o volume segue o ritmo das silabas de quem fala (como numa gravacao real)
  let p = Math.pow(10, (-62 + Math.random() * 3) / 10);
  if (on(talkA, t)) p += Math.pow(10, (-26 + 12 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3.3 * t))) / 10);
  if (on(talkB, t)) p += Math.pow(10, (-26 + 12 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3.3 * t + 1.3))) / 10);
  audio[f] = 10 * Math.log10(p);
}

// boca: falando = abre e fecha (~4 Hz); calado = quase parado, com pequenas variacoes (sorriso, respiracao)
function mouth(talk, phase, noFace) {
  const M = Math.ceil(DUR * FPS) + 1;
  const arr = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const t = i / FPS;
    if (noFace && on(noFace, t)) { arr[i] = NaN; continue; }
    arr[i] = on(talk, t)
      ? 0.25 + 0.2 * Math.sin(2 * Math.PI * 3.3 * t + phase) + 0.05 * Math.random()
      : 0.06 + 0.015 * Math.random();
  }
  return arr;
}
// camera B perde o rosto entre 12 e 13 s (pessoa virou a cabeca)
const mouths = [mouth(talkA, 0), mouth(talkB, 1.3, [[12, 13]])];

const opts = { hop: HOP, smooth: 0.3, thrFrac: 0.4, overlapDb: 6, wide: true, overlapMin: 1.5,
  minShot: 2.5, preRoll: 0.25, maxShot: 0, wideLen: 3,
  mouthFps: FPS, mouthWin: 0.6, mouthMin: 0.35, mouthOverlap: 0.6 };

function show(title, res) {
  console.log('\n' + title);
  for (const s of res.segments) {
    console.log(`  ${s.start.toFixed(2).padStart(6)} - ${s.end.toFixed(2).padStart(6)}  ${s.label === A.WIDE ? 'ABERTO' : 'Pessoa ' + 'AB'[s.label]}`);
  }
}
function check(res, expected) {
  let ok = true;
  for (const [t, label] of expected) {
    const sg = res.segments.find((s) => t >= s.start && t < s.end);
    if (!sg || sg.label !== label) { ok = false; console.log(`  FALHOU em t=${t}: esperado ${label}, veio ${sg && sg.label}`); }
  }
  return ok;
}

let all = true;
const r1 = A.decideMouth(audio, mouths, opts);
show('Teste 1 - audio unico + boca', r1);
all = check(r1, [[5, 0], [12, 1], [12.5, 1], [18, 0], [22, A.WIDE], [31, 0], [39, 1]]) && all;

const r2 = A.decideMouth(audio, mouths, Object.assign({}, opts, { wide: false }));
show('Teste 2 - sem camera aberta', r2);
all = check(r2, [[5, 0], [12, 1], [18, 0], [31, 0], [39, 1]]) && !r2.segments.some((s) => s.label === A.WIDE) && all;

console.log(all ? '\nTODOS OS TESTES PASSARAM' : '\nALGUM TESTE FALHOU');
process.exit(all ? 0 : 1);
