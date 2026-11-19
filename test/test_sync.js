// Modo "um mic so": quem escuta mexe a boca TANTO quanto quem fala (risada muda, mastigando,
// sorrindo, "falando junto" sem som), mas fora do ritmo da voz. So a sincronia boca-voz resolve.
// Tambem testa a tabela de tempo maximo por camera.
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'AutoCut', 'js', 'analysis.js'));

const HOP = 0.05, DUR = 60, FPS = 10, N = Math.ceil(DUR / HOP) + 1, M = Math.ceil(DUR * FPS) + 1;
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const on = (r, t) => r.some(([s, e]) => t >= s && t < e);

const H = [[0, 6], [20.2, 23], [26.8, 30], [45.3, 52]];
const G = [[6.3, 20], [23.3, 26.5], [29.6, 34], [35.2, 39], [40.2, 45], [52.3, 60]];
// apresentador mexendo a boca sem som enquanto o convidado fala
const Hsilent = [[7, 10], [12, 15.5], [31, 33.5], [41, 44], [54, 58]];

// silabas: ritmo irregular e diferente para cada pessoa (como fala de verdade)
function syllables(seedOff) {
  const out = new Float32Array(M);
  let ph = 0;
  for (let i = 0; i < M; i++) {
    ph += 2 * Math.PI * (3 + 2 * Math.abs(Math.sin(0.37 * i / FPS + seedOff))) / FPS;
    out[i] = 0.5 + 0.5 * Math.sin(ph);
  }
  return out;
}
const sylH = syllables(0), sylG = syllables(2.1), sylFake = syllables(4.7);
const at = (arr, t) => arr[Math.min(M - 1, Math.round(t * FPS))];

const audio = new Float32Array(N);
for (let f = 0; f < N; f++) {
  const t = f * HOP;
  let p = 1e-6;
  if (on(H, t)) p += Math.pow(10, (-24 + 14 * at(sylH, t)) / 10);
  if (on(G, t)) p += Math.pow(10, (-28 + 14 * at(sylG, t)) / 10);
  audio[f] = 10 * Math.log10(p) + (rnd() - 0.5);
}

function cam(talk, syl, silentRanges) {
  const open = new Float32Array(M), jaw = new Float32Array(M), chin = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const t = i / FPS;
    let m = 0;
    if (on(talk, t)) m = at(syl, t);                       // fala: boca no ritmo da voz
    else if (silentRanges && on(silentRanges, t)) m = at(sylFake, t); // mexe igual, mas sem som
    open[i] = 0.08 + 0.3 * m + 0.01 * rnd();
    jaw[i] = 0.05 + 0.4 * m + 0.01 * rnd();
    chin[i] = 1.4 + 0.08 * m + 0.003 * rnd();
  }
  return { open, jaw, chin };
}
const mouths = [cam(H, sylH, Hsilent), cam(G, sylG, null)];

const truth = [];
for (const [s, e] of H) truth.push([s + 0.5, e - 0.3, 0]);
truth.push([6.8, 19.7, 1], [23.8, 26.2, 1], [30.5, 44.7, 1], [52.8, 59.7, 1]);
function score(res) {
  let ok = 0, tot = 0;
  for (const [s, e, who] of truth) for (let t = s; t < e; t += HOP) {
    tot++;
    const sg = res.segments.find((x) => t >= x.start && t < x.end);
    if (sg && sg.label === who) ok++;
  }
  return ok / tot;
}

const base = { hop: HOP, smooth: 0.3, thrFrac: 0.4, overlapDb: 6, wide: false, overlapMin: 1.5,
  minShot: 2.5, preRoll: 0.25, maxShot: 0, wideLen: 3, switchSec: 0.4,
  mouthFps: FPS, mouthWin: 0.6, mouthMin: 0.35, mouthOverlap: 0.6, syncWeight: 0.7 };

function show(title, res) {
  const pct = score(res);
  console.log(`\n${title}: camera certa ${(pct * 100).toFixed(1)}%`);
  console.log('  ' + res.segments.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)} ${s.label === A.WIDE ? 'ABERTO' : 'HG'[s.label]}`).join(' | '));
  return pct;
}

let ok = true;
const noSync = show('Sem sincronia (so movimento)', A.decideMouth(audio, mouths, Object.assign({}, base, { syncWeight: 0 })));
const withSync = show('Com sincronia boca-voz', A.decideMouth(audio, mouths, base));
{ const _c = withSync >= 0.95; if (!_c) console.log("  >> falhou: withSync >= 0.95"); ok = _c && ok; }

// ---- tabela de tempo maximo no ar ----
const longTalk = A.decideMouth(audio, mouths, Object.assign({}, base, {
  wide: true,
  maxOnAir: { 0: { max: 0 }, 1: { max: 6, to: 'wide', len: 2 }, wide: { max: 0 } }
}));
const gShots = longTalk.segments.filter((s) => s.label === 1);
const wides = longTalk.segments.filter((s) => s.label === A.WIDE);
console.log('\nConvidado no maximo 6 s, depois 2 s de aberto:');
console.log('  ' + longTalk.segments.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)} ${s.label === A.WIDE ? 'ABERTO' : 'HG'[s.label]}`).join(' | '));
const maxG = Math.max(...gShots.map((s) => s.end - s.start));
console.log(`  maior plano do convidado: ${maxG.toFixed(1)} s · planos abertos inseridos: ${wides.length}`);
{ const _c = maxG <= 6.05 && wides.length >= 3; if (!_c) console.log("  >> falhou: maxG <= 6.05 && wides.length >= 3"); ok = _c && ok; }

const toOther = A.decideMouth(audio, mouths, Object.assign({}, base, {
  maxOnAir: { 0: { max: 0 }, 1: { max: 6, to: 0, len: 1.5 } }
}));
const reac = toOther.segments.filter((s, i) => s.label === 0 && Math.abs(s.end - s.start - 1.5) < 0.06);
const maxG2 = Math.max(...toOther.segments.filter((s) => s.label === 1).map((s) => s.end - s.start));
console.log('\nConvidado no maximo 6 s, depois 1,5 s de reacao do apresentador:');
console.log('  ' + toOther.segments.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)} ${'HG'[s.label]}`).join(' | '));
console.log(`  reacoes de 1,5 s inseridas: ${reac.length} · maior plano do convidado: ${maxG2.toFixed(1)} s`);
{ const _c = reac.length >= 4 && maxG2 <= 6.05; if (!_c) console.log('  >> falhou: reacoes'); ok = _c && ok; }

const wideCap = A.decideMouth(audio, mouths, Object.assign({}, base, {
  wide: true, maxOnAir: { 1: { max: 6, to: 'wide', len: 4 }, wide: { max: 2, to: 'auto' } }
}));
const wsegs = wideCap.segments.filter((s) => s.label === A.WIDE);
const maxW = Math.max(0, ...wsegs.map((s) => s.end - s.start));
console.log(`\nRespiro pedido de 4 s, mas aberto no maximo 2 s: ${wsegs.length} abertos, maior ${maxW.toFixed(1)} s`);
{ const _c = wsegs.length >= 3 && maxW <= 2.05; if (!_c) console.log("  >> falhou: wsegs.length >= 3 && maxW <= 2.05"); ok = _c && ok; }

// plano aberto longo (fala simultanea) volta para quem fala depois do maximo
const runsW = [{ s: 0, e: 400, label: A.WIDE }];
const sW = [new Float32Array(400).fill(0.2), new Float32Array(400).fill(0.8)];
const capped = A.applyMaxOnAir(runsW, sW, { hop: HOP, wide: true, maxOnAir: { wide: { max: 3, to: 'auto' } } }, 50);
console.log('Aberto de 20 s com maximo 3 s: ' + capped.map((r) => `${(r.s * HOP).toFixed(1)}-${(r.e * HOP).toFixed(1)} ${r.label === A.WIDE ? 'ABERTO' : 'HG'[r.label]}`).join(' | '));
{ const _c = capped.length === 2 && capped[0].label === A.WIDE && capped[0].e === 60 && capped[1].label === 1; if (!_c) console.log("  >> falhou: capped.length === 2 && capped[0].label === A.WIDE && capped[0].e === 60 && capped[1].label === 1"); ok = _c && ok; }

console.log(ok ? '\nTODOS OS TESTES PASSARAM' : '\nALGUM TESTE FALHOU');
process.exit(ok ? 0 : 1);
