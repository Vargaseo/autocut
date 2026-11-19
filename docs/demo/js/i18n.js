// Textos do painel nos dois idiomas.
// Na interface: elementos com data-i18n="chave" recebem o texto.
// No código: t('chave', { var: valor }) — os lugares de {var} são trocados.
(function (root) {
  'use strict';

  var STR = {
    pt: {
      'lang.name': 'Português',
      'app.sub': 'Troca de câmera automática por quem fala',

      // passos
      'btn.read': '1. Ler sequência ativa',
      'btn.analyze': '2. Analisar áudio',
      'btn.apply': '3. Aplicar cortes na timeline',

      // pessoas
      'people.title': 'Pessoas',
      'people.recording': 'Gravação',
      'mode.mouth': 'Um microfone só (leitura da boca)',
      'mode.mics': 'Um microfone por pessoa',
      'people.audio': 'Áudio do podcast',
      'ch.mix': 'Mix',
      'ch.L': 'Esq.',
      'ch.R': 'Dir.',
      'people.wide': 'Câmera aberta (wide)',
      'wide.none': 'Nenhuma',
      'hint.mics': 'Cada microfone (faixa de áudio) aponta para a câmera (faixa de vídeo) daquela pessoa.',
      'hint.mouth': 'O áudio diz quando alguém fala; o movimento da boca em cada câmera diz quem. Cada câmera deve mostrar o rosto de uma pessoa.',
      'th.name': 'Nome',
      'th.audio': 'Áudio',
      'th.channel': 'Canal',
      'th.camera': 'Câmera',
      'th.file': 'Arquivo',
      'row.wideCam': 'câmera aberta',
      'person.n': 'Pessoa {n}',

      // ajustes
      'settings.title': 'Ajustes',
      'set.sens': 'Sensibilidade',
      'set.minShot': 'Duração mínima do plano (s)',
      'set.preRoll': 'Antecipar o corte (s)',
      'set.wideOverlap': 'Plano aberto quando falam juntos',
      'set.overlapMin': '…se durar pelo menos (s)',
      'maxair.title': 'Tempo máximo no ar',
      'maxair.hint': 'Quando uma câmera passa do máximo, o plugin procura uma pausa na fala e corta para outra câmera por alguns segundos. 0 = sem limite.',
      'maxair.th.cam': 'Câmera',
      'maxair.th.max': 'Máx. (s)',
      'maxair.th.to': 'Depois corta para',
      'maxair.th.len': 'Por (s)',
      'maxair.auto.wide': 'Automático (aberto)',
      'maxair.auto.person': 'Automático (outra pessoa)',
      'maxair.auto.speaker': 'Quem estiver falando',
      'maxair.wide': 'Aberto',
      'maxair.wideRow': 'Aberto',

      'adv.title': 'Avançado',
      'adv.switchSec': 'Evidência para trocar de câmera (s)',
      'adv.overlapDb': 'Diferença p/ considerar fala simultânea (dB)',
      'adv.mouthFps': 'Leitura da boca: quadros por segundo',
      'adv.syncWeight': 'Leitura da boca: peso da sincronia boca-voz',
      'adv.syncOff': '0 = desligado',
      'adv.mouthMin': 'Leitura da boca: movimento mínimo',
      'adv.mouthOverlap': 'Leitura da boca: semelhança p/ fala simultânea',
      'adv.ffmpeg': 'Caminho do ffmpeg',
      'adv.ffmpegAuto': 'detectar automaticamente',

      // aplicar
      'apply.clone': 'Duplicar a sequência antes de cortar (recomendado)',
      'apply.mark': 'Marcar trechos duvidosos (marcadores vermelhos)',

      // mensagens
      'msg.seq': 'Sequência: {name}  ·  {dur}  ·  {v} vídeo / {a} áudio',
      'msg.readingAudio': 'Lendo áudio {label}… {pct}%',
      'msg.audioOf': 'de {name} ({i}/{n})',
      'msg.audioPodcast': 'do podcast',
      'msg.readingMouths': 'Lendo as bocas: ',
      'msg.eta': 'falta ~{time}',
      'msg.ready': 'Análise pronta. Ajuste os controles e veja a prévia mudar.',
      'msg.applying': 'Aplicando {cuts} cortes em {tracks} faixas… (o Premiere pode travar alguns segundos)',
      'msg.done': 'Pronto!',
      'msg.doneDetail': ' Sequência "{seq}": {razors} cortes, {toggled} clipes desativados/ativados',
      'msg.doneMarkers': ', {n} marcador(es) para conferir.',
      'stats.cuts': '{cuts} cortes · média de {avg} s por plano',
      'stats.doubts': '▼ {n} trecho(s) para conferir: ',
      'legend.wide': 'Aberto',
      'marker.name': 'AutoCut: conferir',
      'marker.comment': '{talker} parece falar por {dur} s, mas a câmera está em {onAir}.',

      // erros
      'err.noSeq': 'Nenhuma sequencia ativa. Abra a sequencia do podcast na timeline.',
      'err.noAudioTrack': 'Nenhuma faixa de áudio com clipes nesta sequência.',
      'err.pickOne': 'Marque pelo menos uma pessoa.',
      'err.pickTwo': 'Marque pelo menos duas câmeras de pessoas.',
      'err.noMedia': 'Não achei o arquivo de mídia de: {names}.\nClipes aninhados (nested) ou mesclados não são suportados — use o arquivo original na faixa.',
      'err.noFfmpeg': 'ffmpeg não encontrado. Instale (brew install ffmpeg) ou informe o caminho em Avançado.',
      'err.noLipsync': 'O modo "um microfone só" ainda não está preparado neste computador.\nRode no Terminal:  bash setup_lipsync.sh',
      'err.noFace': 'Quase nenhum rosto encontrado no vídeo de: {list}. Confira se a câmera certa está mapeada para essa pessoa.',
      'info.hidden': 'Rosto escondido em parte do vídeo de: {list}. Nesses trechos o AutoCut deduz quem fala pelas outras câmeras.',
      'info.profile': 'Muito de perfil: {list}. A medição é feita no eixo do rosto, então o giro não atrapalha.',
      'err.oneCamera': 'Só uma câmera foi usada — confira o mapeamento das câmeras.',
      'err.node': 'Não consegui carregar o Node.js do painel: {msg}',
      'err.evalScript': 'Erro ao executar o script no Premiere.',
      'err.trackMissing': 'A faixa V{n} nao existe nesta sequencia.',
      'err.trackLocked': 'A faixa V{n} esta travada (cadeado). Destrave e tente de novo.',
      'err.cloneFailed': 'Nao consegui duplicar e abrir a sequencia. Desmarque "Duplicar sequencia" ou duplique manualmente.',
      'err.razor': 'O corte automatico (razor) nao funcionou nesta versao do Premiere.',
      'err.qe': 'QE: sequencia ativa nao encontrada.',
      'err.python': 'Não consegui rodar o Python do modo de um microfone só ({msg}). Rode setup_lipsync.sh.',
      'err.mouthFailed': 'Leitura da boca falhou: {msg}',
      'err.mouthBadJson': 'Resposta inválida do leitor de boca: {msg}',
      'err.fileMissing': 'arquivo não encontrado: {file}',
      'err.videoUnreadable': 'não consegui ler o vídeo de {file} ({msg})',
      'err.ffmpegRead': 'ffmpeg não conseguiu ler "{file}": {msg}'
    },

    en: {
      'lang.name': 'English',
      'app.sub': 'Automatic camera switching, following who speaks',

      'btn.read': '1. Read active sequence',
      'btn.analyze': '2. Analyse audio',
      'btn.apply': '3. Apply cuts to the timeline',

      'people.title': 'People',
      'people.recording': 'Recording',
      'mode.mouth': 'A single microphone (mouth reading)',
      'mode.mics': 'One microphone per person',
      'people.audio': 'Podcast audio',
      'ch.mix': 'Mix',
      'ch.L': 'Left',
      'ch.R': 'Right',
      'people.wide': 'Wide camera',
      'wide.none': 'None',
      'hint.mics': 'Each microphone (audio track) points to that person’s camera (video track).',
      'hint.mouth': 'The audio says when someone is talking; the mouth movement in each camera says who. Each camera should show one person’s face.',
      'th.name': 'Name',
      'th.audio': 'Audio',
      'th.channel': 'Channel',
      'th.camera': 'Camera',
      'th.file': 'File',
      'row.wideCam': 'wide camera',
      'person.n': 'Person {n}',

      'settings.title': 'Settings',
      'set.sens': 'Sensitivity',
      'set.minShot': 'Minimum shot length (s)',
      'set.preRoll': 'Cut this early (s)',
      'set.wideOverlap': 'Wide shot when people talk over each other',
      'set.overlapMin': '…if it lasts at least (s)',
      'maxair.title': 'Maximum time on air',
      'maxair.hint': 'When a camera runs past its limit, the plugin looks for a pause in the speech and cuts to another camera for a few seconds. 0 = no limit.',
      'maxair.th.cam': 'Camera',
      'maxair.th.max': 'Max. (s)',
      'maxair.th.to': 'Then cut to',
      'maxair.th.len': 'For (s)',
      'maxair.auto.wide': 'Automatic (wide)',
      'maxair.auto.person': 'Automatic (other person)',
      'maxair.auto.speaker': 'Whoever is speaking',
      'maxair.wide': 'Wide',
      'maxair.wideRow': 'Wide',

      'adv.title': 'Advanced',
      'adv.switchSec': 'Evidence needed to switch camera (s)',
      'adv.overlapDb': 'Gap to count as people talking together (dB)',
      'adv.mouthFps': 'Mouth reading: frames per second',
      'adv.syncWeight': 'Mouth reading: weight of mouth-voice sync',
      'adv.syncOff': '0 = off',
      'adv.mouthMin': 'Mouth reading: minimum movement',
      'adv.mouthOverlap': 'Mouth reading: similarity for talking together',
      'adv.ffmpeg': 'Path to ffmpeg',
      'adv.ffmpegAuto': 'detect automatically',

      'apply.clone': 'Duplicate the sequence before cutting (recommended)',
      'apply.mark': 'Mark doubtful spots (red markers)',

      'msg.seq': 'Sequence: {name}  ·  {dur}  ·  {v} video / {a} audio',
      'msg.readingAudio': 'Reading audio {label}… {pct}%',
      'msg.audioOf': 'from {name} ({i}/{n})',
      'msg.audioPodcast': 'from the podcast',
      'msg.readingMouths': 'Reading mouths: ',
      'msg.eta': '~{time} left',
      'msg.ready': 'Analysis ready. Change the settings and watch the preview update.',
      'msg.applying': 'Applying {cuts} cuts across {tracks} tracks… (Premiere may freeze for a few seconds)',
      'msg.done': 'Done!',
      'msg.doneDetail': ' Sequence "{seq}": {razors} cuts, {toggled} clips enabled/disabled',
      'msg.doneMarkers': ', {n} marker(s) to review.',
      'stats.cuts': '{cuts} cuts · {avg} s per shot on average',
      'stats.doubts': '▼ {n} spot(s) to review: ',
      'legend.wide': 'Wide',
      'marker.name': 'AutoCut: review',
      'marker.comment': '{talker} seems to speak for {dur} s, but the camera is on {onAir}.',

      'err.noSeq': 'No active sequence. Open your podcast sequence in the timeline.',
      'err.noAudioTrack': 'No audio track with clips in this sequence.',
      'err.pickOne': 'Tick at least one person.',
      'err.pickTwo': 'Tick at least two people’s cameras.',
      'err.noMedia': 'I could not find the media file for: {names}.\nNested or merged clips are not supported — use the original file on the track.',
      'err.noFfmpeg': 'ffmpeg not found. Install it (brew install ffmpeg) or set the path under Advanced.',
      'err.noLipsync': 'The "single microphone" mode is not set up on this computer yet.\nRun in Terminal:  bash setup_lipsync.sh',
      'err.noFace': 'Almost no face found in the video for: {list}. Check that the right camera is mapped to that person.',
      'info.hidden': 'Face hidden for part of the video for: {list}. In those stretches AutoCut works out the speaker from the other cameras.',
      'info.profile': 'Often in profile: {list}. Measurements are taken along the face’s own axis, so turning does not throw it off.',
      'err.oneCamera': 'Only one camera was used — check the camera mapping.',
      'err.node': 'Could not load the panel’s Node.js: {msg}',
      'err.evalScript': 'Error running the script inside Premiere.',
      'err.trackMissing': 'Track V{n} does not exist in this sequence.',
      'err.trackLocked': 'Track V{n} is locked. Unlock it and try again.',
      'err.cloneFailed': 'Could not duplicate and open the sequence. Untick "Duplicate the sequence" or duplicate it manually.',
      'err.razor': 'The automatic cut (razor) did not work in this version of Premiere.',
      'err.qe': 'QE: active sequence not found.',
      'err.python': 'Could not run the Python for the single-microphone mode ({msg}). Run setup_lipsync.sh.',
      'err.mouthFailed': 'Mouth reading failed: {msg}',
      'err.mouthBadJson': 'Invalid answer from the mouth reader: {msg}',
      'err.fileMissing': 'file not found: {file}',
      'err.videoUnreadable': 'could not read the video of {file} ({msg})',
      'err.ffmpegRead': 'ffmpeg could not read "{file}": {msg}'
    }
  };

  var lang = 'pt';

  function t(key, vars) {
    var s = (STR[lang] && STR[lang][key]) || STR.pt[key] || key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
      });
    }
    return s;
  }

  // Traduz um erro vindo do analysis.js / host.jsx: usa e.code quando existir.
  function tErr(e) {
    if (e && e.code && (STR[lang][e.code] || STR.pt[e.code])) return t(e.code, e.vars || {});
    return (e && e.message) || String(e);
  }

  function setLang(l) {
    lang = STR[l] ? l : 'pt';
    return lang;
  }
  function getLang() { return lang; }

  function detect() {
    try {
      var n = (navigator.language || 'pt').toLowerCase();
      return n.indexOf('pt') === 0 ? 'pt' : 'en';
    } catch (e) { return 'pt'; }
  }

  // Aplica aos elementos marcados: data-i18n (texto), data-i18n-ph (placeholder)
  function applyStatic(doc) {
    doc.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    var nodes = doc.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    var phs = doc.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < phs.length; j++) phs[j].placeholder = t(phs[j].getAttribute('data-i18n-ph'));
  }

  root.AutoCutI18n = { t: t, tErr: tErr, setLang: setLang, getLang: getLang, detect: detect, applyStatic: applyStatic, STR: STR };
})(typeof window !== 'undefined' ? window : this);
