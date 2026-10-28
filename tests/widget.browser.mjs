// Optional browser QA: npm install --no-save playwright && npx playwright install chromium
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const widget = await readFile(new URL('../public/widget.js', import.meta.url), 'utf8');
const config = { welcome: 'Xin chào Anh/Chị! Em hỗ trợ chọn sơn và hướng dẫn thi công.', quickReplies: ['Tư vấn sơn nội thất', 'Tư vấn sơn ngoại thất', 'Tư vấn trực tiếp'] };
const response = {
  reply: 'Anh/Chị có thể chọn sơn theo bề mặt cần thi công.\n\n- Sơn nội thất: phù hợp tường trong nhà.\n- Sơn ngoại thất: phù hợp tường ngoài trời.\n\nĐịnh mức tham khảo 8–12 m²/L/lớp; cần kiểm tra tài liệu sản phẩm. <img src=x onerror=alert(1)>',
  sources: [
    { title: 'Tài liệu sản phẩm', url: 'https://sontienbao.com/san-pham' },
    { title: '<img src=x onerror=alert(1)>', url: 'https://sontienbao.com/tai-lieu' },
    { title: 'Unsafe', url: 'javascript:alert(1)' }
  ], quickReplies: ['Hỏi thêm', 'Để lại yêu cầu']
};
const server = createServer((req, res) => {
  if (req.url === '/widget.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); return res.end(widget); }
  if (req.url === '/api/web-chat/config') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(config)); }
  if (req.url === '/api/web-chat/session') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ sessionId: 'web_00000000-0000-0000-0000-000000000000' })); }
  if (req.url === '/api/web-chat/message') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(response)); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kiểm thử Sơn Tiến Bảo</title>
  <style>body{margin:0;background:#f1f5f0;color:#173d2a;font:16px system-ui}main{max-width:820px;margin:10vh auto;padding:32px}h1{font-size:36px}.ad{position:fixed;right:0;bottom:0;background:#ffe4a8;padding:32px;z-index:2147483647}.popup{position:fixed;left:0;top:0}</style>
  <main><p>SƠN TIẾN BẢO · TRANG KIỂM THỬ</p><h1>Chọn sơn phù hợp cho ngôi nhà</h1><p>Dữ liệu trả lời trên trang này là dữ liệu giả lập để kiểm thử giao diện.</p></main>
  <aside class="ad" data-stb-chat-suppress>Popup quảng cáo mẫu</aside><div class="popup">Thành phần website cần giữ</div>
  <script src="/widget.js" data-hide-selectors="#promo" ${req.url === '/opt-out' ? 'data-suppress-ads="false"' : ''} defer></script></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  for (const [width, height] of [[320, 568], [390, 844], [520, 740], [844, 390], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://media.loveitopcdn.com/**', (route) => route.abort());
    await page.goto(origin);
    const host = page.locator('#stb-ai-chatbot');
    await host.locator('.stb-bubble').waitFor({ state: 'attached' });
    const launchBox = await host.locator('.stb-launch').boundingBox();
    assert.equal(launchBox.width, width <= 520 ? 44 : 56);
    if (width === 390) await page.screenshot({ path: new URL('../artifacts/mobile-launcher.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
    await host.locator('.stb-launch').click();
    await assert.doesNotReject(() => host.locator('.stb-panel').waitFor({ state: 'visible' }));
    assert.equal(await page.locator('.ad').evaluate((el) => getComputedStyle(el).visibility), 'hidden');
    assert.equal(await page.locator('.popup').evaluate((el) => getComputedStyle(el).visibility), 'visible');
    const panel = await host.locator('.stb-panel').boundingBox();
    assert.ok(panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= width + 1 && panel.y + panel.height <= height + 1, JSON.stringify({ width, height, panel }));
    // The browser top layer must win over ordinary positioned content with maximal z-index.
    assert.equal(await host.locator('.stb-panel').evaluate((el) => !el.showPopover || el.matches(':popover-open')), true);
    await host.locator('.stb-textarea').fill('Tôi cần tư vấn sơn');
    await host.locator('.stb-send').click();
    await host.locator('.stb-bubble-content ul').waitFor({ state: 'attached' });
    assert.equal(await host.locator('.stb-sources').count(), 0);
    assert.equal(await host.locator('.stb-bubble a').count(), 0);
    assert.equal(await host.locator('.stb-bubble-content img').count(), 0);
    assert.equal(await host.locator('.stb-bubble-content ul li').count(), 2);
    assert.match(await host.locator('.stb-row.bot').last().textContent(), /8–12 m²\/L\/lớp/);
    assert.equal(await host.locator('.stb-body').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: new URL(`../artifacts/chat-${width}.png`, import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
    }
    await host.locator('.stb-chip').filter({ hasText: 'Để lại yêu cầu' }).click();
    await host.locator('.stb-lead').waitFor({ state: 'visible' });
    assert.equal(await host.locator('.stb-lead input').count(), 2);
    await page.evaluate(() => {
      const popup = document.createElement('aside'); popup.id = 'promo'; popup.textContent = 'Quảng cáo tải muộn'; document.body.append(popup);
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#promo')).visibility === 'hidden');
    await host.locator('.stb-close').click();
    assert.equal(await page.locator('.ad').evaluate((el) => getComputedStyle(el).visibility), 'visible');
    assert.equal(await page.locator('#promo').evaluate((el) => getComputedStyle(el).visibility), 'visible');
    await host.locator('.stb-launch').click();
    await host.locator('.stb-close').press('Escape');
    assert.equal(await host.locator('.stb-launch').getAttribute('aria-expanded'), 'false');
    // Simulate history saved by a previous widget version that included sources.
    await page.evaluate((sources) => {
      const key = 'stb_web_chat_messages_v53';
      const messages = JSON.parse(localStorage.getItem(key));
      messages.filter((message) => message.role === 'bot').forEach((message) => { message.sources = sources; });
      localStorage.setItem(key, JSON.stringify(messages));
    }, response.sources);
    await page.reload();
    await host.locator('.stb-launch').click();
    await host.locator('.stb-bubble-content ul').waitFor({ state: 'attached' });
    assert.equal(await host.locator('.stb-sources').count(), 0);
    assert.equal(await host.locator('.stb-bubble a').count(), 0);
    assert.equal(await host.locator('.stb-body').getByText(/Nguồn tham khảo/).count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${width}×${height}: layout, messages, hidden sources (new and legacy history), popups, lead form, keyboard and persistence`);
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://media.loveitopcdn.com/**', (route) => route.abort());
  await page.goto(`${origin}/opt-out`);
  await page.locator('.stb-launch').click();
  assert.equal(await page.locator('.ad').evaluate((el) => getComputedStyle(el).visibility), 'visible');
  // Simulate visual viewport changes when a phone keyboard opens.
  await page.evaluate(() => {
    const viewport = new EventTarget(); viewport.height = 420; viewport.offsetTop = 0;
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.dispatchEvent(new Event('resize'));
  });
  const compactPanel = await page.locator('.stb-panel').boundingBox();
  assert.ok(compactPanel.y + compactPanel.height <= 420);
  assert.ok((await page.locator('.stb-textarea').boundingBox()).y < 420);
  console.log('PASS ad suppression opt-out and keyboard viewport resize');
  const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fallback.route('https://media.loveitopcdn.com/**', (route) => route.abort());
  await fallback.addInitScript(() => {
    HTMLElement.prototype.showPopover = undefined;
    HTMLElement.prototype.hidePopover = undefined;
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await fallback.goto(origin);
  await fallback.locator('.stb-launch').click();
  await fallback.locator('.stb-textarea').fill('Tôi cần sơn');
  await fallback.locator('.stb-send').click();
  await fallback.locator('.stb-bubble-content ul').waitFor({ state: 'attached' });
  assert.equal(await fallback.locator('.stb-panel').getAttribute('popover'), null);
  await fallback.locator('.stb-close').click();
  console.log('PASS browsers without Popover API and blocked localStorage');
  // Export a clean illustrative preview separately from adversarial test screenshots.
  response.reply = response.reply.replace(' <img src=x onerror=alert(1)>', '');
  response.sources = response.sources.slice(0, 1);
  await page.goto(origin);
  await page.locator('.stb-launch').click();
  await page.locator('.stb-textarea').fill('Tôi muốn chọn sơn cho nhà');
  await page.locator('.stb-send').click();
  await page.locator('.stb-bubble-content ul').waitFor({ state: 'attached' });
  await page.screenshot({ path: new URL('../artifacts/preview-mobile.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
  response.reply = Array.from({ length: 12 }, (_, i) => `${i + 1}. Đọc đúng hướng dẫn thi công, định mức và điều kiện bề mặt trong tài liệu sản phẩm.`).join('\n\n') + '\n\nLưu ý cuối: cần xác nhận với nhân viên khi thiếu dữ liệu.';
  await page.locator('.stb-textarea').fill('Giải thích đầy đủ từng bước');
  await page.locator('.stb-send').click();
  await page.locator('.stb-row.bot').last().getByText('Lưu ý cuối: cần xác nhận với nhân viên khi thiếu dữ liệu.').waitFor({ state: 'attached' });
  assert.equal(await page.locator('.stb-row.bot').last().locator('li').count(), 12);
  assert.equal(await page.locator('.stb-body').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  console.log('PASS long detailed mobile answer preserves all steps and its final caveat');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
