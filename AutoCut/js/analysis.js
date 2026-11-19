'use strict';
// Analise de audio do AutoCut: le o nivel de cada microfone com ffmpeg
// e decide qual camera deve estar no ar em cada momento.

const cp = require('child_process');
const fs = require('fs');

const SR = 8000;          // taxa de amostragem usada so para medir volume
const NONE = -1;          // ninguem falando
const OVERLAP = -2;       // duas ou mais pessoas falando juntas
const WIDE = -3;          // plano aberto

function findFfmpeg(custom) {
  const list = [
    custom,
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe'
  ].filter(Boolean);
  for (const p of list) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* ignora */ }
  }
  return null;
}

function toDb(meanSq) {
  return 10 * Math.log10(meanSq / (32768 * 32768) + 1e-10); // minimo -100 dB
}

function channelArgs(ch) {
  if (ch === 'L') return ['-af', 'pan=mono|c0=c0'];
  if (ch === 'R') return ['-af', 'pan=mono|c0=c1'];
  return ['-ac', '1'];
}

// Le um trecho de um arquivo e devolve o volume (dB) a cada `hop` segundos.
function extractEnvelope(ffmpeg, file, startSec, durSec, hop, channel, onProgress) {
  return new Promise((resolve, reject) => {
    const hopSamples = Math.max(1, Math.round(SR * hop));
    const nFrames = Math.max(1, Math.ceil(durSec / hop));
    const out = new Float32Array(nFrames).fill(-100);
    const args = ['-v', 'error', '-nostdin',
      '-ss', String(Math.max(0, startSec)), '-t', String(durSec),
      '-i', file, '-vn', '-map', '0:a:0'].concat(channelArgs(channel),
      ['-ar', String(SR), '-acodec', 'pcm_s16le', '-f', 's16le', 'pipe:1']);
    const proc = cp.spawn(ffmpeg, args);
    let frame = 0, acc = 0, cnt = 0, leftover = null, err = '', lastP = 0;
    proc.stdout.on('data', (buf) => {
      if (leftover) { buf = Buffer.concat([leftover, buf]); leftover = null; }
      const n = buf.length >> 1;
      for (let i = 0; i < n; i++) {
        const s = buf.readInt16LE(i * 2);
        acc += s * s; cnt++;
        if (cnt === hopSamples) {
          if (frame < nFrames) out[frame] = toDb(acc / cnt);
          frame++; acc = 0; cnt = 0;
        }
      }
      if (buf.length & 1) leftover = buf.subarray(buf.length - 1);
      if (onProgress) {
        const p = Math.min(1, frame / nFrames);
        if (p - lastP > 0.01) { lastP = p; onProgress(p); }
      }
    });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (cnt > 0 && frame < nFrames) out[frame] = toDb(acc / cnt);
      if (code !== 0 && frame === 0) {
        reject(new Error('ffmpeg nao conseguiu ler "' + file + '": ' + err.trim().slice(0, 300)));
      } else {
        resolve(out);
      }
    });
  });
}

// speakers: [{ clips: [{path, inPoint, start, end}], channel: 'mix'|'L'|'R' }]
// Devolve um envelope por pessoa, alinhado com o tempo da sequencia.
async function buildEnvelopes(ffmpeg, speakers, totalDur, hop, onProgress) {
  const N = Math.ceil(totalDur / hop) + 1;
  const envs = [];
  for (let si = 0; si < speakers.length; si++) {
    const sp = speakers[si];
    const env = new Float32Array(N).fill(-100);
    const clips = sp.clips.filter((c) => c.path && c.end > c.start);
    for (let ci = 0; ci < clips.length; ci++) {
      const c = clips[ci];
      const part = await extractEnvelope(ffmpeg, c.path, c.inPoint, c.end - c.start, hop, sp.channel,
        (p) => onProgress && onProgress(si, (ci + p) / clips.length));
      const off = Math.round(c.start / hop);
      for (let i = 0; i < part.length && off + i < N; i++) {
        if (off + i >= 0 && part[i] > env[off + i]) env[off + i] = part[i];
      }
    }
    if (onProgress) onProgress(si, 1);
    envs.push(env);
  }
  return envs;
}

function percentile(arr, p) {
  const vals = [];
  for (let i = 0; i < arr.length; i++) if (arr[i] > -99) vals.push(arr[i]);
  if (!vals.length) return -100;
  vals.sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
}

// media movel em potencia (nao em dB), para suavizar silabas
function smoothDb(env, win, N) {
  const pw = new Float64Array(N);
  for (let i = 0; i < N; i++) pw[i] = i < env.length ? Math.pow(10, env[i] / 10) : 1e-10;
  const out = new Float32Array(N);
  const half = Math.floor(win / 2);
  let sum = 0, a = 0, b = -1;
  for (let i = 0; i < N; i++) {
    const lo = Math.max(0, i - half), hi = Math.min(N - 1, i + half);
    while (b < hi) { b++; sum += pw[b]; }
    while (a < lo) { sum -= pw[a]; a++; }
    out[i] = 10 * Math.log10(Math.max(sum / (b - a + 1), 1e-10));
  }
  return out;
}

function toRuns(labels) {
  const runs = [];
  let s = 0;
  for (let i = 1; i <= labels.length; i++) {
    if (i === labels.length || labels[i] !== labels[s]) {
      runs.push({ s: s, e: i, label: labels[s] });
      s = i;
    }
  }
  return runs;
}

function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.label === r.label) last.e = r.e;
    else out.push({ s: r.s, e: r.e, label: r.label });
  }
  return out;
}

const MOUTH_FEATURES = ['open', 'jaw', 'chin'];

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

// Nivel de um sinal: ruido de fundo (floor), fala normal (ref) e limiar de fala (thr).
// O ruido usa um percentil baixo: em podcast quase nao ha silencio, e um percentil alto
// confundia a fala mais baixa (geralmente a do convidado) com ruido.
function levelStats(sm, thrFrac) {
  const f = percentile(sm, 0.03);
  const pk = percentile(sm, 0.95);
  const range = Math.max(pk - f, 6);
  return { floor: f, ref: pk, thr: f + range * thrFrac };
}

// ---------- compensacao de vazamento entre microfones ----------
// Aprende quanto da voz de cada pessoa vaza nos outros mics e desconta antes de decidir.
function removeBleed(sm) {
  const S = sm.length;
  if (S < 2) return { clean: sm, leak: [] };
  const N = sm[0].length;
  const leak = [];
  for (let j = 0; j < S; j++) {
    leak.push([]);
    const hi = percentile(sm[j], 0.8);
    for (let i = 0; i < S; i++) {
      if (i === j) { leak[j].push(0); continue; }
      const d = [];
      for (let f = 0; f < N; f++) if (sm[j][f] >= hi && sm[j][f] > -99) d.push(sm[i][f] - sm[j][f]);
      d.sort((a, b) => a - b);
      // o vazamento e sempre mais baixo do que a voz no proprio mic da pessoa
      leak[j].push(d.length ? Math.min(d[Math.floor(0.25 * (d.length - 1))], -3) : -60);
    }
  }
  const clean = sm.map((x, i) => {
    const out = new Float32Array(N);
    for (let f = 0; f < N; f++) {
      const P = Math.pow(10, x[f] / 10);
      let B = 0;
      for (let j = 0; j < S; j++) if (j !== i) B += Math.pow(10, (sm[j][f] + leak[j][i]) / 10);
      const c = P - 1.2 * B;
      out[f] = 10 * Math.log10(Math.max(c, P * 1e-3, 1e-10));
    }
    return out;
  });
  return { clean, leak };
}

/*
 * Modo "um mic por pessoa".
 * envs: envelopes (dB) de cada pessoa, mesmo hop
 * o: { hop, smooth, thrFrac, overlapDb, wide, overlapMin, minShot, preRoll, maxShot, wideLen, switchSec }
 * Devolve { segments: [{start, end, label}], activity, stats, doubts }
 *   label >= 0: indice da pessoa; label === WIDE: plano aberto
 */
function decide(envs, o) {
  const S = envs.length;
  const N = envs.reduce((m, e) => Math.max(m, e.length), 0);
  if (!S || !N) return emptyResult();
  const sm = envs.map((e) => smoothDb(e, Math.max(1, Math.round(o.smooth / o.hop)), N));
  const { clean } = removeBleed(sm);
  const st = clean.map((x) => levelStats(x, o.thrFrac));
  const half = Math.max(0.5, o.overlapDb / 2);

  // forca (0..1) de "a pessoa i esta falando" em cada instante
  const s = clean.map(() => new Float32Array(N));
  for (let f = 0; f < N; f++) {
    let m = -Infinity;
    for (let i = 0; i < S; i++) m = Math.max(m, clean[i][f] - st[i].ref);
    for (let i = 0; i < S; i++) {
      const act = sigmoid((clean[i][f] - st[i].thr) / 2);
      const dom = Math.exp(-Math.max(0, m - (clean[i][f] - st[i].ref)) / half);
      s[i][f] = act * dom;
    }
  }
  return decodeShots(s, o);
}

// ---------- modo "audio unico": quem mexe a boca enquanto ha fala ----------

// Roda o py/mouth.py em um trecho de video e devolve as medidas da boca por quadro.
function extractMouth(python, script, model, ffmpeg, file, startSec, durSec, fps, onProgress) {
  return new Promise((resolve, reject) => {
    const args = ['-I', script, '--file', file, '--model', model, '--ffmpeg', ffmpeg,
      '--start', String(Math.max(0, startSec)), '--dur', String(durSec), '--fps', String(fps)];
    const proc = cp.spawn(python, args);
    let out = '', errTail = '', errBuf = '', errMsg = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => {
      errBuf += d;
      const lines = errBuf.split('\n');
      errBuf = lines.pop();
      for (const ln of lines) {
        const m = /^PROGRESS ([\d.]+)/.exec(ln);
        if (m) { if (onProgress) onProgress(parseFloat(m[1])); }
        else if (/^ERRO /.test(ln)) errMsg = ln.slice(5);
        else if (ln.trim()) errTail = (errTail + '\n' + ln).slice(-600);
      }
    });
    proc.on('error', (e) => reject(new Error('Nao consegui rodar o Python do modo audio unico (' + e.message + '). Rode setup_lipsync.sh.')));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('Leitura da boca falhou: ' + (errMsg || ('"' + file + '"' + errTail))));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('Resposta invalida do leitor de boca: ' + e.message)); }
    });
  });
}

// cams: [{ clips: [{path, inPoint, start, end}] }]
// Devolve, por camera, { open, jaw, chin } alinhados com a sequencia (passo 1/fps; NaN = sem rosto).
async function buildMouthTracks(env, cams, totalDur, fps, onProgress) {
  const N = Math.ceil(totalDur * fps) + 1;
  const tracks = [];
  for (let ci = 0; ci < cams.length; ci++) {
    const feat = {};
    for (const k of MOUTH_FEATURES) feat[k] = new Float32Array(N).fill(NaN);
    const clips = cams[ci].clips.filter((c) => c.path && c.end > c.start);
    for (let k = 0; k < clips.length; k++) {
      const c = clips[k];
      const res = await extractMouth(env.python, env.script, env.model, env.ffmpeg, c.path, c.inPoint,
        c.end - c.start, fps, (p) => onProgress && onProgress(ci, (k + p) / clips.length));
      const off = Math.round(c.start * fps);
      for (const name of MOUTH_FEATURES) {
        const src = res[name];
        if (!src) continue;
        for (let i = 0; i < src.length && off + i < N; i++) {
          if (off + i >= 0 && src[i] >= 0) feat[name][off + i] = src[i];
        }
      }
    }
    if (onProgress) onProgress(ci, 1);
    tracks.push(feat);
  }
  return tracks;
}

// Movimento: desvio padrao de uma medida numa janela (~0.6 s), reamostrado para o hop do audio.
function movement(series, fps, hop, N, win) {
  const W = Math.max(2, Math.round(win * fps));
  const half = Math.floor(W / 2);
  const M = series.length;
  const act = new Float32Array(M).fill(NaN);
  for (let i = 0; i < M; i++) {
    let n = 0, s = 0, s2 = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(M - 1, i + half); j++) {
      const v = series[j];
      if (v === v) { n++; s += v; s2 += v * v; }
    }
    if (n >= Math.max(2, W * 0.5)) act[i] = Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n)));
  }
  const out = new Float32Array(N).fill(NaN);
  for (let f = 0; f < N; f++) out[f] = act[Math.min(M - 1, Math.round(f * hop * fps))];
  return out;
}

// Sincronia boca-voz: quem fala abre a boca no ritmo das silabas do audio; quem reage, sorri
// ou ri sem som mexe a boca fora desse ritmo. Mede a correlacao entre a abertura da boca e o
// volume da voz numa janela (~1,6 s), aceitando ate 2 quadros de atraso entre video e audio.
// Devolve 0..1 por quadro do audio (NaN = sem rosto).
function mouthSync(feats, audioEnv, fps, hop, N, win) {
  const names = MOUTH_FEATURES.filter((k) => feats[k]);
  const M = names.length ? feats[names[0]].length : 0;
  const out = new Float32Array(N).fill(NaN);
  if (!M) return out;

  // audio no passo do video (media de potencia)
  const step = 1 / (fps * hop);
  const aud = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    let p = 0, n = 0;
    for (let f = a; f < b && f < N; f++) { p += Math.pow(10, audioEnv[f] / 10); n++; }
    aud[i] = n ? 10 * Math.log10(p / n + 1e-10) : -100;
  }

  // articulacao: media das medidas normalizadas (z-score)
  const art = new Float32Array(M).fill(NaN);
  const zs = names.map((k) => {
    const x = feats[k];
    let n = 0, sm = 0, s2 = 0;
    for (let i = 0; i < M; i++) if (x[i] === x[i]) { n++; sm += x[i]; s2 += x[i] * x[i]; }
    const mean = n ? sm / n : 0, sd = n ? Math.sqrt(Math.max(1e-12, s2 / n - mean * mean)) : 1;
    return { x, mean, sd };
  });
  for (let i = 0; i < M; i++) {
    let n = 0, sm = 0;
    for (const z of zs) { const v = z.x[i]; if (v === v) { n++; sm += (v - z.mean) / z.sd; } }
    if (n) art[i] = sm / n;
  }

  const W = Math.max(4, Math.round(win * fps)), half = Math.floor(W / 2);
  const corr = new Float32Array(M).fill(NaN);
  for (let i = 0; i < M; i++) {
    let best = NaN;
    for (let lag = -2; lag <= 2; lag++) {
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let j = i - half; j <= i + half; j++) {
        const ja = j + lag;
        if (j < 0 || j >= M || ja < 0 || ja >= M) continue;
        const x = art[j], y = aud[ja];
        if (x !== x) continue;
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      }
      if (n < W * 0.6) continue;
      const vx = sxx - sx * sx / n, vy = syy - sy * sy / n;
      if (vx < 1e-9 || vy < 1e-6) continue;
      const r = (sxy - sx * sy / n) / Math.sqrt(vx * vy);
      if (!(best >= r)) best = r;
    }
    corr[i] = best;
  }
  for (let f = 0; f < N; f++) {
    const c = corr[Math.min(M - 1, Math.round(f * hop * fps))];
    out[f] = c === c ? Math.max(0, Math.min(1, c / 0.35)) : NaN;
  }
  return out;
}

/*
 * Modo "audio unico".
 * audioEnv: envelope (dB) do audio misturado
 * mouth: por camera, { open, jaw, chin } (ou so a serie de abertura, formato antigo)
 * o: opcoes do decide() + { mouthFps, mouthWin, mouthMin, mouthOverlap }
 *
 * Cada medida (labios, mandibula, queixo) e normalizada pelo movimento tipico daquela
 * camera quando ha fala e quando nao ha. Quem so reage ou sorri mexe pouco em relacao
 * ao proprio jeito de falar; quem tem o microfone na frente da boca ainda mexe o queixo.
 */
function decideMouth(audioEnv, mouth, o) {
  const hop = o.hop;
  const N = audioEnv.length;
  const S = mouth.length;
  if (!S || !N) return emptyResult();

  const sm = smoothDb(audioEnv, Math.max(1, Math.round(o.smooth / hop)), N);
  const st = levelStats(sm, o.thrFrac);
  const speech = new Float32Array(N);
  for (let f = 0; f < N; f++) speech[f] = sigmoid((sm[f] - st.thr) / 2);

  const v = mouth.map((cam) => {
    const feats = cam instanceof Float32Array || Array.isArray(cam) ? { open: cam } : cam;
    const parts = [];
    for (const name of MOUTH_FEATURES) {
      if (!feats[name]) continue;
      const mv = movement(feats[name], o.mouthFps, hop, N, o.mouthWin);
      // escala: movimento quando a camera "fala" (p90) vs. parada (p20)
      const vals = [];
      for (let f = 0; f < N; f++) if (speech[f] > 0.5 && mv[f] === mv[f]) vals.push(mv[f]);
      if (vals.length < 20) continue;
      vals.sort((a, b) => a - b);
      const lo = vals[Math.floor(0.2 * (vals.length - 1))];
      const hi = vals[Math.floor(0.9 * (vals.length - 1))];
      if (hi - lo < 1e-6) continue;
      parts.push({ mv, lo, hi, w: 1 });
    }
    const out = new Float32Array(N).fill(NaN);
    if (!parts.length) return out;
    for (let f = 0; f < N; f++) {
      let sum = 0, wsum = 0, best = -Infinity;
      for (const p of parts) {
        const x = p.mv[f];
        if (x !== x) continue;
        const n = Math.max(0, (x - p.lo) / (p.hi - p.lo));
        sum += n * p.w; wsum += p.w; best = Math.max(best, n);
      }
      // media com um pouco do maior: robusto quando uma medida falha
      if (wsum > 0) out[f] = 0.6 * (sum / wsum) + 0.4 * best;
    }
    return out;
  });

  // movimento "valido" = movimento x sincronia com a voz (peso ajustavel)
  const w = o.syncWeight === undefined ? 0.7 : Math.max(0, Math.min(1, o.syncWeight));
  // Relativo entre as cameras: se ninguem esta em sincronia (audio fora de sync, por exemplo),
  // nada muda; se uma esta e a outra nao, a outra perde forca.
  if (w > 0 && S > 1) {
    const sy = mouth.map((cam) => {
      const feats = cam instanceof Float32Array || Array.isArray(cam) ? { open: cam } : cam;
      return mouthSync(feats, audioEnv, o.mouthFps, hop, N, o.syncWin || 1.6);
    });
    for (let f = 0; f < N; f++) {
      let best = 0;
      for (let i = 0; i < S; i++) if (v[i][f] === v[i][f] && sy[i][f] === sy[i][f]) best = Math.max(best, sy[i][f]);
      const denom = (1 - w) + w * best;
      for (let i = 0; i < S; i++) {
        if (v[i][f] !== v[i][f]) continue;
        const k = sy[i][f] === sy[i][f] ? sy[i][f] : 0;
        v[i][f] *= ((1 - w) + w * k) / denom;
      }
    }
  }

  const s = v.map(() => new Float32Array(N));
  const ovl = Math.max(0.05, 1 - o.mouthOverlap);
  for (let f = 0; f < N; f++) {
    let mm = 0;
    for (let i = 0; i < S; i++) if (v[i][f] === v[i][f]) mm = Math.max(mm, v[i][f]);
    for (let i = 0; i < S; i++) {
      const x = v[i][f] === v[i][f] ? v[i][f] : 0;
      const moving = sigmoid((x - o.mouthMin) / 0.08);
      const dom = mm > 0 ? Math.exp(-Math.max(0, 1 - x / mm) / ovl) : 0;
      s[i][f] = speech[f] * moving * dom;
    }
  }
  return decodeShots(s, o);
}

function emptyResult() {
  return { segments: [], activity: new Int8Array(0), stats: { cuts: 0, seconds: {} }, doubts: [] };
}

// ---------- decisao dos planos (comum aos dois modos) ----------
/*
 * s[i][f]: forca (0..1) de "a pessoa i fala" no instante f.
 * Em vez de decidir quadro a quadro e "segurar a camera anterior", escolhe a sequencia
 * de planos que melhor explica a conversa inteira (Viterbi), com um custo por troca.
 * Assim o comeco da fala do convidado vai para o convidado, e nao fica preso no apresentador.
 */
function decodeShots(s, o) {
  const hop = o.hop;
  const S = s.length;
  const N = s[0].length;
  const useWide = o.wide && o.overlapMin < 1e8;
  const K = S + (useWide ? 1 : 0);
  const W = S; // indice interno do plano aberto

  // evidencia de cada estado em cada quadro
  const E = [];
  for (let k = 0; k < K; k++) E.push(new Float32Array(N));
  const top2 = new Float32Array(N);
  const activity = new Int8Array(N);
  for (let f = 0; f < N; f++) {
    let a = -1, b = -1, ai = -1;
    for (let i = 0; i < S; i++) {
      const x = s[i][f];
      if (x > a) { b = a; a = x; ai = i; } else if (x > b) b = x;
    }
    if (S === 1) b = 0;
    top2[f] = b;
    for (let i = 0; i < S; i++) E[i][f] = s[i][f] - (i === ai ? b : a);
    if (useWide) E[W][f] = 3 * b - a - 1;
    activity[f] = b > 0.5 ? OVERLAP : a > 0.5 ? ai : NONE;
  }

  // Viterbi com custo de troca
  const lambda = Math.max(1, (o.switchSec || 0.4) / hop) * 0.8;
  const back = new Int8Array(N * K);
  let score = new Float64Array(K), next = new Float64Array(K);
  for (let f = 0; f < N; f++) {
    let bi = 0;
    for (let k = 1; k < K; k++) if (score[k] > score[bi]) bi = k;
    for (let k = 0; k < K; k++) {
      const sw = score[bi] - lambda;
      if (score[k] >= sw || bi === k) { next[k] = score[k] + E[k][f]; back[f * K + k] = k; }
      else { next[k] = sw + E[k][f]; back[f * K + k] = bi; }
    }
    const t = score; score = next; next = t;
  }
  const path = new Int8Array(N);
  let k = 0;
  for (let i = 1; i < K; i++) if (score[i] > score[k]) k = i;
  for (let f = N - 1; f >= 0; f--) { path[f] = k; k = back[f * K + k]; }

  // somas acumuladas para medir evidencia e fala dentro de um trecho
  const cum = E.map((e) => { const c = new Float64Array(N + 1); for (let f = 0; f < N; f++) c[f + 1] = c[f] + e[f]; return c; });
  const spk = s.map((x) => { const c = new Float64Array(N + 1); for (let f = 0; f < N; f++) c[f + 1] = c[f] + x[f]; return c; });
  const t2 = new Float64Array(N + 1); for (let f = 0; f < N; f++) t2[f + 1] = t2[f] + top2[f];
  const evid = (r, label) => cum[label][r.e] - cum[label][r.s];
  const speechOf = (r) => (r.label === W ? t2[r.e] - t2[r.s] : spk[r.label][r.e] - spk[r.label][r.s]);

  let runs = mergeRuns(toRuns(path));
  const bestNeighbor = (rs, i) => {
    const p = rs[i - 1], n = rs[i + 1];
    if (!p) return n.label;
    if (!n) return p.label;
    return evid(rs[i], p.label) >= evid(rs[i], n.label) ? p.label : n.label;
  };

  // plano aberto curto demais volta para a pessoa com mais evidencia
  if (useWide) {
    const ovMinF = Math.round(o.overlapMin / hop);
    for (let i = 0; i < runs.length && runs.length > 1; i++) {
      if (runs[i].label === W && runs[i].e - runs[i].s < ovMinF) runs[i].label = bestNeighbor(runs, i);
    }
    runs = mergeRuns(runs);
  }

  // duracao minima: o trecho curto vai para o vizinho com mais evidencia (nao sempre o anterior)
  const minF = Math.max(1, Math.round(o.minShot / hop));
  while (runs.length > 1) {
    let pick = -1, pickScore = Infinity;
    for (let i = 0; i < runs.length; i++) {
      const L = runs[i].e - runs[i].s;
      const sp = speechOf(runs[i]);
      if (L < minF || sp < minF / 2) {
        const sc = Math.min(L, sp * 2);
        if (sc < pickScore) { pickScore = sc; pick = i; }
      }
    }
    if (pick < 0) break;
    runs[pick].label = bestNeighbor(runs, pick);
    runs = mergeRuns(runs);
  }

  // trechos duvidosos: outra pessoa fala por um bom tempo enquanto a camera esta em alguem
  const doubts = [];
  const minDoubtF = Math.round(Math.max(1.5, o.minShot * 0.6) / hop);
  for (const r of runs) {
    if (r.label === W) continue;
    for (let j = 0; j < S; j++) {
      if (j === r.label) continue;
      let start = -1;
      for (let f = r.s; f <= r.e; f++) {
        const bad = f < r.e && s[j][f] > 0.55 && s[r.label][f] < 0.3;
        if (bad && start < 0) start = f;
        if (!bad && start >= 0) {
          if (f - start >= minDoubtF) doubts.push({ time: start * hop, duration: (f - start) * hop, onAir: r.label, talker: j });
          start = -1;
        }
      }
    }
  }
  doubts.sort((a, b) => a.time - b.time);

  // antecipa o corte para a camera de quem vai falar
  const preF = Math.round(o.preRoll / hop);
  for (let i = 1; i < runs.length && preF > 0; i++) {
    const nb = Math.max(runs[i - 1].s + 1, runs[i].s - preF);
    runs[i - 1].e = nb;
    runs[i].s = nb;
  }

  // rotulos externos: pessoa = indice, plano aberto = WIDE
  runs = runs.map((r) => ({ s: r.s, e: r.e, label: r.label === W && useWide ? WIDE : r.label }));

  runs = applyMaxOnAir(runs, s, o, minF);

  const segments = runs.map((r) => ({ start: r.s * hop, end: r.e * hop, label: r.label }));
  const stats = { cuts: Math.max(0, segments.length - 1), seconds: {} };
  for (const sg of segments) stats.seconds[sg.label] = (stats.seconds[sg.label] || 0) + (sg.end - sg.start);
  return { segments, activity, stats, doubts };
}

/*
 * Tempo maximo no ar por camera.
 * o.maxOnAir = { <indice da pessoa>: {max, to, len}, wide: {max, to, len} }
 *   max: segundos (0 = sem limite)
 *   to:  'auto' | 'wide' | indice de outra pessoa  (para onde cortar ao passar do limite)
 *   len: duracao do corte de respiro (s). Para o plano aberto, o resto do trecho vai para 'to'.
 * Compatibilidade: sem maxOnAir, usa o.maxShot / o.wideLen (plano aberto no meio de closes longos).
 */
function applyMaxOnAir(runs, s, o, minF) {
  const hop = o.hop;
  const S = s.length;
  const N = s[0].length;
  let cfg = o.maxOnAir;
  if (!cfg) {
    if (!(o.wide && o.maxShot > 0)) return runs;
    cfg = {};
    for (let i = 0; i < S; i++) cfg[i] = { max: o.maxShot, to: 'wide', len: o.wideLen };
  }
  const spk = s.map((x) => { const c = new Float64Array(N + 1); for (let f = 0; f < N; f++) c[f + 1] = c[f] + x[f]; return c; });
  const talk = (label, a, b) => spk[label][Math.min(N, b)] - spk[label][Math.max(0, a)];

  // para onde cortar: 'auto' = aberto se houver; senao a pessoa que mais fala no trecho (ou a outra)
  const target = (label, conf, a, b) => {
    let to = conf.to === undefined ? 'auto' : conf.to;
    if (to === 'wide' && !o.wide) to = 'auto';
    if (to === 'wide') return WIDE;
    if (typeof to === 'number' && to >= 0 && to < S && to !== label) return to;
    if (label !== WIDE && o.wide) return WIDE;
    let best = -1, bv = -Infinity;
    for (let j = 0; j < S; j++) {
      if (j === label) continue;
      const v = talk(j, a, b);
      if (v > bv) { bv = v; best = j; }
    }
    return best;
  };

  const out = [];
  for (const r of runs) {
    const key = r.label === WIDE ? 'wide' : r.label;
    const conf = cfg[key];
    const maxF = conf && conf.max > 0 ? Math.round(conf.max / hop) : 0;
    if (!maxF || r.e - r.s <= maxF) { out.push(r); continue; }

    if (r.label === WIDE) {
      // plano aberto longo: depois do maximo, volta para quem estiver falando
      let cur = r.s;
      out.push({ s: cur, e: cur + maxF, label: WIDE });
      cur += maxF;
      const to = target(WIDE, conf, cur, r.e);
      if (to >= 0) out.push({ s: cur, e: r.e, label: to });
      else out[out.length - 1].e = r.e;
      continue;
    }

    // close longo: insere um corte de respiro de 'len' s, procurando uma pausa na fala
    const baseLenF = Math.max(1, Math.round((conf.len || 2) / hop));
    const wideMaxF = cfg.wide && cfg.wide.max > 0 ? Math.round(cfg.wide.max / hop) : Infinity;
    let cur = r.s;
    let closed = false;
    for (;;) {
      if (r.e - cur <= maxF) break;
      const lenF0 = baseLenF;
      const to0 = target(r.label, conf, cur, r.e);
      if (to0 === -1) break; // ninguem para cortar
      const lenF = to0 === WIDE ? Math.min(lenF0, wideMaxF) : lenF0;
      const hi = Math.min(cur + maxF, r.e - lenF - minF);
      // de preferencia no fim da janela (60-100% do maximo); se nao couber, qualquer ponto apos minF
      let lo = cur + Math.max(minF, Math.round(maxF * 0.6));
      if (hi < lo) lo = cur + minF;
      if (hi < lo) {
        // nao cabe voltar para a mesma camera: termina o plano no respiro
        const c = r.e - lenF;
        if (c - cur >= minF && c - cur <= maxF) {
          out.push({ s: cur, e: c, label: r.label });
          out.push({ s: c, e: r.e, label: target(r.label, conf, c, r.e) });
          closed = true;
        }
        break;
      }
      let c = hi, cv = Infinity;
      for (let x = lo; x <= hi; x++) {
        const v = talk(r.label, x, x + lenF);
        if (v < cv - 1e-9) { cv = v; c = x; }
      }
      const to = target(r.label, conf, c, c + lenF);
      out.push({ s: cur, e: c, label: r.label });
      out.push({ s: c, e: c + lenF, label: to });
      cur = c + lenF;
    }
    if (!closed) out.push({ s: cur, e: r.e, label: r.label });
  }
  return mergeRuns(out.filter((r) => r.e > r.s));
}

module.exports = {
  findFfmpeg, extractEnvelope, buildEnvelopes, decide,
  extractMouth, buildMouthTracks, decideMouth, removeBleed, mouthSync, applyMaxOnAir,
  NONE, OVERLAP, WIDE, MOUTH_FEATURES
};
