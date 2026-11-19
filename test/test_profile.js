// Pessoa de perfil. Três situações, da mais fácil para a mais difícil:
//   1. o convidado vira o rosto enquanto fala (o rosto ainda é visto, mas de lado)
//   2. a medida antiga (dividida pela largura da boca) vs. a nova (no eixo do rosto)
//   3. o rosto do convidado some de vez (de costas / mão na frente)
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'AutoCut', 'js', 'analysis.js'));

const HOP = 0.05, DUR = 60, FPS = 10, N = Math.ceil(DUR / HOP) + 1, M = Math.ceil(DUR * FPS) + 1;
let seed = 23;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const on = (r, t) => r.some(([s, e]) => t >= s && t < e);

const H = [[0, 6], [20.2, 23], [26.8, 30], [45.3, 52]];
const G = [[6.3, 20], [23.3, 26.5], [29.6, 34], [35.2, 39], [40.2, 45], [52.3, 60]];
// o convidado vira o rosto de lado nestes trechos (gira até ~75°)
const TURNED = [[8, 16], [30, 38], [53, 59]];

function syl(t, ph) { return 0.5 + 0.5 * Math.sin(2 * Math.PI * (3 + Math.abs(Math.sin(0.4 * t + ph))) * t + ph); }
const at = (t, ph) => syl(t, ph);

// áudio: só diz QUANDO alguém fala
const audio = new Float32Array(N);
for (let f = 0; f < N; f++) {
  const t = f * HOP;
  let p = Math.pow(10, (-60 + rnd() * 3) / 10);
  if (on(H, t)) p += Math.pow(10, (-26 + 12 * at(t, 0)) / 10);
  if (on(G, t)) p += Math.pow(10, (-26 + 12 * at(t, 1.7)) / 10);
  audio[f] = 10 * Math.log10(p);
}

// Geometria: pontos do rosto em cm, girados e projetados como numa câmera real.
const FACE = {
  nasion: [0, 3.6, -1.5], nose: [0, 0, 0], chin: [0, -7.2, -1.0],
  lipUp: [0, -3.0, 0], cornerL: [-2.4, -3.4, -1.2], cornerR: [2.4, -3.4, -1.2],
  eyeL: [-3.2, 3.5, -2.0], eyeR: [3.2, 3.5, -2.0]
};
const proj = ([x, y, z], yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), y];
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Giro da cabeça ao longo do tempo. Ninguém fica com a cabeça imóvel: mesmo de frente há
// um balanço pequeno, e ao virar de lado a pessoa chega lá aos poucos e continua se mexendo.
// Esse movimento contínuo é justamente o que arruína a medida antiga.
function yawAt(t, turned) {
  const balanco = 7 * Math.sin(2 * Math.PI * 0.23 * t) + 4 * Math.sin(2 * Math.PI * 0.11 * t + 1.3);
  let alvo = 0;
  if (turned) {
    for (const [s, e] of TURNED) {
      if (t >= s - 1 && t < e + 1) {
        // sobe e desce suavemente nas bordas (1 s para virar)
        const entra = Math.min(1, Math.max(0, (t - (s - 1)) / 1));
        const sai = Math.min(1, Math.max(0, ((e + 1) - t) / 1));
        alvo = 70 * Math.min(entra, sai) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.3 * t));
      }
    }
  }
  return (alvo + balanco) * Math.PI / 180;
}

// Devolve as medidas NOVAS (eixo do rosto) e as ANTIGAS (largura da boca / olhos).
function camera(talk, ph, turned) {
  const nova = { open: new Float32Array(M), jaw: new Float32Array(M), chin: new Float32Array(M), artic: new Float32Array(M) };
  const antiga = { open: new Float32Array(M), chin: new Float32Array(M) };
  for (let i = 0; i < M; i++) {
    const t = i / FPS;
    const yaw = yawAt(t, turned);
    const gap = on(talk, t) ? 0.3 + 1.4 * at(t, ph) : 0.08 + 0.03 * rnd();  // abertura em cm
    const P = {};
    for (const k in FACE) P[k] = proj(FACE[k], yaw);
    const lipLo = proj([0, -3.0 - gap, 0], yaw);

    // NOVA: ao longo do eixo nasion→nariz
    const ax = [P.nasion[0] - P.nose[0], P.nasion[1] - P.nose[1]];
    const ref = Math.hypot(ax[0], ax[1]);
    const ux = ax[0] / ref, uy = ax[1] / ref;
    nova.open[i] = Math.abs((lipLo[0] - P.lipUp[0]) * ux + (lipLo[1] - P.lipUp[1]) * uy) / ref;
    nova.chin[i] = Math.abs((P.chin[0] - P.nose[0]) * ux + (P.chin[1] - P.nose[1]) * uy) / ref;
    // blendshapes do MediaPipe já vêm normalizados pela pose: não sofrem com o giro
    nova.jaw[i] = Math.min(1, gap / 2.2);
    nova.artic[i] = Math.min(1, gap / 2.0);

    // ANTIGA: dividida por distâncias horizontais, que encolhem com o giro
    const largura = d2(P.cornerL, P.cornerR);
    const olhos = d2(P.eyeL, P.eyeR);
    antiga.open[i] = largura > 1e-6 ? d2(lipLo, P.lipUp) / largura : NaN;
    antiga.chin[i] = olhos > 1e-6 ? d2(P.nose, P.chin) / olhos : NaN;
  }
  return { nova, antiga };
}

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
  const p = score(res);
  console.log(`\n${title}: câmera certa ${(p * 100).toFixed(1)}%`);
  console.log('  ' + res.segments.map((x) => `${x.start.toFixed(1)}-${x.end.toFixed(1)} ${'HG'[x.label]}`).join(' | '));
  return p;
}

let ok = true;
const host = camera(H, 0, false);
const guestFront = camera(G, 1.7, false);
const guestTurned = camera(G, 1.7, true);

// 1) de frente (controle) e de perfil, com a medida nova
const frente = show('Convidado de frente (controle)', A.decideMouth(audio, [host.nova, guestFront.nova], base));
const perfil = show('Convidado de perfil — medida nova', A.decideMouth(audio, [host.nova, guestTurned.nova], base));
ok = frente >= 0.95 && perfil >= 0.95 && ok;

// 2) a medida antiga, no mesmo material de perfil
const antigaHost = { open: host.antiga.open, chin: host.antiga.chin };
const antigaGuest = { open: guestTurned.antiga.open, chin: guestTurned.antiga.chin };
const velha = show('Convidado de perfil — medida ANTIGA (para comparar)', A.decideMouth(audio, [antigaHost, antigaGuest], base));
console.log(`  → a medida nova ganha ${((perfil - velha) * 100).toFixed(1)} pontos percentuais`);
ok = perfil > velha + 0.05 && ok;

// 3) rosto do convidado some de vez nos trechos virados
const guestGone = { open: new Float32Array(M), jaw: new Float32Array(M), chin: new Float32Array(M), artic: new Float32Array(M) };
for (const k in guestGone) for (let i = 0; i < M; i++) {
  guestGone[k][i] = on(TURNED, i / FPS) ? NaN : guestTurned.nova[k][i];
}
const semRosto = show('Rosto do convidado some (de costas) — dedução pelo complemento',
  A.decideMouth(audio, [host.nova, guestGone], base));
const semDeducao = show('O mesmo, com a dedução desligada (para comparar)',
  A.decideMouth(audio, [host.nova, guestGone], Object.assign({}, base, { hiddenTrust: 0 })));
console.log(`  → a dedução ganha ${((semRosto - semDeducao) * 100).toFixed(1)} pontos percentuais`);
ok = semRosto >= 0.9 && semRosto > semDeducao + 0.05 && ok;

// 4) falhas curtas de detecção são costuradas
const pontilhado = new Float32Array([1, 2, NaN, NaN, 5, NaN, NaN, NaN, NaN, NaN, NaN, 12]);
A.fillGaps(pontilhado, 3);
const costurou = Math.abs(pontilhado[2] - 3) < 0.01 && Math.abs(pontilhado[3] - 4) < 0.01;
const deixouBuraco = Number.isNaN(pontilhado[7]);
console.log(`\nFalhas curtas costuradas: ${costurou ? 'sim' : 'NÃO'} · buraco longo preservado: ${deixouBuraco ? 'sim' : 'NÃO'}`);
ok = costurou && deixouBuraco && ok;

console.log(ok ? '\nTODOS OS TESTES PASSARAM' : '\nALGUM TESTE FALHOU');
process.exit(ok ? 0 : 1);
