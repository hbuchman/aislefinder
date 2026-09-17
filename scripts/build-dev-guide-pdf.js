// Builds docs/dev-guide/AisleFinder-Dev-Guide.pdf from the chapter markdown
// files: renders them to styled HTML (Ocean Fresh — Amber Nav palette, same
// tokens as docs/design-rules.html) and prints that to PDF with headless
// Chrome, same pattern as scripts/store-assets.js.
//
// Usage: node scripts/build-dev-guide-pdf.js
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GUIDE_DIR = path.join(__dirname, '..', 'docs', 'dev-guide');
const OUT_PDF = path.join(GUIDE_DIR, 'AisleFinder-Dev-Guide.pdf');

const PARTS = [
  { label: 'The Backend', chapters: ['01-python-server.md', '02-kroger-api.md', '03-testing-python.md'] },
  { label: 'The Frontend', chapters: ['04-react-frontend.md', '05-testing-react.md', '06-design-system.md'] },
  { label: 'Shipping It', chapters: ['07-web-deployment.md', '08-ios-support.md', '09-android-support.md'] },
  { label: 'Going Multi-User', chapters: ['10-aws-logins.md', '11-offline-sync.md', '12-codebase-tour.md'] },
  { label: 'Running It Safely', chapters: ['13-security-hardening.md'] },
];

const slugify = (s) =>
  s.toLowerCase().trim()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');

marked.setOptions({ gfm: true, breaks: false });

// Give every H2/H3 a stable, human-readable id (GitHub-style collision
// dedupe: foo, foo-1, foo-2...) via post-processing, so this works the same
// regardless of the installed marked major version's renderer token shape.
const usedIds = new Map();
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}
function injectHeadingIds(html) {
  return html.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (full, tag, inner) => {
    const base = slugify(stripTags(inner));
    const n = usedIds.get(base) || 0;
    usedIds.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n}`;
    return `<${tag} id="${id}">${inner}</${tag}>`;
  });
}
// GFM task-list checkboxes render as <input type="checkbox">; swap them for
// styled glyphs (attribute order/quoting varies by marked version, so match
// loosely and just check for the literal word "checked").
function styleCheckboxes(html) {
  return html.replace(/<input\b[^>]*type="checkbox"[^>]*>/g, (m) =>
    `<span class="af-check${/checked/.test(m) ? ' af-check-done' : ''}"></span>`);
}
function readChapter(file) {
  const raw = fs.readFileSync(path.join(GUIDE_DIR, file), 'utf8');
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/^Chapter \d+:\s*/, '') : file;
  // Body without the leading H1 (rendered separately in the chapter header)
  // and without the trailing "Next: ..." / "Back to the guide index" nav
  // line (page order makes both moot, and the index isn't in the PDF).
  const body = raw
    .replace(/^#\s+.+$/m, '')
    .replace(/\n---\n\s*(Next:|Back to the).*$/s, '')
    .trim();
  let html = marked.parse(body);
  html = injectHeadingIds(html);
  html = styleCheckboxes(html);
  return { file, title, html };
}

function buildToc(parts, chaptersByFile) {
  let n = 0;
  const rows = parts.map((part) => {
    const items = part.chapters.map((file) => {
      n += 1;
      const ch = chaptersByFile[file];
      return `
        <a class="toc-row" href="#chapter-${n}">
          <span class="toc-num">${String(n).padStart(2, '0')}</span>
          <span class="toc-title">${ch.title}</span>
          <span class="toc-dots"></span>
        </a>`;
    }).join('');
    return `
      <div class="toc-part">
        <div class="toc-part-label">${part.label}</div>
        ${items}
      </div>`;
  }).join('');
  return rows;
}

function buildChapters(parts, chaptersByFile) {
  let n = 0;
  const partOf = {};
  parts.forEach((p) => p.chapters.forEach((f) => { partOf[f] = p.label; }));
  return parts.flatMap((part) => part.chapters).map((file) => {
    n += 1;
    const ch = chaptersByFile[file];
    return `
      <section class="chapter" id="chapter-${n}">
        <div class="chapter-head">
          <div class="chapter-kicker">${partOf[file]}</div>
          <div class="chapter-title-row">
            <span class="chapter-num">${String(n).padStart(2, '0')}</span>
            <h1>${ch.title}</h1>
          </div>
        </div>
        <div class="chapter-body">
          ${ch.html}
        </div>
      </section>`;
  }).join('\n');
}

const CSS = `
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
    color: #1c2a3a;
    background: #ffffff;
    -webkit-font-smoothing: antialiased;
  }

  /* ---------- palette (Ocean Fresh — Amber Nav, docs/design-rules.html) --- */
  :root {
    --af-bg: #ffffff;
    --af-inset-bg: #eff5fb;
    --af-surface: #e4edf6;
    --af-border: #d9e7f2;
    --af-text: #1c2a3a;
    --af-text-muted: #5f7183;
    --af-navy: #1f5fa0;
    --af-navy-dark: #153f6e;
    --af-amber: #ffb52e;
    --af-code-bg: #0d1420;
    --af-code-text: #e1e7ee;
  }

  /* ---------- cover -------------------------------------------------- */
  .cover {
    min-height: 10.55in;
    padding: 0 0.85in;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: var(--af-navy-dark);
    color: #ffffff;
    position: relative;
    overflow: hidden;
  }
  .cover::after {
    content: '';
    position: absolute;
    right: -3in; bottom: -3in;
    width: 7in; height: 7in;
    border-radius: 999px;
    background: rgba(255,255,255,0.05);
  }
  .cover::before {
    content: '';
    position: absolute;
    left: -2in; top: -2.5in;
    width: 5in; height: 5in;
    border-radius: 999px;
    background: rgba(255,181,46,0.10);
  }
  .cover-mark {
    width: 56px; height: 56px;
    border-radius: 14px;
    background: rgba(255,255,255,0.12);
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 700;
    margin-bottom: 34px;
    position: relative; z-index: 1;
  }
  .cover-eyebrow {
    text-transform: uppercase;
    letter-spacing: 2.5px;
    font-size: 12px;
    font-weight: 700;
    color: var(--af-amber);
    margin-bottom: 14px;
    position: relative; z-index: 1;
  }
  .cover h1 {
    font-size: 48px;
    line-height: 1.12;
    margin: 0 0 18px;
    font-weight: 700;
    letter-spacing: -0.5px;
    max-width: 6.4in;
    position: relative; z-index: 1;
  }
  .cover p {
    font-size: 16px;
    line-height: 1.6;
    max-width: 5.6in;
    color: rgba(255,255,255,0.78);
    margin: 0 0 40px;
    position: relative; z-index: 1;
  }
  .cover-meta {
    display: flex;
    gap: 28px;
    position: relative; z-index: 1;
    border-top: 1px solid rgba(255,255,255,0.18);
    padding-top: 22px;
    max-width: 6.4in;
  }
  .cover-meta div { font-size: 12px; color: rgba(255,255,255,0.6); }
  .cover-meta b { display: block; font-size: 14px; color: #fff; font-weight: 700; margin-bottom: 2px; }

  /* ---------- table of contents --------------------------------------- */
  .toc { padding: 0.75in 0.85in; break-before: page; }
  .toc-heading {
    font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
    color: var(--af-navy); margin: 0 0 6px;
  }
  .toc h2 { font-size: 30px; margin: 0 0 34px; letter-spacing: -0.4px; }
  .toc-part { margin-bottom: 26px; }
  .toc-part-label {
    font-size: 11px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase;
    color: var(--af-text-muted); margin-bottom: 8px;
  }
  .toc-row {
    display: flex; align-items: baseline; gap: 10px;
    padding: 9px 4px;
    text-decoration: none; color: var(--af-text);
    border-bottom: 1px solid var(--af-border);
  }
  .toc-part .toc-row:last-child { border-bottom: none; }
  .toc-num { font-weight: 700; color: var(--af-navy); font-size: 13px; width: 22px; flex-shrink: 0; }
  .toc-title { font-size: 14.5px; font-weight: 700; white-space: nowrap; }
  .toc-dots { flex: 1; }

  /* ---------- chapters -------------------------------------------------- */
  .chapter { break-before: page; padding: 0.7in 0.85in 0.5in; }
  .chapter-head { margin-bottom: 30px; }
  .chapter-kicker {
    font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
    color: var(--af-navy); margin-bottom: 10px;
  }
  .chapter-title-row { display: flex; align-items: baseline; gap: 16px; border-bottom: 3px solid var(--af-amber); padding-bottom: 16px; }
  .chapter-num { font-size: 20px; font-weight: 700; color: var(--af-border); }
  .chapter-title-row h1 { font-size: 27px; margin: 0; letter-spacing: -0.3px; }

  .chapter-body h2 { font-size: 18px; margin: 32px 0 12px; color: var(--af-navy-dark); letter-spacing: -0.2px; }
  .chapter-body h3 { font-size: 14.5px; margin: 22px 0 8px; color: var(--af-text); }
  .chapter-body p, .chapter-body li { font-size: 12.5px; line-height: 1.65; }
  .chapter-body p { margin: 0 0 12px; }
  .chapter-body ul, .chapter-body ol { margin: 0 0 14px; padding-left: 22px; }
  .chapter-body li { margin: 4px 0; }
  .chapter-body a { color: var(--af-navy); text-decoration: none; border-bottom: 1px solid var(--af-border); }
  .chapter-body hr { border: none; border-top: 1px solid var(--af-border); margin: 24px 0; }
  .chapter-body strong { font-weight: 700; }

  .chapter-body code {
    font-family: Menlo, Consolas, monospace;
    font-size: 11.2px;
    color: var(--af-navy-dark);
    background: var(--af-inset-bg);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .chapter-body pre {
    background: var(--af-code-bg);
    color: var(--af-code-text);
    border-radius: 10px;
    padding: 14px 16px;
    margin: 0 0 16px;
    overflow-x: auto;
    break-inside: avoid;
  }
  .chapter-body pre code {
    background: none; color: inherit; padding: 0; border-radius: 0;
    font-size: 11px; line-height: 1.55; white-space: pre;
  }

  .chapter-body table {
    width: 100%; border-collapse: collapse; margin: 4px 0 18px;
    background: #fff; border-radius: 8px; overflow: hidden;
    border: 1px solid var(--af-border);
    break-inside: avoid;
    font-size: 11.5px;
  }
  .chapter-body th, .chapter-body td {
    text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--af-border);
    vertical-align: top;
  }
  .chapter-body th {
    background: var(--af-inset-bg); font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--af-text-muted); font-weight: 700;
  }
  .chapter-body tr:last-child td { border-bottom: none; }

  .chapter-body blockquote {
    margin: 0 0 16px;
    padding: 10px 16px;
    background: rgba(255,181,46,0.12);
    border-left: 3px solid var(--af-amber);
    border-radius: 0 8px 8px 0;
    font-size: 12px;
  }
  .chapter-body blockquote p:last-child { margin-bottom: 0; }

  .af-check {
    display: inline-block; width: 11px; height: 11px; margin-right: 7px;
    border: 1.5px solid var(--af-text-muted); border-radius: 3px; vertical-align: middle;
  }
  .af-check-done { background: var(--af-navy); border-color: var(--af-navy); }
  .chapter-body li:has(.af-check) { list-style: none; margin-left: -22px; }
`;

function buildHtml(parts, chaptersByFile) {
  const toc = buildToc(parts, chaptersByFile);
  const chapters = buildChapters(parts, chaptersByFile);
  const totalChapters = parts.reduce((n, p) => n + p.chapters.length, 0);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AisleFinder — Full-Stack Development Guide</title>
<style>${CSS}</style>
</head>
<body>

  <section class="cover">
    <div class="cover-mark">A</div>
    <div class="cover-eyebrow">Developer Guide</div>
    <h1>AisleFinder<br>Full-Stack Development Guide</h1>
    <p>A complete walkthrough of the app's stack — React frontend, Flask API,
    the Kroger integration, AWS accounts, and shipping to web, iOS, and
    Android — using this codebase as the running example.</p>
    <div class="cover-meta">
      <div><b>${totalChapters} chapters</b>Backend to app store</div>
      <div><b>Kroger API</b>Product search &amp; store lookup</div>
      <div><b>React + Flask</b>Capacitor for iOS / Android</div>
    </div>
  </section>

  <section class="toc">
    <div class="toc-heading">Contents</div>
    <h2>Everything in this guide</h2>
    ${toc}
  </section>

  ${chapters}

</body>
</html>`;
}

(async () => {
  const chaptersByFile = {};
  for (const part of PARTS) {
    for (const file of part.chapters) {
      chaptersByFile[file] = readChapter(file);
    }
  }

  const html = buildHtml(PARTS, chaptersByFile);
  const tmpHtml = path.join(GUIDE_DIR, '.dev-guide-render.html');
  fs.writeFileSync(tmpHtml, html);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: OUT_PDF,
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%; font-family:Arial,Helvetica,sans-serif; font-size:8.5px; color:#8a97a6; padding:0 0.85in; display:flex; justify-content:space-between;">
          <span>AisleFinder — Developer Guide</span>
          <span class="pageNumber"></span>
        </div>`,
      margin: { top: 0, bottom: '0.4in', left: 0, right: 0 },
      tagged: true,
      outline: true,
    });
  } finally {
    await browser.close();
    fs.unlinkSync(tmpHtml);
  }
  console.log(`wrote ${path.relative(process.cwd(), OUT_PDF)}`);
})();
