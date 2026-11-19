// Gera as duas versoes do site a partir de tools/site-content.js:
//   docs/index.html     (português)
//   docs/en/index.html  (inglês)
// Rode: node tools/build-site.js
'use strict';
const fs = require('fs');
const path = require('path');
const { pt, en, EMAIL, REPO } = require('./site-content.js');

const docs = path.join(__dirname, '..', 'docs');
const ICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%232d8ceb'/><rect x='7' y='10' width='8' height='12' rx='2' fill='%23fff'/><rect x='18' y='10' width='7' height='12' rx='2' fill='%23ff9f43'/></svg>";
const SITE = 'https://vargaseo.github.io/autocut/';

const css = `
  :root {
    color-scheme: dark;
    --bg: #131417;
    --panel: #1b1d22;
    --panel-2: #212429;
    --line: #2d313a;
    --text: #e6e8ec;
    --muted: #9aa1ad;
    --accent: #2d8ceb;
    --accent-soft: #1d3049;
    --orange: #ff9f43;
    --radius: 12px;
    --gut: 16px;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    overflow-x: hidden;
  }
  .wrap { max-width: 880px; margin: 0 auto; padding: 0 var(--gut); }
  a { color: var(--accent); }
  h1, h2, h3 { line-height: 1.25; margin: 0; letter-spacing: -0.015em; }
  h2 { font-size: 1.45rem; margin-bottom: 8px; }
  h3 { font-size: 1.02rem; margin-bottom: 4px; }
  p { margin: 0 0 12px; }
  section { padding: 44px 0; border-top: 1px solid var(--line); }
  .lead { color: var(--muted); max-width: 62ch; }

  /* ---------- topo ---------- */
  header { padding: 26px 0 44px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 30px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand svg { width: 30px; height: 30px; flex: none; }
  .brand span { font-weight: 650; font-size: 1.06rem; }
  .lang {
    display: inline-flex; align-items: center; background: var(--panel); border: 1px solid var(--line);
    border-radius: 999px; padding: 3px; font-size: 0.8rem; font-weight: 650; flex: none;
  }
  .lang a, .lang span { padding: 5px 13px; border-radius: 999px; text-decoration: none; line-height: 1.2; }
  .lang .on { background: var(--accent); color: #fff; }
  .lang .off { color: var(--muted); }
  .lang .off:hover, .lang .off:focus-visible { color: var(--text); background: var(--panel-2); }

  h1 { font-size: clamp(2.1rem, 7vw, 3.3rem); font-weight: 680; }
  h1 .hl { color: var(--accent); }
  .tagline { font-size: clamp(1rem, 2.6vw, 1.2rem); color: var(--muted); max-width: 54ch; margin: 14px 0 0; }
  .cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
  .btn {
    display: inline-block; padding: 11px 20px; border-radius: 9px; font-weight: 600;
    font-size: 0.95rem; text-decoration: none; border: 1px solid transparent;
  }
  .btn-main { background: var(--accent); color: #fff; }
  .btn-ghost { border-color: var(--line); color: var(--text); background: var(--panel); }

  /* ---------- faixa de cortes ---------- */
  .strip { margin: 34px 0 0; border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; background: var(--panel); }
  .strip svg { display: block; width: 100%; height: auto; }
  .strip figcaption { color: var(--muted); font-size: 0.82rem; margin-top: 10px; }

  /* ---------- grades ---------- */
  .grid { display: grid; gap: 14px; margin-top: 22px; }
  @media (min-width: 680px) { .grid.c2 { grid-template-columns: 1fr 1fr; } .grid.c3 { grid-template-columns: repeat(3, 1fr); } }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; }
  .card p { color: var(--muted); font-size: 0.93rem; margin: 0; }
  .card .tag { font-size: 0.74rem; text-transform: uppercase; letter-spacing: .07em; color: var(--accent); font-weight: 650; display: block; margin-bottom: 7px; }
  .card.pick { border-color: var(--accent); }

  ul.clean { list-style: none; padding: 0; margin: 16px 0 0; }
  ul.clean li { position: relative; padding-left: 24px; margin-bottom: 11px; color: var(--muted); font-size: 0.95rem; }
  ul.clean li strong { color: var(--text); font-weight: 600; }
  ul.clean li::before {
    content: ""; position: absolute; left: 4px; top: 9px; width: 7px; height: 7px;
    border-radius: 2px; background: var(--accent);
  }

  /* ---------- passos ---------- */
  ol.steps { counter-reset: s; list-style: none; padding: 0; margin: 20px 0 0; }
  ol.steps > li { counter-increment: s; position: relative; padding-left: 42px; margin-bottom: 24px; }
  ol.steps > li::before {
    content: counter(s); position: absolute; left: 0; top: 0;
    width: 27px; height: 27px; border-radius: 50%; background: var(--accent-soft);
    color: #9cc8f5; border: 1px solid #2f4b6e;
    display: grid; place-items: center; font-size: 0.85rem; font-weight: 650;
  }
  ol.steps h3 { margin-bottom: 3px; }
  ol.steps p { color: var(--muted); font-size: 0.93rem; margin: 0 0 8px; }
  pre {
    background: #0e0f12; border: 1px solid var(--line); border-radius: 9px;
    padding: 11px 13px; overflow-x: auto; margin: 0 0 8px;
  }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.86rem; }
  pre code { color: #cfd6e0; }
  p code, li code, td code { background: var(--panel-2); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; font-size: 0.85em; }

  /* ---------- tabela ---------- */
  .tablewrap { overflow-x: auto; margin-top: 18px; border: 1px solid var(--line); border-radius: var(--radius); }
  table { border-collapse: collapse; width: 100%; min-width: 440px; font-size: 0.9rem; }
  th, td { text-align: left; padding: 11px 14px; border-bottom: 1px solid var(--line); }
  th { background: var(--panel-2); font-weight: 600; font-size: 0.82rem; color: var(--muted); }
  tr:last-child td { border-bottom: 0; }
  td .dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 7px; vertical-align: middle; }

  .note {
    border-left: 3px solid var(--accent); background: var(--panel);
    border-radius: 0 9px 9px 0; padding: 14px 16px; margin-top: 20px;
  }
  .note p { margin: 0; color: var(--muted); font-size: 0.92rem; }
  .note strong { color: var(--text); }

  /* ---------- contato ---------- */
  .contact {
    background: linear-gradient(160deg, var(--accent-soft), var(--panel) 62%);
    border: 1px solid #2f4b6e; border-radius: var(--radius); padding: 28px 24px; text-align: center;
  }
  .contact h2 { margin-bottom: 10px; }
  .contact p { color: var(--muted); max-width: 48ch; margin: 0 auto 18px; font-size: 0.96rem; }
  .contact .mail {
    display: inline-block; background: var(--accent); color: #fff; text-decoration: none;
    font-weight: 650; font-size: clamp(0.95rem, 3.4vw, 1.12rem); padding: 12px 24px; border-radius: 9px;
    word-break: break-all;
  }
  .contact .small { font-size: 0.85rem; margin: 18px auto 0; max-width: 52ch; }

  footer { border-top: 1px solid var(--line); padding: 34px 0 54px; color: var(--muted); font-size: 0.88rem; }
  footer a { margin-right: 16px; display: inline-block; }
`;

const STRIP_SVG = `<svg viewBox="0 0 860 118" role="img" aria-label="__ALT__">
        <g>
          <rect x="0" y="0" width="212" height="34" rx="4" fill="#4f9dff"/>
          <rect x="214" y="0" width="236" height="34" rx="4" fill="#ff9f43"/>
          <rect x="452" y="0" width="92" height="34" rx="4" fill="#8a8f98"/>
          <rect x="546" y="0" width="188" height="34" rx="4" fill="#4f9dff"/>
          <rect x="736" y="0" width="124" height="34" rx="4" fill="#ff9f43"/>
        </g>
        <g fill="#4f9dff" opacity="0.92">
          <rect x="8" y="56" width="196" height="18" rx="3"/>
          <rect x="462" y="56" width="74" height="18" rx="3"/>
          <rect x="556" y="56" width="170" height="18" rx="3"/>
        </g>
        <g fill="#ff9f43" opacity="0.92">
          <rect x="222" y="84" width="220" height="18" rx="3"/>
          <rect x="470" y="84" width="60" height="18" rx="3"/>
          <rect x="744" y="84" width="108" height="18" rx="3"/>
        </g>
      </svg>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DOTS = ['#4f9dff', '#ff9f43', '#8a8f98'];

// 3 colunas só quando o número de cartões é múltiplo de 3; senão 2, para não sobrar um sozinho.
function cards(list) {
  const n = list.length % 3 === 0 ? 3 : 2;
  return `    <div class="grid c${n}">
${list.map((c) => `      <div class="card${c.pick ? ' pick' : ''}">
        <span class="tag">${c.tag}</span>
        <h3>${c.h}</h3>
        <p>${c.p}</p>
      </div>`).join('\n')}
    </div>`;
}

function bullets(items) {
  return `    <ul class="clean">
${items.map((i) => `      <li>${i}</li>`).join('\n')}
    </ul>`;
}

function steps(list) {
  return `    <ol class="steps">
${list.map((s) => `      <li>
        <h3>${s.h}</h3>${s.p ? `\n        <p>${s.p}</p>` : ''}${s.code ? `\n        <pre><code>${esc(s.code)}</code></pre>` : ''}
      </li>`).join('\n')}
    </ol>`;
}

function table(s) {
  return `    <div class="tablewrap">
      <table>
        <thead>
          <tr>${s.th.map((h) => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
${s.rows.map((r, i) => `          <tr><td><span class="dot" style="background:${DOTS[i]}"></span>${r[0]}</td>${r.slice(1).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
        </tbody>
      </table>
    </div>`;
}

function page(t) {
  const canonical = SITE + t.dir;
  const mail = `mailto:${EMAIL}?subject=AutoCut`;
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.desc)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="pt-BR" href="${SITE}">
<link rel="alternate" hreflang="en" href="${SITE}en/">
<link rel="alternate" hreflang="x-default" href="${SITE}">
<meta property="og:title" content="AutoCut">
<meta property="og:description" content="${esc(t.ogDesc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<link rel="icon" href="${ICON}">
<style>${css}</style>
</head>
<body>

<header>
  <div class="wrap">
    <div class="topbar">
      <div class="brand">
        <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#2d8ceb"/><rect x="7" y="10" width="8" height="12" rx="2" fill="#fff"/><rect x="18" y="10" width="7" height="12" rx="2" fill="#ff9f43"/></svg>
        <span>AutoCut</span>
      </div>
      <nav class="lang" aria-label="${t.lang === 'en' ? 'Language' : 'Idioma'}">
        <span class="on" aria-current="true">${t.lang === 'en' ? 'EN' : 'PT'}</span>
        <a class="off" href="${t.other.href}" hreflang="${t.lang === 'en' ? 'pt-BR' : 'en'}" title="${esc(t.other.title)}">${t.other.label}</a>
      </nav>
    </div>
    <h1>${t.hero.l1}<br><span class="hl">${t.hero.l2}</span></h1>
    <p class="tagline">${t.hero.tagline}</p>
    <div class="cta">
      <a class="btn btn-main" href="${t.demoHref}">${t.hero.btnDemo}</a>
      <a class="btn btn-ghost" href="${REPO}">${t.hero.btnCode}</a>
      <a class="btn btn-ghost" href="#contato">${t.hero.btnContact}</a>
    </div>

    <figure class="strip">
      ${STRIP_SVG.replace('__ALT__', esc(t.stripAlt))}
      <figcaption>${t.stripCaption}</figcaption>
    </figure>
  </div>
</header>

<section>
  <div class="wrap">
    <h2>${t.s1.h}</h2>
    <p class="lead">${t.s1.lead}</p>
${cards(t.s1.cards)}
  </div>
</section>

<section>
  <div class="wrap">
    <h2>${t.s2.h}</h2>
    <p class="lead">${t.s2.lead}</p>
${cards(t.s2.cards)}
  </div>
</section>

<section>
  <div class="wrap">
    <h2>${t.s3.h}</h2>
    <p class="lead">${t.s3.lead}</p>
${bullets(t.s3.items)}
  </div>
</section>

<section>
  <div class="wrap">
    <h2>${t.s4.h}</h2>
    <p class="lead">${t.s4.lead}</p>
${table(t.s4)}
    <div class="note"><p>${t.s4.note}</p></div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>${t.s5.h}</h2>
    <p class="lead">${t.s5.lead}</p>
${steps(t.s5.steps)}
  </div>
</section>

<section>
  <div class="wrap">
    <h2>${t.s6.h}</h2>
${steps(t.s6.steps)}
  </div>
</section>

<section>
  <div class="wrap">
    <h2>${t.s7.h}</h2>
${bullets(t.s7.items)}
    <div class="note"><p>${t.s7.note2}</p></div>
    <div class="note"><p>${t.s7.note}</p></div>
  </div>
</section>

<section id="contato">
  <div class="wrap">
    <div class="contact">
      <h2>${t.contact.h}</h2>
      <p>${t.contact.p}</p>
      <a class="mail" href="${mail}">${EMAIL}</a>
      <p class="small">${t.contact.small}</p>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    ${t.footer.links.map((l) => `<a href="${l.href}">${l.t}</a>`).join('\n    ')}
    <a href="${mail}">${EMAIL}</a>
    <p style="margin-top:14px">${t.footer.note}</p>
  </div>
</footer>

</body>
</html>
`;
}

fs.writeFileSync(path.join(docs, 'index.html'), page(pt));
fs.mkdirSync(path.join(docs, 'en'), { recursive: true });
fs.writeFileSync(path.join(docs, 'en', 'index.html'), page(en));
console.log('ok: docs/index.html (pt) e docs/en/index.html (en)');
