import 'dotenv/config';
import { env } from '../src/config/env.js';

const endpoint = `${env.PUBLIC_BASE_URL}/api/zalo-chatbot/dynamic`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-stb-chatbot-key': env.DYNAMIC_API_KEY },
  body: JSON.stringify({ action: 'welcome', user_id: 'test-user' })
});
console.log('HTTP', response.status);
console.dir(await response.json(), { depth: null });
