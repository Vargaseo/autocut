// Textos do site, nos dois idiomas. Mexa aqui e rode `node tools/build-site.js`.
'use strict';

const EMAIL = 'vvargaseo@gmail.com';
const REPO = 'https://github.com/Vargaseo/autocut';

const pt = {
  lang: 'pt-BR',
  label: 'Português',
  dir: '',                       // docs/index.html
  other: { href: 'en/', label: 'EN', title: 'Read in English' },
  demoHref: 'demo/',
  title: 'AutoCut — troca de câmera automática para podcast',
  desc: 'Plugin para Adobe Premiere Pro que troca de câmera automaticamente conforme quem está falando no podcast.',
  ogDesc: 'Troca de câmera automática para podcast no Premiere Pro.',

  hero: {
    l1: 'A câmera vai sozinha',
    l2: 'para quem está falando.',
    tagline: 'Painel para o Adobe Premiere Pro que escuta o podcast, descobre quem fala em cada momento e corta a timeline para a câmera certa. Funciona até com um microfone só para todo mundo.',
    btnDemo: 'Ver o painel funcionando',
    btnCode: 'Código no GitHub',
    btnContact: 'Falar comigo'
  },
  stripAlt: 'Linha do tempo: a câmera alterna entre as duas pessoas e o plano aberto, acompanhando quem fala.',
  stripCaption: 'Em cima, a câmera que fica no ar. Embaixo, quem estava falando — é assim que a prévia aparece no painel.',

  s1: {
    h: 'O trabalho que ele tira de você',
    lead: 'Editar podcast de várias câmeras é quase todo repetição: ouvir, achar quem fala, cortar, repetir por uma hora de gravação.',
    cards: [
      { tag: 'Corta', h: 'Troca por quem fala', p: 'Cada pessoa tem a sua câmera. O AutoCut corta para ela quando começa a falar — e antecipa um pouco o corte, como um editor faria.' },
      { tag: 'Respira', h: 'Usa o plano aberto', p: 'Quando duas pessoas falam juntas, ou quando um close já está demorando, ele vai para a câmera aberta.' },
      { tag: 'Avisa', h: 'Marca o que está em dúvida', p: 'Se alguém parece falar com a câmera em outra pessoa, ele deixa um marcador vermelho na sequência para você conferir só aquele ponto.' },
      { tag: 'Enxerga', h: 'Acha o rosto no plano aberto', p: 'Ele procura o rosto por partes do quadro e depois acompanha só aquele pedaço. Sem isso, num plano aberto o rosto fica pequeno demais para o detector e simplesmente não é encontrado.' },
      { tag: 'Fala a sua língua', h: 'Português e inglês', p: 'O painel inteiro troca de idioma num seletor no canto, inclusive as mensagens de erro e os marcadores que ele deixa na sequência.' }
    ]
  },
  s2: {
    h: 'Dois jeitos de gravar',
    lead: 'Escolha no painel como o seu podcast foi gravado. O resto é igual nos dois.',
    cards: [
      { pick: true, tag: 'Modo padrão', h: 'Um microfone só', p: 'Um áudio para todo mundo. O som diz <em>quando</em> alguém fala; o movimento da boca em cada câmera diz <em>quem</em>. Ele mede lábios, mandíbula e queixo — e, principalmente, se esse movimento está no <strong>ritmo das sílabas da voz</strong>. Quem só reage, sorri ou ri sem som mexe a boca fora desse ritmo e não rouba a câmera.' },
      { tag: 'Alternativo', h: 'Um microfone por pessoa', p: 'Cada pessoa no seu próprio canal de áudio. Ele aprende quanto da voz de cada um <strong>vaza nos outros microfones</strong> e desconta isso antes de decidir — então o apresentador falando alto não leva a câmera quando o convidado é quem está falando.' }
    ]
  },
  s3: {
    h: 'Por que ele não fica preso numa pessoa',
    lead: 'O erro mais chato nesse tipo de corte automático é a câmera grudar no apresentador enquanto o convidado fala. O AutoCut foi feito em volta disso.',
    items: [
      '<strong>Decide a conversa inteira de uma vez.</strong> Em vez de olhar instante a instante e, na dúvida, manter a câmera anterior, ele escolhe a sequência de cortes que melhor explica a conversa toda, com um custo para cada troca.',
      '<strong>Falas curtas vão para quem tem mais evidência</strong>, e não automaticamente para quem já estava no ar.',
      '<strong>Um “aham” seguido de silêncio não vira plano.</strong> Ele conta o tempo de fala real dentro do trecho, não só a duração.',
      '<strong>Cabeça virada não engana mais.</strong> As medidas da boca são tomadas no eixo do próprio rosto, não na largura da boca: virar de perfil encolhe a largura e isso fazia a pessoa “parecer falar” só por mexer a cabeça.',
      '<strong>O que ficou duvidoso ele entrega marcado</strong>, em vez de esconder o erro no meio de uma hora de vídeo.'
    ]
  },
  s4: {
    h: 'Tempo máximo no ar',
    lead: 'Uma tabela no painel, uma linha por câmera. Quando uma câmera passa do tempo, o AutoCut procura uma pausa na fala e corta para outra por alguns segundos.',
    th: ['Câmera', 'Máx.', 'Depois corta para', 'Por'],
    rows: [
      ['V1 · Apresentador', '20 s', 'Automático (aberto)', '2 s'],
      ['V2 · Convidado', '25 s', 'V1 · Apresentador', '1,5 s'],
      ['V3 · Aberto', '6 s', 'Quem estiver falando', '—']
    ],
    note: '<strong>Cortar para a outra pessoa</strong> é o jeito de inserir aquela reação de quem escuta no meio de um monólogo longo. <code>0</code> deixa a câmera sem limite.'
  },
  s5: {
    h: 'Instalar',
    lead: 'macOS, Premiere Pro 2022 ou mais novo. Precisa do <a href="https://ffmpeg.org/">ffmpeg</a> — e, para o modo de um microfone só, de um Python isolado com o MediaPipe (cerca de 300 MB, instalado numa pasta própria).',
    steps: [
      { h: 'Baixe o projeto', code: 'git clone https://github.com/Vargaseo/autocut.git\ncd autocut' },
      { h: 'Instale o painel', p: 'Copia o painel para a pasta de extensões do Premiere e libera painéis sem assinatura da Adobe.', code: 'bash install.sh' },
      { h: 'Prepare a leitura da boca', p: 'Só para o modo de um microfone só. Cria o Python isolado e baixa o modelo de rosto.', code: 'bash setup_lipsync.sh' },
      { h: 'Abra no Premiere', p: 'Feche e abra o Premiere, depois vá em <strong>Janela › Extensões (legado) › AutoCut</strong>.' }
    ]
  },
  s6: {
    h: 'Como usar',
    steps: [
      { h: 'Ler a sequência', p: 'O painel lista as faixas. Você confere a câmera de cada pessoa e qual é a câmera aberta.' },
      { h: 'Analisar', p: 'Ele lê os arquivos e mostra a prévia colorida dos planos. Daí em diante, mexer nos ajustes atualiza a prévia na hora, sem reanalisar.' },
      { h: 'Aplicar os cortes', p: 'Ele duplica a sequência e corta na cópia. As câmeras fora do ar ficam <strong>desativadas, não apagadas</strong> — para mudar um corte à mão, é só ativar ou desativar o clipe com <code>Shift+E</code>.' }
    ]
  },
  s7: {
    h: 'O que ele ainda não faz',
    items: [
      '<strong>Não lê clipes aninhados (nested) nem mesclados.</strong> Use os arquivos originais nas faixas.',
      '<strong>Rosto de costas ou totalmente coberto não é lido.</strong> Nesses trechos ele deduz quem fala pelas outras câmeras, o que funciona bem com duas pessoas e fica mais frágil com quatro. De perfil ele lê normalmente.',
      '<strong>Não suporta áudio com velocidade alterada</strong>, e as faixas de vídeo precisam estar destravadas.',
      '<strong>Não tem assinatura digital da Adobe.</strong> O instalador liga o <code>PlayerDebugMode</code>, o modo do Premiere que aceita painéis sem assinatura — e ele vale para todos os painéis, não só este. Dá para desligar depois com <code>defaults write com.adobe.CSXS.12 PlayerDebugMode 0</code>.',
      '<strong>Testado só no macOS.</strong> O painel é feito em tecnologia que roda nos dois sistemas, mas ninguém rodou no Windows ainda.'
    ],
    note2: 'O painel não acessa a internet: ele lê os arquivos da sua sequência com o ffmpeg e o Python na sua própria máquina, e não envia nada para lugar nenhum.',
    note: '<strong>Em desenvolvimento.</strong> A lógica de decisão é verificada por testes automáticos, mas com áudio e vídeo simulados — ainda não foi medida em gravações reais. Trate os primeiros cortes como um rascunho e confira os marcadores vermelhos.'
  },
  contact: {
    h: 'Falar comigo',
    p: 'Tem uma ideia de melhoria, achou um caso em que ele erra, ou quer fazer uma proposta pelo projeto? Me escreva — respondo pessoalmente.',
    small: 'Se for um erro de corte, ajuda muito dizer o modo usado (um microfone só ou um por pessoa) e o minuto aproximado do trecho. Problemas técnicos também podem ir para as <a href="' + REPO + '/issues">issues do GitHub</a>.'
  },
  footer: {
    links: [
      { href: REPO, t: 'GitHub' },
      { href: 'demo/', t: 'Demonstração' },
      { href: REPO + '/issues', t: 'Relatar um problema' },
      { href: REPO + '/blob/main/LICENSE', t: 'Licença MIT' }
    ],
    note: 'AutoCut · painel para Adobe Premiere Pro. Não é um produto da Adobe.'
  }
};

const en = {
  lang: 'en',
  label: 'English',
  dir: 'en/',                    // docs/en/index.html
  other: { href: '../', label: 'PT', title: 'Ler em português' },
  demoHref: '../demo/?lang=en',
  title: 'AutoCut — automatic camera switching for podcasts',
  desc: 'Adobe Premiere Pro panel that switches cameras automatically, following whoever is speaking in your podcast.',
  ogDesc: 'Automatic camera switching for podcasts in Premiere Pro.',

  hero: {
    l1: 'The camera follows',
    l2: 'whoever is speaking.',
    tagline: 'An Adobe Premiere Pro panel that listens to your podcast, works out who is talking at each moment and cuts the timeline to the right camera. It works even with a single microphone for everyone.',
    btnDemo: 'See the panel running',
    btnCode: 'Code on GitHub',
    btnContact: 'Get in touch'
  },
  stripAlt: 'Timeline: the camera alternates between the two people and the wide shot, following who is speaking.',
  stripCaption: 'On top, the camera that is on air. Below, who was speaking — this is how the preview looks inside the panel.',

  s1: {
    h: 'The work it takes off your hands',
    lead: 'Editing a multi-camera podcast is mostly repetition: listen, find who is talking, cut, repeat for an hour of footage.',
    cards: [
      { tag: 'Cuts', h: 'Switches to the speaker', p: 'Each person has their own camera. AutoCut cuts to them when they start talking — and lands the cut slightly early, the way an editor would.' },
      { tag: 'Breathes', h: 'Uses the wide shot', p: 'When two people talk over each other, or when a close-up has been held too long, it goes to the wide camera.' },
      { tag: 'Flags', h: 'Marks what it is unsure about', p: 'If someone seems to be talking while the camera is on another person, it leaves a red marker on the sequence so you only review that spot.' },
      { tag: 'Sees', h: 'Finds the face in a wide shot', p: 'It searches the frame in pieces and then tracks just that piece. Without this, in a wide shot the face is simply too small for the detector to find at all.' },
      { tag: 'Speaks your language', h: 'English and Portuguese', p: 'The whole panel switches language from a selector in the corner — error messages and the markers it leaves on the sequence included.' }
    ]
  },
  s2: {
    h: 'Two ways to record',
    lead: 'Pick in the panel how your podcast was recorded. Everything else works the same.',
    cards: [
      { pick: true, tag: 'Default mode', h: 'A single microphone', p: 'One audio track for everyone. The sound tells it <em>when</em> someone speaks; the mouth movement in each camera tells it <em>who</em>. It measures lips, jaw and chin — and, above all, whether that movement follows the <strong>rhythm of the syllables in the voice</strong>. Someone who is only reacting, smiling or laughing silently moves their mouth out of that rhythm and does not steal the camera.' },
      { tag: 'Alternative', h: 'One microphone per person', p: 'Each person on their own audio channel. It learns how much of each voice <strong>bleeds into the other microphones</strong> and subtracts that before deciding — so a loud host does not take the camera while the guest is the one talking.' }
    ]
  },
  s3: {
    h: 'Why it does not get stuck on one person',
    lead: 'The most annoying failure in automatic switching is the camera sticking to the host while the guest talks. AutoCut was built around that problem.',
    items: [
      '<strong>It decides the whole conversation at once.</strong> Instead of judging moment by moment and holding the previous camera whenever it is unsure, it picks the sequence of cuts that best explains the entire conversation, with a cost for every switch.',
      '<strong>Short lines go to whoever has the stronger evidence</strong>, not automatically to whoever was already on air.',
      '<strong>An “uh-huh” followed by silence does not become a shot.</strong> It counts actual speaking time inside the segment, not just its length.',
      '<strong>A turned head no longer fools it.</strong> Mouth measurements are taken along the face’s own axis rather than across the mouth’s width: turning sideways shrinks that width, which used to make someone “look like they were talking” just by moving their head.',
      '<strong>Whatever stayed doubtful is handed to you marked</strong>, instead of hiding the mistake inside an hour of video.'
    ]
  },
  s4: {
    h: 'Maximum time on air',
    lead: 'A table in the panel, one row per camera. When a camera runs past its limit, AutoCut looks for a pause in the speech and cuts away for a few seconds.',
    th: ['Camera', 'Max.', 'Then cut to', 'For'],
    rows: [
      ['V1 · Host', '20 s', 'Automatic (wide)', '2 s'],
      ['V2 · Guest', '25 s', 'V1 · Host', '1.5 s'],
      ['V3 · Wide', '6 s', 'Whoever is speaking', '—']
    ],
    note: '<strong>Cutting to the other person</strong> is how you drop in that listener reaction in the middle of a long monologue. <code>0</code> leaves the camera with no limit.'
  },
  s5: {
    h: 'Install',
    lead: 'macOS, Premiere Pro 2022 or newer. It needs <a href="https://ffmpeg.org/">ffmpeg</a> — and, for the single-microphone mode, an isolated Python with MediaPipe (around 300 MB, installed in its own folder).',
    steps: [
      { h: 'Get the project', code: 'git clone https://github.com/Vargaseo/autocut.git\ncd autocut' },
      { h: 'Install the panel', p: 'Copies the panel into Premiere’s extensions folder and allows panels without an Adobe signature.', code: 'bash install.sh' },
      { h: 'Set up mouth reading', p: 'Only for the single-microphone mode. Creates the isolated Python and downloads the face model.', code: 'bash setup_lipsync.sh' },
      { h: 'Open it in Premiere', p: 'Quit and reopen Premiere, then go to <strong>Window › Extensions (legacy) › AutoCut</strong>.' }
    ]
  },
  s6: {
    h: 'How to use it',
    steps: [
      { h: 'Read the sequence', p: 'The panel lists your tracks. You confirm each person’s camera and which one is the wide shot.' },
      { h: 'Analyse', p: 'It reads the files and shows a colour preview of the shots. From then on, changing a setting updates the preview instantly, with no new analysis.' },
      { h: 'Apply the cuts', p: 'It duplicates the sequence and cuts on the copy. Cameras that are off air are <strong>disabled, not deleted</strong> — to change a cut by hand, just enable or disable the clip with <code>Shift+E</code>.' }
    ]
  },
  s7: {
    h: 'What it does not do yet',
    items: [
      '<strong>It does not read nested or merged clips.</strong> Use the original files on the tracks.',
      '<strong>A face fully turned away or covered cannot be read.</strong> In those stretches it works out the speaker from the other cameras, which is solid with two people and shakier with four. A face in profile reads normally.',
      '<strong>Audio with changed speed is not supported</strong>, and video tracks must be unlocked.',
      '<strong>There is no Adobe digital signature.</strong> The installer turns on <code>PlayerDebugMode</code>, the Premiere mode that accepts unsigned panels — and it applies to every panel, not just this one. You can turn it back off with <code>defaults write com.adobe.CSXS.12 PlayerDebugMode 0</code>.',
      '<strong>Only tested on macOS.</strong> The panel is built on technology that runs on both systems, but nobody has run it on Windows yet.'
    ],
    note2: 'The panel does not use the internet: it reads your sequence’s files with ffmpeg and Python on your own machine, and sends nothing anywhere.',
    note: '<strong>Work in progress.</strong> The decision logic is covered by automated tests, but with simulated audio and video — it has not been measured on real recordings yet. Treat the first pass as a rough cut and check the red markers.'
  },
  contact: {
    h: 'Get in touch',
    p: 'Have an idea for an improvement, found a case where it gets things wrong, or want to make an offer for the project? Write to me — I answer personally.',
    small: 'For a bad cut, it helps a lot to mention which mode you used (single microphone or one per person) and roughly what minute it happens. Technical problems can also go to the <a href="' + REPO + '/issues">GitHub issues</a>.'
  },
  footer: {
    links: [
      { href: REPO, t: 'GitHub' },
      { href: '../demo/?lang=en', t: 'Demo' },
      { href: REPO + '/issues', t: 'Report a problem' },
      { href: REPO + '/blob/main/LICENSE', t: 'MIT licence' }
    ],
    note: 'AutoCut · a panel for Adobe Premiere Pro. Not an Adobe product.'
  }
};

module.exports = { pt, en, EMAIL, REPO };
