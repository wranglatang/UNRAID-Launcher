import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveIconUrl, createIconLoader } from './icons.js';
import { normalizeContainer } from './model.js';
import { createApp } from './app.js';
const raw = { id: 'docker-id', names: ['/Plex'], image: 'plex', state: 'RUNNING', status: 'Up', ports: [], iconUrl: '/state/plugins/dockerMan/images/Plex-icon.png' };
const settings = { tailscaleHostname: 'tower.tailnet.ts.net', defaultScheme: 'http', refreshSeconds: 30 };
const png = () => new Response(Uint8Array.from([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
test('Unraid template icons resolve absolute and relative URLs against server origin, never magic DNS', () => {
  assert.equal(resolveIconUrl(raw, 'https://192.0.2.10:8443/graphql'), 'https://192.0.2.10:8443/state/plugins/dockerMan/images/Plex-icon.png');
  assert.equal(resolveIconUrl({ iconUrl: 'https://icons.example/app.png' }), 'https://icons.example/app.png');
  assert.equal(resolveIconUrl({ labels: { 'net.unraid.docker.icon': '/icons/plex.png' } }, 'http://tower'), 'http://tower/icons/plex.png');
  for (const iconUrl of ['file:///secret', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://user:password@icons.example/a.png']) assert.equal(resolveIconUrl({ iconUrl }), null);
  assert.equal(normalizeContainer(raw, settings).icon, '/api/containers/container%3APlex/icon');
  assert.equal(normalizeContainer({ ...raw, iconUrl: null }, settings).icon, null);
});
test('loader never forwards credentials, disallows redirects, coalesces requests and expires bounded cache', async () => {
  let clock = 0; const calls = [];
  const load = createIconLoader({ now: () => clock, maxEntries: 1, ttlMs: 10, fetchImpl: async (url, options) => { calls.push({ url, options }); return png(); } });
  await Promise.all([load('http://tower/a.png'), load('http://tower/a.png')]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options.headers, { accept: 'image/*' });
  assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.redirect, 'error');
  await load('http://tower/a.png'); assert.equal(calls.length, 1);
  await load('http://tower/b.png'); await load('http://tower/a.png'); assert.equal(calls.length, 3);
  clock = 20; await load('http://tower/a.png'); assert.equal(calls.length, 4);
});
test('loader rejects HTML, advertised oversized images and oversized streaming bodies', async () => {
  const responses = [new Response('<html>sign in</html>', { headers: { 'content-type': 'text/html' } }), new Response('small', { headers: { 'content-type': 'image/png', 'content-length': '9999' } }), new Response('123456', { headers: { 'content-type': 'image/png' } })];
  for (const response of responses) {
    const load = createIconLoader({ maxBytes: 5, fetchImpl: async () => response });
    await assert.rejects(load('http://tower/icon.png'), /supported image|too large/);
  }
});
test('deadline bounds stalled headers and body even when transport ignores abort', async () => {
  const headers = createIconLoader({ timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) });
  await assert.rejects(headers('http://tower/a.png'), /timed out/);
  const body = createIconLoader({ timeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'image/png' } }) });
  await assert.rejects(body('http://tower/b.png'), /timed out/);
});
test('icon endpoint permits only cached discovered metadata and safely serves SVG without API key', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'unraid-icons-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const calls = [];
  const app = await createApp({ env: { DATA_DIR: dir, UNRAID_API_KEY: 'private-api-key', UNRAID_URL: 'http://tower:8080' }, client: { containers: async () => [raw] }, fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'content-type': 'image/svg+xml' } }); } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/containers/unknown/icon?url=http://evil/`)).status, 404); assert.equal(calls.length, 0);
  const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
  const response = await fetch(base + dashboard.containers[0].icon + '?url=http://evil/');
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.match(response.headers.get('content-security-policy'), /sandbox/); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(calls[0].url, 'http://tower:8080/state/plugins/dockerMan/images/Plex-icon.png');
  assert.equal(JSON.stringify(calls).includes('private-api-key'), false);
  await fetch(base + dashboard.containers[0].icon); assert.equal(calls.length, 1);
});
test('icon failures return a fallback-friendly error while dashboard discovery remains healthy', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'unraid-icons-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const app = await createApp({ env: { DATA_DIR: dir, UNRAID_API_KEY: 'key' }, client: { containers: async () => [raw] }, fetchImpl: async () => { throw new Error('upstream private details'); } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
  const icon = await fetch(base + dashboard.containers[0].icon); assert.equal(icon.status, 502); assert.equal(await icon.text(), '');
  assert.equal((await (await fetch(`${base}/api/dashboard`)).json()).connection.connected, true);
});
