// Keep the early navigation guard in sync between the standalone head script and widget bundle.
import { readFile, writeFile } from 'node:fs/promises';
const guard = await readFile(new URL('../public/site-guard.js', import.meta.url), 'utf8');
const widgetPath = new URL('../public/widget.js', import.meta.url);
const existing = await readFile(widgetPath, 'utf8');
const marker = '/* STB_WIDGET_UI */';
const ui = existing.includes(marker) ? existing.slice(existing.indexOf(marker) + marker.length).trimStart() : existing;
const bundle = `${guard.trimEnd()}\n\n${marker}\n${ui}`;
if (bundle !== existing) await writeFile(widgetPath, bundle);
