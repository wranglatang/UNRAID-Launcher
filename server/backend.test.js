import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore, emptyLayout } from './store.js';
import { normalizeContainer, validateLayout, validateSettings, buildUnraidShortcut } from './model.js';
import { UnraidClient } from './unraid.js';
import { createApp } from './app.js';
const settings = { tailscaleHostname: 'tower.tailnet.ts.net', defaultScheme: 'http', refreshSeconds: 30 };
const raw = { id: 'changing-docker-id', names: ['/Plex'], image: 'plex', state: 'RUNNING', status: 'Up 3 hours', ports: [{ privatePort: 32400, publicPort: 32401, type: 'TCP' }] };
async function directory(t) { const dir = await mkdtemp(path.join(tmpdir(), 'unraid-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
test('template URLs rewrite hostname and map internal ports while preserving paths', () => {
  const app = normalizeContainer({ ...raw, webUiUrl: 'http://[IP]:[PORT:32400]/web?hello=1' }, settings);
  assert.equal(app.url, 'http://tower.tailnet.ts.net:32401/web?hello=1');
  assert.equal(app.urlSource, 'template'); assert.equal(app.id, 'container:Plex'); assert.equal(app.state, 'running');
  assert.equal(normalizeContainer({ ...raw, webUiUrl: 'http://[IP]:[PORT]/web' }, settings).url, 'http://tower.tailnet.ts.net:32401/web');
});
test('explicit port keeps resolved template path and scheme', () => {
  const app = normalizeContainer({ ...raw, webUiUrl: 'https://10.168.40.1:32400/web' }, settings, { 'container:Plex': { port: 5555 } });
  assert.equal(app.url, 'https://tower.tailnet.ts.net:5555/web');
});
test('ambiguous and UDP-only ports never invent a link', () => {
  assert.equal(normalizeContainer({ ...raw, ports: [...raw.ports, { privatePort: 80, publicPort: 8888, type: 'TCP' }] }, settings).url, null);
  assert.equal(normalizeContainer({ ...raw, ports: [{ privatePort: 53, publicPort: 53, type: 'UDP' }] }, settings).url, null);
  assert.match(normalizeContainer(raw, settings).warning, /only published/);
});
test('HTTP-only overrides and normalized persisted data prevent executable URLs and prototype changes', () => {
  assert.throws(() => validateLayout({ ...emptyLayout(), overrides: { x: { url: 'javascript:alert(1)' } } }), /HTTP/);
  assert.throws(() => validateLayout({ ...emptyLayout(), overrides: { x: { url: 'https://user:secret@example.com/' } } }), /HTTP/);
  assert.throws(() => validateSettings({ ...settings, tailscaleHostname: 'tower:1234/path' }), /hostname/);
  assert.throws(() => validateLayout({ ...emptyLayout(), groups: [{ id: 'a', name: 'A', collapsed: false, containerIds: ['x', 'x'] }] }), /only one/);
  const layout = validateLayout(JSON.parse('{"version":1,"revision":0,"groups":[],"overrides":{"__proto__":{"name":"safe"}}}'));
  assert.equal(Object.getPrototypeOf(layout.overrides), null);
});
test('disk state survives restart; concurrent saves reject outdated revisions', async t => {
  const dir = await directory(t), store = await createStore(dir, settings);
  const results = await Promise.allSettled([store.saveLayout(emptyLayout()), store.saveLayout(emptyLayout())]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal((await createStore(dir, settings)).read().layout.revision, 1);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'dashboard.json'), 'utf8')).layout.revision, 1);
});
test('corrupt saved data is preserved and refuses startup', async t => {
  const dir = await directory(t); await writeFile(path.join(dir, 'dashboard.json'), '{bad');
  await assert.rejects(createStore(dir, settings), /preserved/);
  assert.equal(await readFile(path.join(dir, 'dashboard.json'), 'utf8'), '{bad');
});
test('modern query and API key header, validation fallback, and query variant cache', async () => {
  const calls = [];
  const client = new UnraidClient({ url: 'http://tower', apiKey: 'super-secret', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const query = JSON.parse(options.body).query;
    return { ok: true, status: 200, json: async () => query.includes('iconUrl') ? { errors: [{ message: 'Cannot query field iconUrl' }] } : { data: { docker: { containers: [raw] } } } };
  } });
  assert.equal((await client.containers()).length, 1); await client.containers();
  assert.equal(calls.length, 3); assert.equal(calls[0].url.href, 'http://tower/graphql');
  assert.equal(calls[0].options.headers['x-api-key'], 'super-secret'); assert.equal(calls[0].options.redirect, 'error');
  assert.match(JSON.parse(calls[0].options.body).query, /docker \{ containers/);
});
test('legacy root fallback only follows validation errors', async () => {
  const client = new UnraidClient({ url: 'http://tower/graphql', apiKey: 'key', fetchImpl: async (_url, options) => ({ ok: true, status: 200, json: async () => JSON.parse(options.body).query.includes('dockerContainers') ? { data: { dockerContainers: [raw] } } : { errors: [{ extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] } }) });
  assert.equal((await client.containers()).length, 1);
  const denied = new UnraidClient({ url: 'http://tower', apiKey: 'key', fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ data: { docker: { containers: [raw] } }, errors: [{ message: 'super-secret upstream details', extensions: { code: 'FORBIDDEN' } }] }) }) });
  await assert.rejects(denied.containers(), /Docker read permission/);
});
async function running(t, options = {}) {
  const dataDir = await directory(t);
  const app = await createApp({ env: { DATA_DIR: dataDir, ...options.env }, ...options });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test('API shows setup explicitly, protects cross-origin writes, and saves volume layout', async t => {
  const base = await running(t);
  const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(dashboard.connection.configured, false); assert.equal(dashboard.containers.length, 0);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const save = body => fetch(`${base}/api/layout`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await fetch(`${base}/api/layout`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: JSON.stringify(emptyLayout()) })).status, 403);
  assert.equal((await save(emptyLayout())).status, 200); assert.equal((await save(emptyLayout())).status, 409);
});
test('upstream failure retains last containers and marks stale without leaking secret', async t => {
  let clock = 0, call = 0;
  const base = await running(t, { env: { DATA_DIR: await directory(t), UNRAID_API_KEY: 'super-secret' }, now: () => clock, client: { containers: async () => { if (call++) throw new Error('Network unavailable'); return [raw]; } } });
  const initial = await (await fetch(`${base}/api/dashboard`)).json(); assert.equal(initial.connection.connected, true);
  clock = 6000;
  const stale = await (await fetch(`${base}/api/dashboard`)).json(); assert.equal(stale.connection.stale, true); assert.equal(stale.connection.connected, false); assert.equal(stale.containers.length, 1);
  assert.equal(JSON.stringify(stale).includes('super-secret'), false);
});
test('old saved layouts acquire empty favorites without changing their revision or groups', async t => {
  const dir = await directory(t);
  const oldLayout = { version: 1, revision: 7, groups: [{ id: 'media', name: 'Media', collapsed: false, containerIds: ['container:Plex'] }], overrides: {} };
  await writeFile(path.join(dir, 'dashboard.json'), JSON.stringify({ layout: oldLayout, settings }));
  const store = await createStore(dir, settings);
  assert.deepEqual(store.read().layout.favorites, []);
  assert.equal(store.read().layout.revision, 7);
  assert.deepEqual(store.read().layout.groups, oldLayout.groups);
  assert.deepEqual(validateLayout(oldLayout).favorites, []);
  assert.deepEqual(emptyLayout().favorites, []);
});
test('favorites persist across restart and retain revision conflict protection', async t => {
  const dir = await directory(t), store = await createStore(dir, settings);
  const favoriteLayout = { ...emptyLayout(), favorites: ['container:Plex', 'container:Immich'] };
  const saved = await store.saveLayout(favoriteLayout);
  assert.deepEqual(saved.favorites, favoriteLayout.favorites);
  const restarted = await createStore(dir, settings);
  assert.deepEqual(restarted.read().layout.favorites, favoriteLayout.favorites);
  await assert.rejects(restarted.saveLayout(favoriteLayout), error => error.status === 409);
  assert.deepEqual(restarted.read().layout.favorites, favoriteLayout.favorites);
  const moved = await restarted.saveLayout({ ...saved, favorites: ['container:Immich'], groups: [{ id: 'media', name: 'Media', collapsed: false, containerIds: ['container:Plex'] }] });
  assert.equal(moved.revision, 2);
  assert.deepEqual(moved.favorites, ['container:Immich']);
});
test('favorites reject duplicate, invalid, oversized and overlapping app locations', () => {
  for (const favorites of [null, 'container:Plex', ['x', 'x'], [''], ['   '], [12], ['bad\nID'], ['x'.repeat(301)], Array.from({ length: 1001 }, (_, index) => String(index))]) {
    assert.throws(() => validateLayout({ ...emptyLayout(), favorites }), error => error.status === 400);
  }
  assert.throws(() => validateLayout({ ...emptyLayout(), favorites: ['container:Plex'], groups: [{ id: 'media', name: 'Media', collapsed: false, containerIds: ['container:Plex'] }] }), /only one location/);
});
test('environment hostname overrides older saved hostname without mutating the saved file on read', async t => {
  const dir = await directory(t);
  const oldState = { layout: emptyLayout(), settings: { ...settings, tailscaleHostname: 'old.tailnet.ts.net' } };
  await writeFile(path.join(dir, 'dashboard.json'), JSON.stringify(oldState));
  const base = await running(t, { env: { DATA_DIR: dir, UNRAID_API_KEY: 'key', TAILSCALE_HOSTNAME: 'env.tailnet.ts.net' }, client: { containers: async () => [raw] } });
  const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(dashboard.settings.tailscaleHostname, 'env.tailnet.ts.net');
  assert.equal(dashboard.settings.tailscaleHostnameManaged, true);
  assert.equal(new URL(dashboard.containers[0].url).hostname, 'env.tailnet.ts.net');
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'dashboard.json'), 'utf8')), oldState);
});
test('settings writes cannot override a managed hostname but allow scheme and refresh edits', async t => {
  const dir = await directory(t);
  const base = await running(t, { env: { DATA_DIR: dir, UNRAID_API_KEY: 'key', TAILSCALE_HOSTNAME: 'env.tailnet.ts.net' }, client: { containers: async () => [raw] } });
  const response = await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tailscaleHostname: 'https://invalid/ignored', tailscaleHostnameManaged: false, defaultScheme: 'https', refreshSeconds: 60 }) });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.deepEqual(updated, { tailscaleHostname: 'env.tailnet.ts.net', tailscaleHostnameManaged: true, defaultScheme: 'https', refreshSeconds: 60 });
  const persisted = JSON.parse(await readFile(path.join(dir, 'dashboard.json'), 'utf8')).settings;
  assert.equal(persisted.tailscaleHostname, 'env.tailnet.ts.net');
  assert.equal(Object.hasOwn(persisted, 'tailscaleHostnameManaged'), false);
  const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(dashboard.settings.tailscaleHostnameManaged, true);
  assert.equal(dashboard.containers[0].url, 'https://env.tailnet.ts.net:32401/');
});
test('empty environment hostname retains manual settings and ignores client-provided managed metadata', async t => {
  const dir = await directory(t);
  const base = await running(t, { env: { DATA_DIR: dir, UNRAID_API_KEY: 'key', TAILSCALE_HOSTNAME: '' }, client: { containers: async () => [raw] } });
  const response = await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tailscaleHostname: 'manual.tailnet.ts.net', tailscaleHostnameManaged: true, defaultScheme: 'http', refreshSeconds: 45 }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tailscaleHostnameManaged, false);
  const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(dashboard.settings.tailscaleHostname, 'manual.tailnet.ts.net');
  assert.equal(dashboard.settings.tailscaleHostnameManaged, false);
  assert.equal(new URL(dashboard.containers[0].url).hostname, 'manual.tailnet.ts.net');
  assert.equal(Object.hasOwn(JSON.parse(await readFile(path.join(dir, 'dashboard.json'), 'utf8')).settings, 'tailscaleHostnameManaged'), false);
});
test('invalid environment hostname is rejected during startup', async t => {
  const dir = await directory(t);
  await assert.rejects(createApp({ env: { DATA_DIR: dir, TAILSCALE_HOSTNAME: 'https://tower:1234/' } }), /hostname/);
});
test('known nullable port-zero serialization errors preserve partial containers with an affected-app warning', async () => {
  const partial = { ...raw, ports: [{ privatePort: null, publicPort: 8080, type: 'TCP' }] };
  const payload = { data: { docker: { containers: [partial, raw] } }, errors: [{ message: 'Value is not a valid TCP port: 0', extensions: { code: 'INTERNAL_SERVER_ERROR' }, path: ['docker', 'containers', 0, 'ports', 0, 'privatePort'] }] };
  const client = new UnraidClient({ url: 'http://tower', apiKey: 'key', fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload }) });
  const containers = await client.containers();
  assert.equal(containers.length, 2);
  assert.match(normalizeContainer(containers[0], settings).warning, /invalid port mapping/);
  assert.equal(normalizeContainer(containers[0], settings).ports.length, 0);
  assert.equal(normalizeContainer(containers[0], settings).url, null);
  assert.equal(containers[1].discoveryWarning, undefined);
});
test('partial data with unrelated errors or mismatched nullable port paths remains rejected', async () => {
  const baseError = { message: 'Value is not a valid TCP port: 0', extensions: { code: 'INTERNAL_SERVER_ERROR' }, path: ['docker', 'containers', 0, 'ports', 0, 'privatePort'] };
  const containers = [{ ...raw, ports: [{ privatePort: null, publicPort: 8080, type: 'TCP' }] }];
  for (const errors of [
    [{ ...baseError, message: 'Some internal server error' }],
    [{ ...baseError, extensions: { code: 'FORBIDDEN' } }],
    [{ ...baseError, path: ['docker', 'containers', 99, 'ports', 0, 'privatePort'] }],
    [{ ...baseError, path: ['docker', 'containers', 0, 'ports', 0, 'publicPort'] }],
    [{ ...baseError, path: ['docker', 'containers', 0, 'labels'] }],
    [baseError, { message: 'Not authorized', extensions: { code: 'UNAUTHENTICATED' } }],
  ]) {
    const client = new UnraidClient({ url: 'http://tower', apiKey: 'key', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { docker: { containers } }, errors }) }) });
    await assert.rejects(client.containers(), /query failed|read permission/);
  }
});
test('Unraid shortcut uses Magic DNS while preserving the server scheme, port and base path', () => {
  const shortcut = buildUnraidShortcut('https://10.168.40.1:8443/base/graphql', settings);
  assert.equal(shortcut.url, 'https://tower.tailnet.ts.net:8443/base/');
  assert.equal(shortcut.id, 'shortcut:unraid');
  assert.equal(shortcut.kind, 'shortcut');
  assert.equal(shortcut.icon, '/icons/unraid-home.svg');
  assert.equal(shortcut.urlSource, 'server');
  assert.equal(shortcut.state, 'link');
  assert.deepEqual(shortcut.ports, []);
  assert.equal(buildUnraidShortcut('http://10.168.40.1/graphql/', settings).url, 'http://tower.tailnet.ts.net/');
  assert.equal(buildUnraidShortcut('http://10.168.40.1/base', { ...settings, tailscaleHostname: '' }).url, 'http://10.168.40.1/base');
});
test('Unraid shortcut supports persisted name, port, scheme and full URL overrides', () => {
  const override = validateLayout({ ...emptyLayout(), overrides: { 'shortcut:unraid': { name: 'My server', port: 9443, scheme: 'https' } } }).overrides;
  const shortcut = buildUnraidShortcut('http://10.168.40.1/graphql', settings, override);
  assert.equal(shortcut.name, 'My server');
  assert.equal(shortcut.url, 'https://tower.tailnet.ts.net:9443/');
  assert.equal(shortcut.urlSource, 'override');
  assert.equal(buildUnraidShortcut('http://10.168.40.1', settings, { 'shortcut:unraid': { url: 'https://custom.example/dashboard', port: 4444 } }).url, 'https://custom.example/dashboard');
  assert.throws(() => validateLayout({ ...emptyLayout(), overrides: { 'shortcut:unraid': { url: 'https://user:secret@example.com/' } } }), /without credentials/);
});
test('server shortcut remains usable with API disconnected and never changes Docker counts', async t => {
  const disconnected = await running(t, { env: { DATA_DIR: await directory(t), TAILSCALE_HOSTNAME: 'server.tailnet.ts.net' } });
  const setup = await (await fetch(`${disconnected}/api/dashboard`)).json();
  assert.equal(setup.connection.connected, false);
  assert.equal(setup.containers.length, 0);
  assert.equal(setup.shortcuts.length, 1);
  assert.equal(setup.shortcuts[0].url, 'http://server.tailnet.ts.net/');
  assert.equal((await fetch(`${disconnected}/api/containers/shortcut%3Aunraid/icon`)).status, 404);
  const connected = await running(t, { env: { DATA_DIR: await directory(t), UNRAID_API_KEY: 'key' }, client: { containers: async () => Array.from({ length: 50 }, (_, index) => ({ ...raw, names: [`/container-${index}`] })) } });
  const data = await (await fetch(`${connected}/api/dashboard`)).json();
  assert.equal(data.containers.length, 50);
  assert.equal(data.shortcuts.length, 1);
  const failed = await running(t, { env: { DATA_DIR: await directory(t), UNRAID_API_KEY: 'key' }, client: { containers: async () => { throw new Error('Unreachable'); } } });
  const failure = await (await fetch(`${failed}/api/dashboard`)).json();
  assert.equal(failure.connection.connected, false);
  assert.equal(failure.shortcuts[0].url, 'http://tower/');
});
