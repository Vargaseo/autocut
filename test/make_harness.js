// Gera o painel real rodando com o Premiere e o Node simulados:
//   AutoCut/_harness.html  -> para testar a interface (o install.sh nao o instala)
//   docs/demo/             -> a demonstracao publicada no site
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'AutoCut');
const baseHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

// `demo`: fala com ritmo de silabas, boca sincronizada e a leitura mais lenta,
// para a demonstracao parecer com o uso real.
function mocks(demo) {
  return `
<script>
  // --- Node simulado (so o necessario para carregar analysis.js) ---
  var module = { exports: {} };
  var require = function (name) {
    if (name === 'child_process') return { spawn: function () { throw new Error('sem spawn no teste'); } };
    if (name === 'fs') return { existsSync: function () { return true; } };
    if (name === 'os') return { homedir: function () { return '/Users/teste'; } };
    if (name === 'path') return { join: function () { return Array.prototype.join.call(arguments, '/'); } };
    if (/analysis\\.js$/.test(name)) return window.__fakeAnalysis;
    throw new Error('modulo desconhecido ' + name);
  };
</script>
<script src="js/analysis.js"></script>
<script>
  (function () {
    var real = module.exports, HOP = 0.05, DUR = 42, DEMO = ${demo ? 'true' : 'false'};
    var talkA = [[1, 9], [16, 24], [27, 36]], talkB = [[9.3, 16], [20, 24], [36.2, 41]];
    function on(r, t) { return r.some(function (x) { return t >= x[0] && t < x[1]; }); }
    // silabas: o volume e a boca seguem o mesmo ritmo irregular
    function syl(t, ph) { return 0.5 + 0.5 * Math.sin(2 * Math.PI * (3 + Math.abs(Math.sin(0.4 * t + ph))) * t + ph); }
    function env(ranges, phases) {
      var N = Math.ceil(DUR / HOP) + 1, a = new Float32Array(N);
      for (var f = 0; f < N; f++) {
        var t = f * HOP, p = Math.pow(10, (-60 + Math.random() * 3) / 10);
        for (var k = 0; k < ranges.length; k++) {
          if (on(ranges[k], t)) p += Math.pow(10, (-26 + 12 * syl(t, phases[k])) / 10);
        }
        a[f] = 10 * Math.log10(p);
      }
      return a;
    }
    // mesmas medidas que o py/mouth.py devolve
    function mouth(talk, ph, fps) {
      var M = Math.ceil(DUR * fps) + 1;
      var o = new Float32Array(M), j = new Float32Array(M), c = new Float32Array(M);
      var ar = new Float32Array(M), yw = new Float32Array(M);
      for (var i = 0; i < M; i++) {
        var t = i / fps, m = on(talk, t) ? syl(t, ph) : 0.04 * Math.random();
        o[i] = 0.09 + 0.3 * m; j[i] = 0.05 + 0.4 * m; c[i] = 1.4 + 0.08 * m;
        ar[i] = 0.05 + 0.45 * m;
        yw[i] = 8 * Math.sin(2 * Math.PI * 0.2 * t);
      }
      return { open: o, jaw: j, chin: c, artic: ar, yaw: yw };
    }
    var calls = window.__calls = [];
    var fake = Object.assign({}, real, {
      findFfmpeg: function () { return '/opt/homebrew/bin/ffmpeg'; },
      buildEnvelopes: async function (ff, sps, dur, hop, prog) {
        calls.push('env:' + sps[0].clips[0].name + ':' + sps[0].channel);
        prog && prog(0, 1);
        var n = sps[0].clips[0].name;
        if (n === 'micA.wav') return [env([talkA], [0])];
        if (n === 'micB.wav') return [env([talkB], [1.7])];
        return [env([talkA, talkB], [0, 1.7])];
      },
      buildMouthTracks: async function (e, cams, dur, fps, prog) {
        var n = cams[0].clips[0].name;
        calls.push('mouth-start:' + n + ':' + fps + '@' + Date.now());
        var steps = DEMO ? 12 : 1, wait = DEMO ? 140 : 150;
        for (var s = 1; s <= steps; s++) {
          await new Promise(function (r) { setTimeout(r, wait / steps * (DEMO ? 1 : 1)); });
          prog && prog(0, s / steps);
        }
        calls.push('mouth-end:' + n + '@' + Date.now());
        return [mouth(n === 'camA.mp4' ? talkA : talkB, n === 'camA.mp4' ? 0 : 1.7, fps)];
      }
    });
    window.__fakeAnalysis = fake;

    // --- Premiere simulado ---
    function clip(name, s, e) { return { name: name, path: '/media/' + name, inPoint: 0, start: s, end: e }; }
    var seq = { ok: true, name: 'Podcast', frameDur: 1 / 30, duration: DUR,
      videoTracks: [
        { index: 0, name: 'V1', clips: [clip('camA.mp4', 0, DUR)], firstClip: 'camA.mp4', locked: false },
        { index: 1, name: 'V2', clips: [clip('camB.mp4', 0, DUR)], firstClip: 'camB.mp4', locked: false },
        { index: 2, name: 'V3', clips: [clip('wide.mp4', 0, DUR)], firstClip: 'wide.mp4', locked: false }],
      audioTracks: [] };
    window.__setAudio = function (single) {
      seq.audioTracks = single ? [{ index: 0, name: 'A1', clips: [clip('mix.wav', 0, DUR)] }]
        : [{ index: 0, name: 'A1', clips: [clip('micA.wav', 0, DUR)] }, { index: 1, name: 'A2', clips: [clip('micB.wav', 0, DUR)] }];
    };
    window.__setAudio(${demo ? 'true' : 'false'});
    window.__adobe_cep__ = {
      getSystemPath: function () { return 'file:///Users/teste/ext'; },
      evalScript: function (code, cb) {
        if (/^pc_getSequenceInfo/.test(code)) return setTimeout(function () { cb(JSON.stringify(seq)); });
        var m = /^pc_applyCuts\\((.*)\\)$/.exec(code);
        if (m) {
          window.__payload = JSON.parse(JSON.parse(m[1]));
          return setTimeout(function () { cb(JSON.stringify({ ok: true, sequence: 'Podcast - AutoCut', razors: 9, toggled: 8, markers: (window.__payload.markers || []).length })); });
        }
        cb('EvalScript error.');
      }
    };
  })();
</script>
`;
}

// 1) banca de testes
fs.writeFileSync(path.join(dir, '_harness.html'),
  baseHtml.replace('<script src="js/main.js"></script>', mocks(false) + '<script src="js/main.js"></script>'));

// 2) demonstracao do site
const demoDir = path.join(root, 'docs', 'demo');
fs.mkdirSync(path.join(demoDir, 'js'), { recursive: true });
fs.mkdirSync(path.join(demoDir, 'css'), { recursive: true });
for (const f of ['js/analysis.js', 'js/main.js', 'js/i18n.js', 'css/style.css']) {
  fs.copyFileSync(path.join(dir, f), path.join(demoDir, f));
}

// O painel em si é em português; o aviso acompanha o idioma do site.
const banner = `  <div class="demo-note">
    <p id="notePt">
      <strong>Demonstração</strong> — este é o painel real do AutoCut, com uma sequência de exemplo
      no lugar do Premiere. Analise, mexa nos ajustes e veja a prévia mudar.
      <a href="../">Voltar ao site</a>
    </p>
    <p id="noteEn" hidden>
      <strong>Demo</strong> — this is the real AutoCut panel, running on a sample sequence instead of
      Premiere. Hit <em>Analyse audio</em>, change the settings and watch the preview update.
      The PT/EN switch in the top-right corner changes the panel’s language.
      <a href="../en/">Back to the site</a>
    </p>
  </div>
`;
const demoCss = `
    body { max-width: 420px; margin: 0 auto; }
    .demo-note { background: #1d3049; border: 1px solid #2d8ceb; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; font-size: 11px; line-height: 1.5; }
    .demo-note p { margin: 0; }
    .demo-note a { color: #7cb9f3; }
`;
// A demo sempre segue o idioma do link que trouxe o visitante, e nao o que ficou salvo antes.
const demoLangScript = `<script>
  (function () {
    var en = /[?&]lang=en\\b/.test(location.search);
    document.getElementById('notePt').hidden = en;
    document.getElementById('noteEn').hidden = !en;
    try { localStorage.setItem('autocut.settings.v1', JSON.stringify({ lang: en ? 'en' : 'pt' })); } catch (e) {}
  })();
</script>`;
let demoHtml = baseHtml
  .replace('<title>AutoCut</title>', '<title>AutoCut — demonstração</title>')
  .replace('</head>', `  <style>${demoCss}  </style>\n</head>`)
  .replace('<body>', '<body>\n' + banner)
  // o idioma precisa ser escolhido ANTES do main.js, que le o ajuste salvo ao iniciar
  .replace('<script src="js/main.js"></script>',
    mocks(true) + demoLangScript + '\n<script src="js/main.js"></script>\n' +
    '<script>setTimeout(function () { document.getElementById("btnRead").click(); }, 150);</script>');
fs.writeFileSync(path.join(demoDir, 'index.html'), demoHtml);

console.log('ok: AutoCut/_harness.html e docs/demo/');
