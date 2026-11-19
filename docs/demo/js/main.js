(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const COLORS = ['#4f9dff', '#ff9f43', '#2ecc71', '#e056fd', '#f6e58d', '#22d3ee', '#ff6b81', '#a3e635'];
  const WIDE_COLOR = '#8a8f98';
  const HOP = 0.05;
  const SETTINGS_KEY = 'autocut.settings.v1';
  const SETTING_IDS = ['mode', 'sens', 'minShot', 'preRoll', 'wideOverlap', 'overlapMin',
    'overlapDb', 'switchSec', 'mouthFps', 'syncWeight', 'mouthMin', 'mouthOverlap', 'ffmpegPath', 'clone', 'markDoubts'];
  const PARALLEL_CAMERAS = 3;   // cameras lidas ao mesmo tempo no modo "um mic so"
  const MAX_DEFAULT = { max: 20, to: 'auto', len: 2 };
  const WIDE_MAX_DEFAULT = { max: 6, to: 'auto', len: 0 };
  // ajustes que exigem reler os arquivos (os outros so recalculam a previa)
  const REANALYZE_IDS = ['mode', 'mouthFps', 'ffmpegPath'];

  let analysis = null;
  let nodeRequire = null;
  let extPath = '';
  let seqInfo = null;
  let rows = [];          // pessoas: { name, enabled, videoTrack, clips, channel?, audioIndex? }
  const cache = {};       // chave -> envelope de audio ou serie da boca
  let inputs = null;      // dados da ultima analise: { mode, speakers, envs | audioEnv+mouths }
  let lastResult = null;
  let maxCfg = {};        // tempo maximo no ar: { <faixa de video>: {max,to,len}, wide: {...} }

  // ---------- infraestrutura ----------
  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
  }

  function extensionPath() {
    let p = decodeURI(window.__adobe_cep__.getSystemPath('extension'));
    if (/^file:\/\/\/[A-Za-z]:/.test(p)) p = p.slice(8);
    else if (p.indexOf('file://') === 0) p = p.slice(7);
    return p;
  }

  function evalHost(code) {
    return new Promise((resolve, reject) => {
      window.__adobe_cep__.evalScript(code, (r) => {
        if (r === 'EvalScript error.') reject(new Error('Erro ao executar o script no Premiere.'));
        else resolve(r);
      });
    });
  }

  async function callHost(fn, arg) {
    const code = arg === undefined ? fn + '()' : fn + '(' + JSON.stringify(arg) + ')';
    const res = JSON.parse(await evalHost(code));
    if (!res.ok) throw new Error(res.error);
    return res;
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (s.maxCfg && typeof s.maxCfg === 'object') maxCfg = s.maxCfg;
      for (const id of SETTING_IDS) {
        if (!(id in s)) continue;
        const el = $(id);
        if (el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id];
      }
    } catch (e) { /* sem armazenamento, usa padroes */ }
  }

  function saveSettings() {
    try {
      const s = {};
      for (const id of SETTING_IDS) { const el = $(id); s[id] = el.type === 'checkbox' ? el.checked : el.value; }
      s.maxCfg = maxCfg;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) { /* ignora */ }
  }

  const num = (id) => parseFloat($(id).value) || 0;
  const mode = () => $('mode').value;
  const wideTrack = () => +$('selWide').value;

  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function invalidate() {
    inputs = null; lastResult = null;
    $('secApply').classList.add('hidden');
    $('progress').textContent = '';
    renderMaxTable();
    drawPreview();
  }

  // ---------- 1. ler sequencia ----------
  async function readSequence() {
    showError('');
    try {
      seqInfo = await callHost('pc_getSequenceInfo');
    } catch (e) {
      showError(e.message);
      return;
    }
    $('seqName').textContent = 'Sequência: ' + seqInfo.name + '  ·  ' + fmtTime(seqInfo.duration) +
      '  ·  ' + seqInfo.videoTracks.length + ' vídeo / ' + seqInfo.audioTracks.length + ' áudio';

    const withAudio = seqInfo.audioTracks.filter((t) => t.clips.length > 0);
    const withVideo = seqInfo.videoTracks.filter((t) => t.clips.length > 0);
    if (!withAudio.length) { showError('Nenhuma faixa de áudio com clipes nesta sequência.'); return; }

    $('selAudio').innerHTML = withAudio.map((t) =>
      `<option value="${t.index}">A${t.index + 1} · ${escapeHtml(t.clips[0].name)}</option>`).join('');

    $('selWide').innerHTML = '<option value="-1">Nenhuma</option>' + seqInfo.videoTracks.map((v) =>
      `<option value="${v.index}">V${v.index + 1}${v.firstClip ? ' · ' + escapeHtml(v.firstClip) : ''}</option>`).join('');

    // palpite: se ha mais cameras que pessoas, a ultima e a aberta
    const people = mode() === 'mouth' ? withVideo.length - 1 : withAudio.length;
    const guessWide = mode() === 'mouth'
      ? (withVideo.length >= 3 ? withVideo[withVideo.length - 1].index : -1)
      : (withAudio.length < withVideo.length ? withVideo[withVideo.length - 1].index : -1);
    $('selWide').value = String(people > 0 ? guessWide : -1);

    buildRows();
    for (const id of ['secSpeakers', 'secSettings', 'secRun']) $(id).classList.remove('hidden');
    invalidate();
  }

  function buildRows() {
    if (!seqInfo) return;
    const m = mode();
    $('rowAudio').classList.toggle('hidden', m !== 'mouth');
    if (m === 'mics') {
      $('hintMode').textContent = 'Cada microfone (faixa de áudio) aponta para a câmera (faixa de vídeo) daquela pessoa.';
      rows = seqInfo.audioTracks.filter((t) => t.clips.length > 0).map((t, i) => ({
        audioIndex: t.index, clips: t.clips, enabled: true, name: 'Pessoa ' + (i + 1), channel: 'mix',
        videoTrack: i < seqInfo.videoTracks.length ? i : 0
      }));
    } else {
      $('hintMode').textContent = 'O áudio diz quando alguém fala; o movimento da boca em cada câmera diz quem. ' +
        'Cada câmera deve mostrar o rosto de uma pessoa.';
      rows = seqInfo.videoTracks.filter((t) => t.clips.length > 0).map((t, i) => ({
        videoTrack: t.index, clips: t.clips, enabled: true, name: 'Pessoa ' + (i + 1)
      }));
    }
    renderRows();
  }

  function renderRows() {
    const m = mode();
    const wide = wideTrack();
    const vOpts = seqInfo.videoTracks.map((v) => `<option value="${v.index}">V${v.index + 1}</option>`).join('');
    $('tblSpeakers').querySelector('thead').innerHTML = m === 'mics'
      ? '<tr><th></th><th>Nome</th><th>Áudio</th><th>Canal</th><th>Câmera</th></tr>'
      : '<tr><th></th><th>Nome</th><th>Câmera</th><th>Arquivo</th></tr>';
    $('tblSpeakers').querySelector('tbody').innerHTML = rows.map((r, i) => {
      const isWide = m === 'mouth' && r.videoTrack === wide;
      const sw = `<span class="swatch" style="background:${isWide ? WIDE_COLOR : COLORS[i % COLORS.length]}"></span>`;
      if (m === 'mics') {
        return `<tr data-i="${i}">
          <td><input type="checkbox" data-k="enabled" ${r.enabled ? 'checked' : ''}>${sw}</td>
          <td><input type="text" data-k="name" value="${escapeHtml(r.name)}"></td>
          <td title="${escapeHtml(r.clips[0].name)}">A${r.audioIndex + 1}</td>
          <td><select data-k="channel"><option value="mix">Mix</option><option value="L">Esq.</option><option value="R">Dir.</option></select></td>
          <td><select data-k="videoTrack">${vOpts}</select></td></tr>`;
      }
      return `<tr data-i="${i}">
        <td><input type="checkbox" data-k="enabled" ${r.enabled && !isWide ? 'checked' : ''} ${isWide ? 'disabled' : ''}>${sw}</td>
        <td>${isWide ? '<span class="muted">câmera aberta</span>' : `<input type="text" data-k="name" value="${escapeHtml(r.name)}">`}</td>
        <td>V${r.videoTrack + 1}</td>
        <td class="muted" title="${escapeHtml(r.clips[0].name)}">${escapeHtml(r.clips[0].name.slice(0, 18))}</td></tr>`;
    }).join('');

    $('tblSpeakers').querySelectorAll('tr[data-i]').forEach((tr) => {
      const r = rows[+tr.dataset.i];
      const ch = tr.querySelector('[data-k=channel]');
      if (ch) ch.value = r.channel;
      const vt = tr.querySelector('[data-k=videoTrack]');
      if (vt) vt.value = String(r.videoTrack);
      tr.querySelectorAll('[data-k]').forEach((el) => {
        el.addEventListener('change', () => {
          const k = el.dataset.k;
          r[k] = el.type === 'checkbox' ? el.checked : (k === 'videoTrack' ? +el.value : el.value);
          if (k === 'name') { renderMaxTable(); drawPreview(); return; }
          if (k === 'videoTrack' && inputs) { rerun(); return; } // so muda o destino dos cortes
          invalidate();
        });
      });
    });
  }

  // ---------- tempo maximo no ar ----------
  function activeSpeakers() {
    if (inputs) return inputs.speakers;
    const wide = wideTrack();
    return rows.filter((r) => r.enabled && !(mode() === 'mouth' && r.videoTrack === wide));
  }

  function camCfg(key) {
    const def = key === 'wide' ? WIDE_MAX_DEFAULT : MAX_DEFAULT;
    if (!maxCfg[key]) maxCfg[key] = Object.assign({}, def);
    return maxCfg[key];
  }

  function renderMaxTable() {
    const tb = $('tblMax').querySelector('tbody');
    if (!seqInfo) { tb.innerHTML = ''; return; }
    const sps = activeSpeakers();
    const wide = wideTrack();
    const seen = new Set();
    const people = sps.filter((r) => !seen.has(r.videoTrack) && seen.add(r.videoTrack));
    const camName = (r) => `V${r.videoTrack + 1} · ${escapeHtml(r.name)}`;
    const items = people.map((r) => ({ key: String(r.videoTrack), label: camName(r), color: COLORS[rows.indexOf(r) % COLORS.length], isWide: false }));
    if (wide >= 0) items.push({ key: 'wide', label: `V${wide + 1} · Aberto`, color: WIDE_COLOR, isWide: true });

    tb.innerHTML = items.map((it) => {
      const c = camCfg(it.key);
      const opts = [`<option value="auto">${it.isWide ? 'Quem estiver falando' : (wide >= 0 ? 'Automático (aberto)' : 'Automático (outra pessoa)')}</option>`];
      if (!it.isWide && wide >= 0) opts.push('<option value="wide">Aberto</option>');
      for (const r of people) if (String(r.videoTrack) !== it.key) opts.push(`<option value="v${r.videoTrack}">${camName(r)}</option>`);
      return `<tr data-key="${it.key}">
        <td><span class="swatch" style="background:${it.color}"></span>${it.label}</td>
        <td><input type="number" data-f="max" min="0" max="600" step="1" value="${c.max}"></td>
        <td><select data-f="to">${opts.join('')}</select></td>
        <td>${it.isWide ? '<span class="muted">—</span>' : `<input type="number" data-f="len" min="0.5" max="20" step="0.5" value="${c.len}">`}</td>
      </tr>`;
    }).join('');

    tb.querySelectorAll('tr[data-key]').forEach((tr) => {
      const c = camCfg(tr.dataset.key);
      const sel = tr.querySelector('[data-f=to]');
      sel.value = [...sel.options].some((o) => o.value === String(c.to)) ? String(c.to) : 'auto';
      tr.querySelectorAll('[data-f]').forEach((el) => {
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          c[el.dataset.f] = el.tagName === 'SELECT' ? el.value : (parseFloat(el.value) || 0);
          saveSettings();
          rerun();
        });
      });
    });
  }

  // converte a tabela para o formato da analise (indices das pessoas analisadas)
  function maxOnAirOptions() {
    const sps = activeSpeakers();
    const idxOfTrack = (t) => sps.findIndex((r) => r.videoTrack === t);
    const out = {};
    sps.forEach((r, i) => {
      const c = camCfg(String(r.videoTrack));
      let to = c.to;
      if (typeof to === 'string' && to[0] === 'v') {
        const j = idxOfTrack(+to.slice(1));
        to = j >= 0 && j !== i ? j : 'auto';
      }
      out[i] = { max: c.max, to: to, len: c.len };
    });
    if (wideTrack() >= 0) {
      const c = camCfg('wide');
      let to = c.to;
      if (typeof to === 'string' && to[0] === 'v') { const j = idxOfTrack(+to.slice(1)); to = j >= 0 ? j : 'auto'; }
      out.wide = { max: c.max, to: to, len: 0 };
    }
    return out;
  }

  // ---------- 2. analisar ----------
  function options() {
    return {
      hop: HOP,
      smooth: 0.3,
      thrFrac: 0.65 - 0.5 * (num('sens') / 100),
      overlapDb: num('overlapDb'),
      wide: wideTrack() >= 0,
      overlapMin: $('wideOverlap').checked ? num('overlapMin') : 1e9,
      minShot: num('minShot'),
      preRoll: num('preRoll'),
      maxShot: 0,
      maxOnAir: maxOnAirOptions(),
      switchSec: num('switchSec') || 0.4,
      syncWeight: Math.max(0, Math.min(1, parseFloat($('syncWeight').value))),
      mouthFps: num('mouthFps') || 10,
      mouthWin: 0.6,
      mouthMin: num('mouthMin'),
      mouthOverlap: num('mouthOverlap')
    };
  }

  function clipsKey(clips) {
    return clips.map((c) => [c.path, c.inPoint, c.start, c.end].join(',')).join(';');
  }

  async function audioEnvelope(ffmpeg, clips, channel, label) {
    const key = 'a|' + channel + '|' + clipsKey(clips);
    if (!cache[key]) {
      const [env] = await analysis.buildEnvelopes(ffmpeg, [{ clips, channel }], seqInfo.duration, HOP, (_, p) => {
        $('progress').textContent = `Lendo áudio ${label}… ${Math.round(p * 100)}%`;
      });
      cache[key] = env;
    }
    return cache[key];
  }

  function mouthEnv(ffmpeg) {
    const fs = nodeRequire('fs'), os = nodeRequire('os'), path = nodeRequire('path');
    const base = path.join(os.homedir(), 'Library', 'Application Support', 'AutoCut');
    const env = {
      python: path.join(base, 'venv', 'bin', 'python'),
      model: path.join(base, 'face_landmarker.task'),
      script: extPath + '/py/mouth.py',
      ffmpeg: ffmpeg
    };
    if (!fs.existsSync(env.python) || !fs.existsSync(env.model)) {
      throw new Error('O modo "áudio só" ainda não está preparado neste computador.\nRode no Terminal:  bash setup_lipsync.sh');
    }
    return env;
  }

  async function analyze() {
    showError('');
    const ffmpeg = analysis.findFfmpeg($('ffmpegPath').value.trim());
    if (!ffmpeg) { showError('ffmpeg não encontrado. Instale (brew install ffmpeg) ou informe o caminho em Avançado.'); return; }
    const m = mode();
    const wide = wideTrack();
    const speakers = rows.filter((r) => r.enabled && !(m === 'mouth' && r.videoTrack === wide));
    if (m === 'mouth' ? speakers.length < 2 : !speakers.length) {
      showError(m === 'mouth' ? 'Marque pelo menos duas câmeras de pessoas.' : 'Marque pelo menos uma pessoa.');
      return;
    }
    const missing = speakers.filter((s) => !s.clips.some((c) => c.path));
    if (missing.length) {
      showError('Não achei o arquivo de mídia de: ' + missing.map((x) => x.name).join(', ') +
        '.\nClipes aninhados (nested) ou mesclados não são suportados — use o arquivo original na faixa.');
      return;
    }

    $('btnAnalyze').disabled = true;
    try {
      if (m === 'mics') {
        const envs = [];
        for (let i = 0; i < speakers.length; i++) {
          envs.push(await audioEnvelope(ffmpeg, speakers[i].clips, speakers[i].channel, `de ${speakers[i].name} (${i + 1}/${speakers.length})`));
        }
        inputs = { mode: m, speakers, envs };
      } else {
        const env = mouthEnv(ffmpeg);
        const aTrack = seqInfo.audioTracks.find((t) => t.index === +$('selAudio').value);
        const audioEnv = await audioEnvelope(ffmpeg, aTrack.clips, $('selAudioCh').value, 'do podcast');
        const fps = num('mouthFps') || 10;
        // le varias cameras ao mesmo tempo
        const mouths = new Array(speakers.length);
        const prog = speakers.map((sp) => (cache['m|' + fps + '|' + clipsKey(sp.clips)] ? 1 : 0));
        const t0 = Date.now();
        const showProg = () => {
          const total = prog.reduce((a, b) => a + b, 0) / prog.length;
          const el = (Date.now() - t0) / 1000;
          const eta = total > 0.02 && total < 1 ? Math.round(el / total - el) : null;
          $('progress').textContent = 'Lendo as bocas: ' +
            speakers.map((sp, i) => `${sp.name} ${Math.round(prog[i] * 100)}%`).join(' · ') +
            (eta !== null ? `\nfalta ~${fmtTime(eta)}` : '');
        };
        let nextIdx = 0;
        const worker = async () => {
          while (nextIdx < speakers.length) {
            const i = nextIdx++;
            const sp = speakers[i];
            const key = 'm|' + fps + '|' + clipsKey(sp.clips);
            if (!cache[key]) {
              const [series] = await analysis.buildMouthTracks(env, [sp], seqInfo.duration, fps, (_, p) => {
                prog[i] = p; showProg();
              });
              cache[key] = series;
            }
            prog[i] = 1; showProg();
            mouths[i] = cache[key];
          }
        };
        showProg();
        await Promise.all(Array.from({ length: Math.min(PARALLEL_CAMERAS, speakers.length) }, worker));
        const noFace = mouths.map((s, i) => {
          const o = s.open || s;
          let n = 0; for (let k = 0; k < o.length; k++) if (o[k] === o[k]) n++;
          return { name: speakers[i].name, pct: n / Math.max(1, o.length) };
        }).filter((x) => x.pct < 0.5);
        if (noFace.length) {
          showError('Rosto encontrado em menos da metade do vídeo de: ' +
            noFace.map((x) => `${x.name} (${Math.round(x.pct * 100)}%)`).join(', ') + '. Os cortes dessas câmeras podem falhar.');
        }
        inputs = { mode: m, speakers, audioEnv, mouths };
      }
      $('progress').textContent = 'Análise pronta. Ajuste os controles e veja a prévia mudar.';
      renderMaxTable();
      rerun();
      $('secApply').classList.remove('hidden');
    } catch (e) {
      showError(e.message);
      $('progress').textContent = '';
    } finally {
      $('btnAnalyze').disabled = false;
    }
  }

  function rerun() {
    if (!inputs) return;
    const o = options();
    lastResult = inputs.mode === 'mics'
      ? analysis.decide(inputs.envs, o)
      : analysis.decideMouth(inputs.audioEnv, inputs.mouths, o);
    drawPreview();
  }

  function speakerColor(i) {
    return COLORS[rows.indexOf(inputs.speakers[i]) % COLORS.length];
  }

  function labelColor(label) {
    return label === analysis.WIDE ? WIDE_COLOR : speakerColor(label);
  }

  function drawPreview() {
    const cv = $('preview');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 360, h = 90;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    $('legend').innerHTML = '';
    $('stats').textContent = '';
    if (!lastResult || !seqInfo || !inputs) return;

    const dur = seqInfo.duration;
    const x = (t) => (t / dur) * w;
    for (const sg of lastResult.segments) {
      ctx.fillStyle = labelColor(sg.label);
      ctx.fillRect(x(sg.start), 0, Math.max(1, x(sg.end) - x(sg.start)), 34);
    }
    const S = inputs.speakers.length;
    const laneH = Math.max(4, Math.floor((h - 42) / S));
    const act = lastResult.activity;
    for (let s = 0; s < S; s++) {
      ctx.fillStyle = speakerColor(s);
      const y = 42 + s * laneH;
      for (let f = 0; f < act.length; f++) {
        if (act[f] === s || act[f] === analysis.OVERLAP) ctx.fillRect(x(f * HOP), y, Math.max(1, x(HOP)), laneH - 2);
      }
    }

    ctx.fillStyle = '#ff4d4f';
    for (const d of lastResult.doubts || []) {
      const dx = x(d.time);
      ctx.beginPath(); ctx.moveTo(dx - 4, 0); ctx.lineTo(dx + 4, 0); ctx.lineTo(dx, 7); ctx.closePath(); ctx.fill();
      ctx.fillRect(dx, 0, Math.max(1, x(d.duration)), 3);
    }

    const sec = lastResult.stats.seconds;
    const items = inputs.speakers.map((sp, i) => ({ color: speakerColor(i), name: sp.name, t: sec[i] || 0 }));
    if (sec[analysis.WIDE]) items.push({ color: WIDE_COLOR, name: 'Aberto', t: sec[analysis.WIDE] });
    $('legend').innerHTML = items.map((it) =>
      `<span><span class="swatch" style="background:${it.color}"></span>${escapeHtml(it.name)} ${Math.round(100 * it.t / dur)}%</span>`).join('');
    const nd = (lastResult.doubts || []).length;
    $('stats').textContent = `${lastResult.stats.cuts} cortes · média de ${(dur / Math.max(1, lastResult.segments.length)).toFixed(1)} s por plano` +
      (nd ? `\n▼ ${nd} trecho(s) para conferir: ` + lastResult.doubts.slice(0, 6).map((d) => fmtTime(d.time)).join(', ') + (nd > 6 ? '…' : '') : '');
  }

  // ---------- 3. aplicar ----------
  function buildPayload() {
    const fd = seqInfo.frameDur;
    const wide = wideTrack();
    const trackOf = (label) => (label === analysis.WIDE ? wide : inputs.speakers[label].videoTrack);

    const segs = [];
    for (const sg of lastResult.segments) {
      const s = Math.round(sg.start / fd), e = Math.round(sg.end / fd), track = trackOf(sg.label);
      if (e <= s) continue;
      const last = segs[segs.length - 1];
      if (last && last.track === track) last.e = e;
      else segs.push({ s: last ? last.e : s, e: e, track: track });
    }
    if (segs.length) { segs[0].s = 0; segs[segs.length - 1].e = Math.ceil(seqInfo.duration / fd) + 1; }

    const tracks = [...new Set(segs.map((s) => s.track))].sort((a, b) => a - b);
    return {
      clone: $('clone').checked,
      cloneName: seqInfo.name + ' - AutoCut',
      tracks: tracks,
      cutFrames: segs.slice(1).map((s) => s.s),
      segments: segs,
      markers: $('markDoubts').checked ? (lastResult.doubts || []).map((d) => ({
        t: d.time,
        name: 'AutoCut: conferir',
        comment: `${inputs.speakers[d.talker].name} parece falar por ${d.duration.toFixed(1)} s, mas a câmera está em ${inputs.speakers[d.onAir].name}.`
      })) : []
    };
  }

  async function apply() {
    showError('');
    if (!lastResult) return;
    const payload = buildPayload();
    if (payload.tracks.length < 2) { showError('Só uma câmera foi usada — confira o mapeamento das câmeras.'); return; }
    $('btnApply').disabled = true;
    $('applyMsg').textContent = `Aplicando ${payload.cutFrames.length} cortes em ${payload.tracks.length} faixas… (o Premiere pode travar alguns segundos)`;
    try {
      const res = await callHost('pc_applyCuts', JSON.stringify(payload));
      $('applyMsg').innerHTML = `<span class="ok">Pronto!</span> Sequência "${escapeHtml(res.sequence)}": ${res.razors} cortes, ${res.toggled} clipes desativados/ativados` +
        (res.markers ? `, ${res.markers} marcador(es) para conferir.` : '.');
    } catch (e) {
      $('applyMsg').textContent = '';
      showError(e.message);
    } finally {
      $('btnApply').disabled = false;
    }
  }

  // ---------- inicio ----------
  function init() {
    loadSettings();
    $('vSens').textContent = $('sens').value;
    try {
      nodeRequire = typeof require === 'function' ? require : (window.cep_node && window.cep_node.require);
      extPath = extensionPath();
      analysis = nodeRequire(extPath + '/js/analysis.js');
    } catch (e) {
      showError('Não consegui carregar o Node.js do painel: ' + e.message);
      return;
    }
    $('btnRead').addEventListener('click', readSequence);
    $('btnAnalyze').addEventListener('click', analyze);
    $('btnApply').addEventListener('click', apply);
    $('selWide').addEventListener('change', () => {
      if (mode() === 'mouth') { renderRows(); invalidate(); } else { renderMaxTable(); rerun(); }
    });
    $('selAudio').addEventListener('change', invalidate);
    $('selAudioCh').addEventListener('change', invalidate);
    for (const id of SETTING_IDS) {
      const handler = () => {
        if (id === 'sens') $('vSens').textContent = $('sens').value;
        saveSettings();
        if (id === 'mode') { buildRows(); invalidate(); } else if (REANALYZE_IDS.includes(id)) invalidate(); else rerun();
      };
      $(id).addEventListener($(id).tagName === 'SELECT' || $(id).type === 'checkbox' ? 'change' : 'input', handler);
    }
    window.addEventListener('resize', drawPreview);
  }

  init();
})();
