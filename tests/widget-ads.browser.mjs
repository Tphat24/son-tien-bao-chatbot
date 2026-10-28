import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const widget = await readFile(new URL('../public/widget.js', import.meta.url), 'utf8');
const guard = await readFile(new URL('../public/site-guard.js', import.meta.url), 'utf8');
const server = createServer((req, res) => {
  if (req.url === '/widget.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(widget); }
  if (req.url === '/site-guard.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(guard); }
  if (req.url === '/api/web-chat/config') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ welcome: 'Xin chào', quickReplies: [] })); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    ${req.url === '/early' ? '<script src="/site-guard.js"></script>' : ''}<h1 id="product">Sản phẩm sơn</h1>
    <button id="cached">Xem sản phẩm</button>
    <a id="shopping" href="https://shopee.vn/flash_sale" target="_blank">Quảng cáo</a>
    <a id="contact" href="https://zalo.me/0913712195" target="_blank">Tư vấn Zalo</a>
    <script>const savedOpen=window.open;
      document.addEventListener('click',event=>{if(event.target.id==='product')window.open('https://shopee.vn/flash_sale','_blank');
        if(event.target.id==='cached')savedOpen('https://shopee.vn/flash_sale','_blank');});</script>
    <script src="/widget.js" ${req.url === '/allow-shopping' ? 'data-block-shopping-redirects="false"' : ''} defer></script>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const origin = `http://127.0.0.1:${server.address().port}`;
async function pageForTest(t, path = '/') {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => page.close());
  await page.addInitScript(() => {
    window.allowedOpens = [];
    window.open = function (url) { window.allowedOpens.push(String(url)); return null; };
  });
  await page.route('https://media.loveitopcdn.com/**', (route) => route.abort());
  await page.goto(origin + path);
  await page.locator('.stb-launch').waitFor();
  return page;
}
try {
  await test('normal product click cannot open a Shopee advertising tab while chat is closed', async (t) => {
    const page = await pageForTest(t);
    await page.locator('#product').click();
    assert.deepEqual(await page.evaluate(() => window.allowedOpens), []);
  });
  await test('Shopee anchor and app deep-link navigation are blocked; Zalo remains available', async (t) => {
    const page = await pageForTest(t);
    const result = await page.evaluate(() => {
      const ad = document.querySelector('#shopping');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      ad.dispatchEvent(event);
      window.open('shopee://home');
      window.open('intent://home#Intent;scheme=shopee;package=com.shopee.vn;end');
      window.open('https://zalo.me/0913712195');
      return { cancelled: event.defaultPrevented, allowed: window.allowedOpens };
    });
    assert.equal(result.cancelled, true);
    assert.deepEqual(result.allowed, ['https://zalo.me/0913712195']);
  });
  await test('mobile launcher has a 36px visible icon and at least a 44px tap target', async (t) => {
    const page = await pageForTest(t);
    const size = await page.locator('.stb-launch').evaluate((el) => {
      const box = el.getBoundingClientRect(), css = getComputedStyle(el);
      return { target: box.width, visible: box.width - parseFloat(css.borderLeftWidth) - parseFloat(css.borderRightWidth) };
    });
    assert.ok(size.target >= 44);
    assert.ok(size.visible <= 36, JSON.stringify(size));
  });
  await test('encoded affiliate redirects and dynamic shopping links are blocked after chat closes', async (t) => {
    const page = await pageForTest(t);
    await page.locator('.stb-launch').click();
    await page.locator('.stb-close').click();
    const result = await page.evaluate(() => {
      window.open('https://tracker.example/click?redirect_url=https%253A%252F%252Fs.shopee.vn%252Foffer');
      window.open('intent://unknown#Intent;S.browser_fallback_url=https%3A%2F%2Fshopee.vn%2Foffer;end');
      const link = document.createElement('a'); link.href = 'https://shope.ee/offer'; document.body.appendChild(link);
      const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true }); link.dispatchEvent(event);
      return { allowed: window.allowedOpens, cancelled: event.defaultPrevented };
    });
    assert.deepEqual(result.allowed, []);
    assert.equal(result.cancelled, true);
  });
  await test('early head script blocks handlers that cache window.open before widget initialization', async (t) => {
    const page = await pageForTest(t, '/early');
    await page.locator('#cached').click();
    assert.deepEqual(await page.evaluate(() => window.allowedOpens), []);
    assert.equal(await page.evaluate(() => window.__stbNavigationGuard.blockedCount), 1);
  });
  await test('normal product/contact URLs and explicit shopping opt-out keep their original behavior', async (t) => {
    const page = await pageForTest(t);
    const urls = ['https://sontienbao.com/son-jotun', 'https://zalo.me/0913712195', 'tel:0913712195', 'mailto:ctytienbao@gmail.com', 'https://shopee.vn.unrelated.example/help'];
    await page.evaluate((values) => values.forEach((url) => window.open(url)), urls);
    assert.deepEqual(await page.evaluate(() => window.allowedOpens), urls);
    const optOut = await pageForTest(t, '/allow-shopping');
    await optOut.locator('#product').click();
    assert.deepEqual(await optOut.evaluate(() => window.allowedOpens), ['https://shopee.vn/flash_sale']);
  });
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
