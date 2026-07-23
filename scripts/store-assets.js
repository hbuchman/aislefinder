// Generates App Store / Play Store screenshots by driving the production web
// build in headless Chrome with a seeded demo list (no backend calls needed:
// organizedForHash matches the items, so Shop mode renders from the seed).
//
// Usage: serve the build dir first, then
//   node scripts/store-assets.js http://localhost:8321
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.argv[2] || 'http://localhost:8321';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, '..', 'store-assets');

// ---- demo data ----------------------------------------------------------

const itemsHash = (items) => items.map((it) => it.name).sort().join('|');

let counter = 0;
const item = (name, fromList = null) => ({
  id: `demo${(counter++).toString(36).padStart(4, '0')}`,
  name,
  addedAt: new Date(Date.now() - counter * 60000).toISOString(),
  addedBy: null,
  fromList,
});

const SECTIONS = [
  ['Produce', ['bananas', 'avocados', 'baby spinach', 'roma tomatoes', 'limes']],
  ['Bakery', ['sourdough bread']],
  ['Meat & Seafood', ['chicken breast', 'ground beef']],
  ['Aisle 4', ['olive oil', 'jasmine rice']],
  ['Aisle 5', ['black beans', 'salsa']],
  ['Aisle 12', ['tortilla chips']],
  ['Dairy', ['milk', 'greek yogurt', 'cheddar cheese']],
  ['Frozen', ['frozen blueberries']],
];

const organized = SECTIONS
  .map(([name, items]) => [`## ${name}`, ...items.map((i) => `- ${i}`)].join('\n'))
  .join('\n\n');

const allNames = SECTIONS.flatMap(([, items]) => items);

// Produce fully checked plus a few more: mid-trip progress for the Shop shot
const checkedItems = {};
for (const name of SECTIONS[0][1]) checkedItems[`Produce::${name}`] = true;
checkedItems['Bakery::sourdough bread'] = true;
checkedItems['Meat & Seafood::chicken breast'] = true;

const store = { id: '01400943', name: 'Smiths Marketplace' };

const makeLists = () => {
  const now = new Date();
  const daysAgo = (n) => new Date(now - n * 864e5).toISOString();

  const current = {
    id: 'demo-current',
    name: 'Weekly Groceries',
    status: 'active',
    items: allNames.map((n) => item(n)),
    store,
    organized,
    organizedBy: 'aisle',
    organizedForHash: null, // filled below
    checkedItems,
    collapsedGroups: {},
    customCategoryOrder: null,
    shareCode: null,
    members: [],
    createdAt: daysAgo(1),
    updatedAt: daysAgo(0),
    completedAt: null,
  };
  current.organizedForHash = itemsHash(current.items);

  const completed = (id, name, names, days) => ({
    ...current,
    id,
    name,
    status: 'completed',
    items: names.map((n) => item(n)),
    organized: null,
    organizedForHash: null,
    checkedItems: {},
    createdAt: daysAgo(days + 1),
    updatedAt: daysAgo(days),
    completedAt: daysAgo(days),
  });

  return [
    current,
    completed('demo-taco', 'Taco Night', ['ground beef', 'tortillas', 'salsa', 'shredded cheese', 'sour cream', 'cilantro', 'limes'], 5),
    completed('demo-last', 'Weekly Groceries', ['milk', 'eggs', 'bananas', 'bread', 'greek yogurt', 'coffee', 'chicken breast', 'pasta'], 8),
    completed('demo-bbq', 'Cookout', ['burger buns', 'hot dogs', 'ketchup', 'potato chips', 'watermelon', 'lemonade'], 15),
  ];
};

// ---- capture ------------------------------------------------------------

const DEVICES = [
  // iPhone 16 Pro Max logical size @3x -> 1320x2868 (App Store 6.9")
  { dir: 'appstore', width: 440, height: 956, scale: 3 },
  // Common Android phone @3x -> 1080x2400 (Play Store)
  { dir: 'playstore', width: 360, height: 800, scale: 3 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clickByTitle = (page, title) =>
  page.evaluate((t) => document.querySelector(`button[title="${t}"]`).click(), title);

async function captureDevice(browser, dev) {
  const dir = path.join(OUT, dev.dir);
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: dev.width, height: dev.height, deviceScaleFactor: dev.scale, isMobile: true, hasTouch: true });

  const lists = makeLists();
  await page.evaluateOnNewDocument((listsJson) => {
    localStorage.setItem('af_lists', listsJson);
    localStorage.setItem('af_currentListId', JSON.stringify('demo-current'));
  }, JSON.stringify(lists));

  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await sleep(1200); // fonts + icons

  const shot = (name) => page.screenshot({ path: path.join(dir, `${name}.png`) });

  // 1. Current list (home)
  await shot('1-current-list');

  // 2. Shop mode, organized by aisle with progress
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Shop'));
    btn.click();
  });
  await sleep(800);
  await shot('2-shop-by-aisle');

  // back home, then 3. My Lists and 4. History
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.title || '').match(/back|exit/i))
      || document.querySelector('button[title="Exit"]');
    if (btn) btn.click();
    else window.location.reload();
  });
  await sleep(1000);

  await clickByTitle(page, 'My Lists');
  await sleep(600);
  await shot('3-my-lists');

  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await sleep(1000);
  await clickByTitle(page, 'History');
  await sleep(600);
  await shot('4-history');

  await page.close();
}

async function featureGraphic(browser) {
  const html = path.join(__dirname, 'feature-graphic.html');
  if (!fs.existsSync(html)) return;
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
  await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
  await sleep(400);
  fs.mkdirSync(path.join(OUT, 'playstore'), { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'playstore', 'feature-graphic.png') });
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    for (const dev of DEVICES) await captureDevice(browser, dev);
    await featureGraphic(browser);
  } finally {
    await browser.close();
  }
  console.log(`done -> ${OUT}`);
})();
