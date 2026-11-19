// Roda o host.jsx contra um modelo falso da API do Premiere para conferir
// razor + ativar/desativar clipes. Testa as duas convencoes de timecode do razor.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TICKS = 254016000000;
const FPS = 30, TB = TICKS / FPS;
const src = fs.readFileSync(path.join(__dirname, '..', 'AutoCut', 'jsx', 'host.jsx'), 'utf8');

function makeWorld(zeroSec, razorUsesDisplayTc) {
  class Time {
    constructor() { this._t = 0; }
    get ticks() { return String(this._t); } set ticks(v) { this._t = parseFloat(v); }
    get seconds() { return this._t / TICKS; } set seconds(v) { this._t = v * TICKS; }
    getFormatted() {
      let f = Math.round(this._t / TB);
      const ff = f % FPS; f = (f - ff) / FPS;
      const ss = f % 60; f = (f - ss) / 60;
      const mm = f % 60, hh = (f - mm) / 60;
      return [hh, mm, ss, ff].map((n) => String(n).padStart(2, '0')).join(':');
    }
  }
  const T = (sec) => { const t = new Time(); t.seconds = sec; return t; };
  const clip = (name, s, e) => ({ name, start: T(s), end: T(e), inPoint: T(0), disabled: false,
    projectItem: { getMediaPath: () => '/media/' + name } });
  const coll = (arr) => new Proxy(arr, { get: (a, k) => (k === 'numItems' || k === 'numTracks' || k === 'numSequences') ? a.length : a[k] });
  const track = (name, clips) => ({ name, clips: coll(clips), isLocked: () => false, _clips: clips });

  let nextId = 1;
  function makeSeq(name, vtracks, atracks) {
    const seq = {
      name, sequenceID: 'seq' + (nextId++), _markers: [],
      get markers() { const self = this; return { createMarker(t) { const m = { start: t, setColorByIndex() {} }; self._markers.push(m); return m; } }; }, timebase: String(TB), end: String(60 * TICKS), zeroPoint: String(zeroSec * TICKS),
      videoTracks: coll(vtracks), audioTracks: coll(atracks),
      getSettings: () => ({ videoFrameRate: T(1 / FPS), videoDisplayFormat: 101 }),
      clone() {
        const cp = (t) => track(t.name, t._clips.map((c) => Object.assign(clip(c.name, c.start.seconds, c.end.seconds), { disabled: c.disabled })));
        sequences.push(makeSeq(name + ' Copy', vtracks.map(cp), atracks.map(cp)));
        return true;
      }
    };
    return seq;
  }
  const sequences = [];
  const orig = makeSeq('Podcast',
    [track('V1', [clip('camA.mp4', 0, 60)]), track('V2', [clip('camB.mp4', 0, 60)]), track('V3', [clip('wide.mp4', 0, 60)])],
    [track('A1', [clip('micA.wav', 0, 60)]), track('A2', [clip('micB.wav', 0, 60)])]);
  sequences.push(orig);

  const app = {
    project: {
      activeSequence: orig,
      sequences: coll(sequences),
      openSequence(id) { this.activeSequence = sequences.find((s) => s.sequenceID === id); }
    },
    enableQE() {}
  };
  const qe = { project: { getActiveSequence: () => ({
    getVideoTrackAt: (i) => ({
      razor(tc) {
        const [hh, mm, ss, ff] = tc.split(':').map(Number);
        let ticks = ((hh * 3600 + mm * 60 + ss) * FPS + ff) * TB;
        if (razorUsesDisplayTc) ticks -= zeroSec * TICKS;
        const t = app.project.activeSequence.videoTracks[i];
        const k = t._clips.findIndex((c) => c.start._t < ticks && c.end._t > ticks);
        if (k < 0) return;
        const c = t._clips[k];
        const nc = Object.assign(clip(c.name, 0, 0), { disabled: c.disabled });
        nc.start._t = ticks; nc.end._t = c.end._t; c.end._t = ticks;
        t._clips.splice(k + 1, 0, nc);
      }
    })
  }) } };
  return { app, qe, Time, orig, sequences };
}

function runCase(label, zeroSec, displayTc, clone) {
  const w = makeWorld(zeroSec, displayTc);
  const ctx = vm.createContext({ app: w.app, qe: w.qe, Time: w.Time });
  vm.runInContext(src, ctx);

  const info = JSON.parse(ctx.pc_getSequenceInfo());
  if (!info.ok) throw new Error(info.error);

  // A: 0-10.5  B: 10.5-22  ABERTO: 22-30  A: 30-60   (V1=A, V2=B, V3=aberto)
  const segs = [{ s: 0, e: 315, track: 0 }, { s: 315, e: 660, track: 1 }, { s: 660, e: 900, track: 2 }, { s: 900, e: 1801, track: 0 }];
  const payload = { clone, cloneName: 'Podcast - AutoCut', tracks: [0, 1, 2], cutFrames: [315, 660, 900], segments: segs,
    markers: [{ t: 12.5, name: 'AutoCut: conferir', comment: 'Convidado "fala" aqui' }] };
  const res = JSON.parse(ctx.pc_applyCuts(JSON.stringify(payload)));
  if (!res.ok) throw new Error(res.error);

  const seq = w.app.project.activeSequence;
  let ok = true;
  if (clone && (seq === w.orig || seq.name !== 'Podcast - AutoCut')) { ok = false; console.log('  clone nao foi aberto'); }
  if (clone && w.orig.videoTracks[0]._clips.length !== 1) { ok = false; console.log('  sequencia original foi alterada!'); }
  if (seq._markers.length !== 1 || seq._markers[0].start !== 12.5 || seq._markers[0].comments !== 'Convidado "fala" aqui') { ok = false; console.log('  marcador errado'); }
  if (clone && w.orig._markers.length) { ok = false; console.log('  marcador foi para a sequencia original'); }
  for (const sg of segs) {
    const midTicks = ((sg.s + sg.e) / 2) * TB;
    for (let v = 0; v < 3; v++) {
      const c = seq.videoTracks[v]._clips.find((x) => x.start._t <= midTicks && x.end._t > midTicks);
      const enabled = c && !c.disabled;
      if (enabled !== (v === sg.track)) { ok = false; console.log(`  frame ${sg.s}-${sg.e}: V${v + 1} ${enabled ? 'ligada' : 'desligada'} (errado)`); }
    }
  }
  console.log(`${ok ? 'OK    ' : 'FALHOU'} ${label}  (razors=${res.razors}, toggled=${res.toggled}, markers=${res.markers}, clipes V1=${seq.videoTracks[0]._clips.length})`);
  return ok;
}

let all = true;
all = runCase('inicio 00:00, duplicando', 0, true, true) && all;
all = runCase('inicio 00:00, sem duplicar', 0, true, false) && all;
all = runCase('inicio 01:00:00, razor com timecode da tela', 3600, true, true) && all;
all = runCase('inicio 01:00:00, razor com tempo relativo', 3600, false, true) && all;
console.log(all ? '\nTODOS OS TESTES PASSARAM' : '\nALGUM TESTE FALHOU');
process.exit(all ? 0 : 1);
