# AutoCut — troca de câmera automática para podcast (Premiere Pro)

**[Site e demonstração →](https://vargaseo.github.io/autocut/)**

Painel para o Adobe Premiere Pro que escuta o podcast, descobre quem está falando em cada
momento e corta a timeline para a câmera daquela pessoa. Funciona com um microfone por pessoa
ou com **um áudio só para todos** (nesse caso, lendo o movimento da boca em cada câmera).
Usa plano aberto quando as pessoas falam juntas ou quando um close fica longo demais.

> **Em desenvolvimento.** A lógica de decisão é verificada por testes automáticos, mas com áudio
> e vídeo simulados — ainda não foi medida em gravações reais. Confira os marcadores vermelhos
> que o próprio plugin deixa na sequência.

## Instalar (uma vez)

Requisitos: macOS, Premiere Pro 2022+ e `ffmpeg` (`brew install ffmpeg`).

```bash
bash install.sh
```

Feche e abra o Premiere → **Janela > Extensões (legado) > AutoCut**.

## Como montar a sequência

- Cada câmera em uma faixa de vídeo própria (ex.: V1 = Pessoa 1, V2 = Pessoa 2, V3 = aberto).
- Cada microfone em uma faixa de áudio própria (A1, A2…), tudo sincronizado.
- Se um gravador juntou dois mics num arquivo estéreo, use o mesmo arquivo em duas faixas e escolha o canal Esq./Dir. no painel.

## Modo "Um microfone só (leitura da boca)" — modo padrão

Para gravações com um único áudio para todos. O áudio diz *quando* alguém fala; o movimento
da boca em cada câmera diz *quem*. Cada câmera de pessoa deve mostrar o rosto dela.

Preparar uma vez (instala MediaPipe num Python isolado, ~300 MB):

```bash
bash setup_lipsync.sh
```

No painel, deixe **Gravação: Um microfone só**, selecione a faixa do áudio e a câmera aberta.
As câmeras são lidas ao mesmo tempo (até 3 em paralelo); ainda assim demora alguns minutos por hora de vídeo.

Como ele sabe quem fala: o áudio diz *quando* há fala; em cada câmera ele mede o movimento
de lábios, mandíbula e queixo **e a sincronia desse movimento com o ritmo das sílabas da voz**.
Quem reage, sorri, ri sem som ou mastiga mexe a boca fora desse ritmo e perde para quem está falando.
O resultado fica guardado enquanto o painel estiver aberto, então mexer nos ajustes depois é instantâneo.

Ajustes avançados do modo:
- **Quadros por segundo:** mais = mais preciso e mais lento (padrão 10).
- **Movimento mínimo:** suba se o plugin cortar para quem só sorri ou mastiga; desça se ele não perceber quem fala.
- **Peso da sincronia boca-voz:** 0,7 por padrão. Abaixe se o vídeo estiver fora de sincronia com o áudio; 0 desliga.
- **Semelhança p/ fala simultânea:** quão parecido o movimento de duas bocas precisa ser para virar plano aberto.

Limitações: pessoa de perfil, de costas ou com a boca coberta (mão, microfone) não é lida;
se o rosto some por muito tempo o painel avisa.

## Usar

1. **Ler sequência ativa** — o painel lista os microfones. Confira a câmera de cada pessoa e a câmera aberta.
2. **Analisar áudio** — a prévia mostra os planos (barra de cima) e quem falou (faixas de baixo).
   Mexa nos ajustes e a prévia atualiza na hora, sem reanalisar.
3. **Aplicar cortes** — por padrão cria uma cópia da sequência ("… - AutoCut") e corta nela.
   Os clipes das câmeras são cortados e as câmeras fora do ar ficam **desativadas** (não apagadas),
   então você pode ajustar qualquer corte à mão ativando/desativando o clipe (Shift+E).

## Ajustes

| Ajuste | O que faz |
|---|---|
| Sensibilidade | Mais alto = detecta falas mais baixas (e também mais ruído). |
| Duração mínima do plano | Falas curtas ("aham", "isso") não geram corte. |
| Antecipar o corte | Corta para a pessoa um pouco antes de ela começar a falar. |
| Plano aberto quando falam juntos | Fala simultânea com essa duração vira plano aberto. |
| Tempo máximo no ar (tabela) | Para cada câmera: tempo máximo, para onde cortar ao passar (aberto, outra pessoa ou automático) e por quantos segundos. O corte é colocado numa pausa da fala. Para o plano aberto, depois do máximo volta para quem estiver falando. 0 = sem limite. |

## Como ele decide (e evita ficar preso no apresentador)

- **Vazamento entre microfones:** o plugin aprende quanto da voz de cada pessoa vaza nos outros mics
  e desconta antes de decidir. Assim o apresentador falando alto no mic do convidado não "rouba" a câmera.
- **Decisão da conversa inteira:** em vez de "manter a câmera anterior" quando há dúvida, ele escolhe
  a sequência de planos que melhor explica a conversa toda, com um custo para cada troca
  (Avançado → *Evidência para trocar de câmera*: mais alto = menos trocas).
- **Fala curta:** um trecho curto vai para o vizinho com mais evidência, não sempre para quem estava antes.
- **Leitura da boca:** usa lábios, mandíbula e queixo — o queixo continua visível com microfone na frente da boca.
- **Trechos duvidosos:** quando alguém parece falar por um bom tempo com a câmera em outra pessoa,
  aparece um ▼ vermelho na prévia e um marcador vermelho "AutoCut: conferir" na sequência.
  Pule de marcador em marcador (Shift+M) para revisar só esses pontos.

## Limitações

- Clipes aninhados (nested) ou mesclados (merged) nas faixas de áudio não são lidos — use o arquivo original.
- Clipes com velocidade alterada no áudio não são suportados.
- Faixas de vídeo travadas (cadeado) precisam ser destravadas.
- Sem assinatura digital: depende do `PlayerDebugMode` que o `install.sh` liga.

## Desenvolvimento

Testes (não precisam do Premiere nem de arquivos de mídia):

```bash
node test/test_analysis.js   # modo "um mic por pessoa"
node test/test_mouth.js      # modo "um mic só"
node test/test_sync.js       # sincronia boca-voz e tempo máximo no ar
node test/test_guest.js      # convidado falando com a câmera no apresentador
node test/test_host.js       # cortes e marcadores na timeline (Premiere simulado)
```

O painel roda no navegador, com o Premiere simulado, para testar a interface:

```bash
node test/make_harness.js && python3 -m http.server 8765 --directory AutoCut
```

Depois abra `http://localhost:8765/_harness.html`. Esse mesmo comando também gera a
demonstração do site em `docs/demo/`.

## Estrutura

| Pasta | O que é |
|---|---|
| `AutoCut/` | O painel: `js/analysis.js` (decisão dos cortes), `js/main.js` (interface), `jsx/host.jsx` (fala com o Premiere), `py/mouth.py` (leitura da boca com MediaPipe) |
| `docs/` | O site publicado em GitHub Pages, com a demonstração |
| `test/` | Testes automáticos |
