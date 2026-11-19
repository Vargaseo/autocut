// Cenario dificil: convidado falando e a camera presa no apresentador.
// Mede a % do tempo em que a camera certa esta no ar, nos dois modos.
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'AutoCut', 'js', 'analysis.js'));

const HOP = 0.05, DUR = 60, N = Math.ceil(DUR / HOP) + 1, FPS = 10;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const on = (r, t) => r.some(([s, e]) => t >= s && t < e);

const H = [[0, 6], [20.2, 23], [26.8, 30], [45.3, 52]];                 // apresentador
const G = [[6.3, 20], [23.3, 26.5], [29.6, 34], [35.2, 39], [40.2, 45], [52.3, 60]]; // convidado
// reacoes do apresentador enquanto o convidado fala ("aham", risada, "sei")
const Hback = [[8, 8.5], [10.5, 11], [13, 13.4], [16, 17.2], [18, 18.5], [34.1, 34.6], [39.2, 39.8], [42, 42.4], [55, 55.6]];
const hostTalks = (t) => on(H, t) || on(Hback, t);

// quem deveria estar no ar (ignora 0,5 s ao redor de cada troca)
const truth = [];
for (const [s, e] of H) truth.push([s + 0.5, e - 0.3, 0]);
truth.push([6.8, 19.7, 1], [23.8, 26.2, 1], [30.5, 44.7, 1], [52.8, 59.7, 1]);

function db(p) { return 10 * Math.log10(p + 1e-10); }
function speechPow(baseDb, t, ph) { return Math.pow(10, (baseDb + 5 * Math.sin(2 * Math.PI * 3.5 * t + ph) + (rnd() - 0.5) * 4) / 10); }

function micEnvs() {
  const h = new Float32Array(N), g = new Float32Array(N);
  for (let f = 0; f < N; f++) {
    const t = f * HOP;
    const hp = hostTalks(t) ? speechPow(on(Hback, t) ? -16 : -18, t, 0) : 0;  // reacoes altas (risada)
    const gp = on(G, t) ? speechPow(-27, t, 1.7) : 0;                          // convidado grava 9 dB mais baixo
    h[f] = db(hp + gp * Math.pow(10, -18 / 10) + 1e-6);
    g[f] = db(gp + hp * Math.pow(10, -11 / 10) + 3e-6);                        // muito vazamento do apresentador
  }
  return [h, g];
}

function mixEnv() {
  const a = new Float32Array(N);
  for (let f = 0; f < N; f++) {
    const t = f * HOP;
    a[f] = db((hostTalks(t) ? speechPow(-18, t, 0) : 0) + (on(G, t) ? speechPow(-22, t, 1.7) : 0) + 1e-6);
  }
  return a;
}

// boca: o convidado tem o microfone na frente da boca (labios mexem pouco, queixo mexe);
// o apresentador mexe a boca ao reagir e ao sorrir enquanto escuta.
function mouthFeatures(talk, occluded, listeningMoves) {
  const M = Math.ceil(DUR * FPS) + 1;
  const open = new Float32Array(M), jaw = new Float32Array(M), chin = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const t = i / FPS, w = Math.sin(2 * Math.PI * 3.3 * t);
    const talking = talk(t);
    const lip = talking ? (occluded ? 0.04 : 0.2) * w : (listeningMoves && Math.sin(0.9 * t) > 0.3 ? 0.07 * Math.sin(2 * Math.PI * 1.1 * t) : 0);
    open[i] = 0.12 + lip + 0.01 * rnd();
    jaw[i] = 0.1 + (talking ? 0.18 * w : 0.01 * rnd()) + 0.01 * rnd();
    chin[i] = 1.4 + (talking ? 0.05 * w : 0) + 0.004 * rnd();
  }
  return { open, jaw, chin };
}

function score(res) {
  let ok = 0, tot = 0;
  for (const [s, e, who] of truth) {
    for (let t = s; t < e; t += HOP) {
      tot++;
      const sg = res.segments.find((x) => t >= x.start && t < x.end);
      if (sg && sg.label === who) ok++;
    }
  }
  return ok / tot;
}

const base = { hop: HOP, smooth: 0.3, thrFrac: 0.4, overlapDb: 6, wide: false, overlapMin: 1.5,
  minShot: 2.5, preRoll: 0.25, maxShot: 0, wideLen: 3, switchSec: 0.4,
  mouthFps: FPS, mouthWin: 0.6, mouthMin: 0.35, mouthOverlap: 0.6 };

function show(title, res) {
  const pct = score(res);
  console.log(`\n${title}: camera certa ${Math.round(pct * 1000) / 10}% do tempo`);
  console.log('  ' + res.segments.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)} ${s.label === A.WIDE ? 'ABERTO' : 'HG'[s.label]}`).join(' | '));
  if (res.doubts && res.doubts.length) console.log('  duvidas: ' + res.doubts.map((d) => d.time.toFixed(1) + 's').join(', '));
  return pct;
}

const mics = show('Mics separados', A.decide(micEnvs(), base));
const mouths = [mouthFeatures(hostTalks, false, true), mouthFeatures((t) => on(G, t), true, false)];
// compatibilidade: versoes antigas recebiam so a abertura dos labios
const mouthIn = A.decideMouth.length && A.MOUTH_FEATURES ? mouths : mouths.map((m) => m.open);
const mouth = show('Audio unico + boca', A.decideMouth(mixEnv(), mouthIn, base));

const MIN = parseFloat(process.env.MIN_OK || '0.95');
const ok = mics >= MIN && mouth >= MIN;
console.log(ok ? `\nTODOS OS TESTES PASSARAM (minimo ${MIN * 100}%)` : `\nALGUM TESTE FALHOU (minimo ${MIN * 100}%)`);
process.exit(ok ? 0 : 1);
