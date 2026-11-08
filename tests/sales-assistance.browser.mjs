import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const widget = await readFile(new URL('../public/widget.js', import.meta.url), 'utf8');
const admin = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
const ids = [1,2,3,4].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const sessionId = 'web_00000000-0000-4000-8000-000000000009';
const products = ids.map((id, i) => ({ id, sku: `SON-${i+1}`, name: i===0 ? 'Sơn A <img src=x onerror=alert(1)>' : `Sơn ${String.fromCharCode(65+i)}`, brand: 'Hãng mẫu', category: 'Nội thất' }));
const writes = [];
const review = { id: ids[0], question: 'Tường ẩm có thể sơn ngay không?', answer: 'Cần kiểm tra tình trạng bề mặt.', status: 'open', customer_rating: 'not_helpful', customer_comment: '<img src=x onerror=alert(1)> cần rõ hơn', faq_question: 'Tường ẩm có thể sơn ngay không?', corrected_answer: '', created_at: new Date().toISOString() };
let storedLead;
const server = createServer(async (req, res) => {
  let text=''; for await (const chunk of req) text+=chunk;
  const body=text?JSON.parse(text):null, url=new URL(req.url,'http://localhost');
  if(body)writes.push({path:url.pathname,body});
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/widget.js'){res.setHeader('Content-Type','text/javascript');return res.end(widget);}
  if(url.pathname==='/admin.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(admin);}
  if(url.pathname==='/api/web-chat/config')return json({welcome:'Trang kiểm thử tính năng tư vấn. Dữ liệu minh họa.',quickReplies:[]});
  if(url.pathname==='/api/web-chat/session')return json({sessionId});
  if(url.pathname==='/api/web-chat/products')return json({products});
  if(url.pathname==='/api/web-chat/compare')return json({products:body.productIds.map(id=>products.find(p=>p.id===id)),rows:[{label:'Công dụng',values:body.productIds.map(()=> 'Tường trong nhà')},{label:'Định mức',values:body.productIds.map(()=> 'Chưa có dữ liệu đã xác minh')},{label:'Quy cách',values:body.productIds.map(()=> '5 L')}],note:'Giá bán cần được nhân viên xác nhận.'});
  if(url.pathname==='/api/web-chat/message')return json({reply:'Cần kiểm tra bề mặt và tài liệu sản phẩm trước khi sơn.',answerId:ids[0],quickReplies:[]});
  if(url.pathname==='/api/web-chat/feedback')return json({ok:true});
  if(url.pathname==='/api/web-chat/lead'){storedLead=body;return json({message:'Đã lưu yêu cầu cùng tóm tắt trao đổi.',directorPhone:'0913712195',directorZaloUrl:'https://zalo.me/0913712195'});}
  if(url.pathname==='/api/auth/login')return json({token:'test-browser-token',staff:{id:ids[0],email:'test@example.com',fullName:'Quản lý thử nghiệm',role:'manager'}});
  if(url.pathname==='/api/admin/leads/stats')return json({total:0,unhandled:0,won:0,conversionRate:0,byStatus:{},topProducts:[]});
  if(url.pathname==='/api/admin/knowledge/operations')return json({chat7d:{},rag:{coveragePercent:100}});
  if(url.pathname==='/api/admin/answer-reviews')return json({items:!url.searchParams.get('status')||review.status===url.searchParams.get('status')?[review]:[],total:1,page:1,pageSize:25});
  if(url.pathname===`/api/admin/answer-reviews/${ids[0]}`){Object.assign(review,{status:body.status,faq_question:body.faqQuestion,corrected_answer:body.correctedAnswer});return json({ok:true});}
  if(url.pathname===`/api/admin/answer-reviews/${ids[0]}/publish`){review.status='resolved';return json({ok:true,documentId:ids[0],reindexStarted:true});}
  if(url.pathname==='/api/admin/leads')return json({items:[{id:ids[0],code:'STB-TEST',need:'Sơn tường',status:'new'}],total:1});
  if(url.pathname===`/api/admin/leads/${ids[0]}`)return json({id:ids[0],code:'STB-TEST',name:'Khách mẫu',need:storedLead?.need||'Sơn tường',status:'new',handoff_summary:'Nhu cầu khách xác nhận: '+storedLead?.need,handoff_transcript:[{role:'user',content:'Tường ẩm có thể sơn ngay không?'},{role:'assistant',content:'Cần kiểm tra bề mặt.'}]});
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Kiểm thử tư vấn sơn</h1><script src="/widget.js" defer></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
try{
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://media.loveitopcdn.com/**',route=>route.abort());
  await page.goto(origin);await page.locator('.stb-launch').click();
  await page.getByRole('button',{name:'So sánh sơn',exact:true}).click();
  await page.locator('.stb-compare-options input').nth(0).check();await page.locator('.stb-compare-options input').nth(1).check();
  await page.getByRole('button',{name:'So sánh đã chọn'}).click();await page.locator('.stb-compare-table').waitFor();
  assert.equal(await page.locator('.stb-compare-table td').count(),6);assert.equal(await page.locator('.stb-compare-table img').count(),0);
  assert.match(await page.locator('.stb-compare-table').textContent(),/Chưa có dữ liệu đã xác minh/);
  assert.equal(await page.locator('.stb-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  await page.locator('.stb-compare-table').scrollIntoViewIfNeeded();
  await page.screenshot({path:fileURLToPath(new URL('../artifacts/sales-comparison-mobile.png',import.meta.url))});
  await page.locator('.stb-compare-options input').nth(2).check();await page.locator('.stb-compare-options input').nth(3).click();
  assert.equal(await page.locator('.stb-compare-options input').nth(3).isChecked(),false);
  await page.locator('.stb-textarea').fill(review.question);await page.locator('.stb-send').click();
  await page.getByRole('button',{name:'Chưa hữu ích',exact:true}).click();
  await page.locator('.stb-feedback textarea').fill('Cần giải thích kỹ phần xử lý ẩm');await page.getByRole('button',{name:'Gửi góp ý'}).click();
  await page.getByText('Đã ghi nhận để nhân viên kiểm tra và cải thiện câu trả lời.').waitFor();
  assert.ok(writes.some(w=>w.path.endsWith('/feedback')&&w.body.answerId===ids[0]&&w.body.rating==='not_helpful'));
  await page.getByRole('button',{name:'Nhờ nhân viên',exact:true}).click();
  await page.locator('.stb-handoff-preview summary').click();assert.match(await page.locator('.stb-handoff-preview').textContent(),/Tường ẩm/);
  await page.locator('.stb-lead [name="name"]').fill('Khách mẫu');await page.locator('.stb-lead [name="phone"]').fill('0912345678');
  await page.locator('.stb-lead [name="need"]').fill('Cần tư vấn xử lý tường ẩm trước khi sơn');await page.locator('.stb-lead [name="area"]').fill('Thủ Đức');
  await page.locator('.stb-lead [type="submit"]').click();await page.getByText('Đã lưu yêu cầu cùng tóm tắt trao đổi.').waitFor();
  assert.deepEqual(storedLead.productIds,ids.slice(0,2));assert.equal(storedLead.area,'Thủ Đức');
  console.log('PASS mobile comparison, missing data, XSS text, selection limit, customer feedback and handoff form');

  const staff=await browser.newPage({viewport:{width:1440,height:900}});staff.on('pageerror',e=>errors.push(e.message));
  await staff.goto(origin+'/admin.html');await staff.locator('#li-email').fill('test@example.com');await staff.locator('#li-pass').fill('test-only-password');await staff.locator('#li-btn').click();
  await staff.locator('[data-view="answerReviews"]').click();await staff.getByRole('button',{name:'Xem / xử lý'}).click();
  assert.equal(await staff.locator('#dlg img').count(),0);
  await staff.locator('#ar-answer').fill('Cần xử lý nguyên nhân gây ẩm và chuẩn bị bề mặt theo tài liệu sản phẩm trước khi thi công sơn.');
  await staff.getByRole('button',{name:'Duyệt vào kho tri thức'}).click();
  assert.equal(writes.filter(w=>w.path.endsWith('/publish')).length,0);
  await staff.locator('#ar-confirm').check();
  await staff.screenshot({path:fileURLToPath(new URL('../artifacts/answer-review-admin.png',import.meta.url))});
  await staff.getByRole('button',{name:'Duyệt vào kho tri thức'}).click();await staff.getByText('Đã duyệt; đang cập nhật chỉ mục RAG').waitFor();
  assert.ok(writes.some(w=>w.path.endsWith('/publish')&&w.body.confirmed===true));
  await staff.locator('[data-view="leads"]').click();await staff.getByRole('button',{name:'Chi tiết',exact:true}).click();
  await staff.getByRole('heading',{name:'Tóm tắt tiếp nhận'}).waitFor();assert.match(await staff.locator('#dlg').textContent(),/chưa được nhân viên xác nhận/);
  assert.deepEqual(errors,[]);
  console.log('PASS admin review queue, escaping, explicit approval, approved FAQ and staff handoff summary');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
