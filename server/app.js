import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createStore } from './store.js';
import { HttpError, normalizeContainer, validateSettings, buildUnraidShortcut } from './model.js';
import { UnraidClient, demoContainers } from './unraid.js';
import { containerId, createIconLoader, resolveIconUrl } from './icons.js';
export async function createApp({ env = process.env, fetchImpl = fetch, client: suppliedClient, now = Date.now } = {}) {
  const serverUrl = env.UNRAID_URL || 'http://tower';
  const client = suppliedClient || new UnraidClient({ url: serverUrl, apiKey: env.UNRAID_API_KEY || '', fetchImpl });
  const demo = env.DEMO_MODE === 'true';
  const loadIcon = createIconLoader({ fetchImpl, now });
  const defaults = validateSettings({ tailscaleHostname: env.TAILSCALE_HOSTNAME || '', defaultScheme: 'http', refreshSeconds: 30 });
  const tailscaleHostnameManaged = Boolean(defaults.tailscaleHostname);
  const effectiveSettings = settings => ({ ...settings, ...(tailscaleHostnameManaged ? { tailscaleHostname: defaults.tailscaleHostname } : {}), tailscaleHostnameManaged });
  const store = await createStore(path.resolve(env.DATA_DIR || './data'), defaults);
  if (demo && store.read().layout.revision === 0) {
    const ids = demoContainers.map(container => `container:${container.names[0].replace(/^\//, '')}`);
    await store.saveLayout({ version: 1, revision: 0, favorites: [], groups: [{ id: 'media', name: 'Media & entertainment', collapsed: false, containerIds: ids.slice(0, 4) }, { id: 'automation', name: 'Automation', collapsed: false, containerIds: ids.slice(4, 7) }, { id: 'infrastructure', name: 'Infrastructure', collapsed: false, containerIds: ids.slice(7) }], overrides: {} });
  }
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site') return next(new HttpError(403, 'Cross-site changes are not allowed.'));
      if (origin) { try { if (new URL(origin).host !== req.get('host')) return next(new HttpError(403, 'Cross-site changes are not allowed.')); } catch { return next(new HttpError(403, 'Invalid request origin.')); } }
      if (!req.is('application/json')) return next(new HttpError(415, 'Use application/json for dashboard changes.'));
    }
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  let rawContainers = [], lastSyncedAt, lastAttempt = -Infinity, connectionError, inFlight;
  async function sync() {
    if (inFlight) return inFlight;
    if (now() - lastAttempt < 5000) return;
    lastAttempt = now();
    inFlight = Promise.resolve().then(async () => {
      try { rawContainers = demo ? demoContainers : await client.containers(); lastSyncedAt = new Date(now()).toISOString(); connectionError = undefined; }
      catch (error) { connectionError = error.message; }
      finally { inFlight = undefined; }
    });
    return inFlight;
  }
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/dashboard', async (_req, res) => {
    const configured = demo || Boolean(env.UNRAID_API_KEY);
    if (configured) await sync();
    const saved = store.read();
    const layout = saved.layout, settings = effectiveSettings(saved.settings);
    res.json({ containers: rawContainers.map(container => normalizeContainer(container, settings, layout.overrides, new URL(serverUrl).hostname, serverUrl)), shortcuts: [buildUnraidShortcut(serverUrl, settings, layout.overrides)], layout, settings, connection: { configured, connected: configured && Boolean(lastSyncedAt) && !connectionError, demo, stale: Boolean(lastSyncedAt && connectionError), ...(connectionError ? { error: connectionError } : !configured ? { error: 'Add UNRAID_API_KEY to connect your server.' } : {}), ...(lastSyncedAt ? { lastSyncedAt } : {}) }, server: { name: demo ? 'Demo server' : 'Unraid', url: serverUrl } });
  });
  app.get('/api/containers/:id/icon', async (req, res) => {
    const raw = rawContainers.find(container => containerId(container) === req.params.id);
    const url = raw && resolveIconUrl(raw, serverUrl);
    if (!url) return res.status(404).end();
    try {
      const icon = await loadIcon(url);
      res.set({ 'Content-Type': icon.type, 'Cache-Control': 'private, max-age=600', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'", 'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin' });
      res.send(icon.bytes);
    } catch { res.status(502).end(); }
  });
  app.put('/api/layout', async (req, res) => res.json(await store.saveLayout(req.body)));
  app.put('/api/settings', async (req, res) => {
    const body = req.body;
    const submitted = tailscaleHostnameManaged && body && typeof body === 'object' && !Array.isArray(body) ? { ...body, tailscaleHostname: defaults.tailscaleHostname } : body;
    res.json(effectiveSettings(await store.saveSettings(submitted)));
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  const dist = path.resolve('dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    const status = error instanceof HttpError ? error.status : error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
    res.status(status).json({ error: error instanceof HttpError ? error.message : status === 400 ? 'Invalid JSON body.' : status === 413 ? 'Dashboard request is too large.' : 'Could not save dashboard data. Check the data volume is writable.' });
  });
  return app;
}
