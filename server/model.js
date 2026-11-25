import { containerId, resolveIconUrl, safeUrl } from './icons.js';
export { safeUrl } from './icons.js';
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanString = (value, max = 200) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f]/.test(value);
export const validPort = value => Number.isInteger(value) && value > 0 && value <= 65535;
export function validateSettings(value) {
  if (!object(value)) throw new HttpError(400, 'Settings must be an object.');
  const host = value.tailscaleHostname;
  if (!cleanString(host, 253) || (host && !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.?$/.test(host))) throw new HttpError(400, 'Enter a hostname without a protocol, port, or path.');
  if (!['http', 'https'].includes(value.defaultScheme)) throw new HttpError(400, 'Choose HTTP or HTTPS.');
  if (!Number.isInteger(value.refreshSeconds) || value.refreshSeconds < 10 || value.refreshSeconds > 3600) throw new HttpError(400, 'Refresh interval must be 10–3600 seconds.');
  return { tailscaleHostname: host, defaultScheme: value.defaultScheme, refreshSeconds: value.refreshSeconds };
}
export function validateLayout(value) {
  if (!object(value) || value.version !== 1 || !Number.isInteger(value.revision) || value.revision < 0 || !Array.isArray(value.groups) || value.groups.length > 100 || !object(value.overrides)) throw new HttpError(400, 'Invalid dashboard layout.');
  const favorites = value.favorites === undefined ? [] : value.favorites;
  if (!Array.isArray(favorites) || favorites.length > 1000) throw new HttpError(400, 'Favorites must be a list of at most 1000 apps.');
  const groupIds = new Set(), containerIds = new Set();
  for (const id of favorites) {
    if (!cleanString(id, 300) || !id.trim() || containerIds.has(id)) throw new HttpError(400, 'Favorites must contain unique, nonempty app IDs.');
    containerIds.add(id);
  }
  const groups = value.groups.map(group => {
    if (!object(group) || !cleanString(group.id) || !group.id || !cleanString(group.name, 100) || !group.name.trim() || typeof group.collapsed !== 'boolean' || !Array.isArray(group.containerIds) || group.containerIds.length > 1000 || groupIds.has(group.id)) throw new HttpError(400, 'Invalid or duplicate group.');
    groupIds.add(group.id);
    for (const id of group.containerIds) {
      if (!cleanString(id, 300) || !id || containerIds.has(id)) throw new HttpError(400, 'Each app can appear in only one location: favorites or a group.');
      containerIds.add(id);
    }
    return { id: group.id, name: group.name.trim(), collapsed: group.collapsed, containerIds: [...group.containerIds] };
  });
  if (Object.keys(value.overrides).length > 2000) throw new HttpError(400, 'Too many app overrides.');
  const overrides = Object.create(null);
  for (const [id, entry] of Object.entries(value.overrides)) {
    if (!cleanString(id, 300) || !object(entry)) throw new HttpError(400, 'Invalid app override.');
    const override = {};
    if (entry.name !== undefined && entry.name !== '') { if (!cleanString(entry.name, 100)) throw new HttpError(400, 'App names must be at most 100 characters.'); override.name = entry.name; }
    if (entry.url !== undefined && entry.url !== '') { if (!cleanString(entry.url, 2000) || !safeUrl(entry.url)) throw new HttpError(400, 'App links must be HTTP or HTTPS URLs without credentials.'); override.url = entry.url; }
    if (entry.port !== undefined && entry.port !== null && entry.port !== '') { if (!validPort(entry.port)) throw new HttpError(400, 'App ports must be between 1 and 65535.'); override.port = entry.port; }
    if (entry.scheme !== undefined && entry.scheme !== '') { if (!['http', 'https'].includes(entry.scheme)) throw new HttpError(400, 'Choose HTTP or HTTPS.'); override.scheme = entry.scheme; }
    overrides[id] = override;
  }
  return { version: 1, revision: value.revision, favorites: [...favorites], groups, overrides };
}
export function normalizeContainer(raw, settings, overrides = {}, fallbackHostname = 'tower', serverUrl = `http://${fallbackHostname}`) {
  const originalName = String(raw.names?.[0] || raw.name || raw.id).replace(/^\//, '');
  const id = containerId(raw);
  const override = Object.hasOwn(overrides, id) ? overrides[id] : {};
  const ports = (raw.ports?.length ? raw.ports : raw.templatePorts || []).map(port => ({ privatePort: validPort(Number(port.privatePort)) ? Number(port.privatePort) : null, publicPort: validPort(Number(port.publicPort)) ? Number(port.publicPort) : null, type: String(port.type || 'TCP').toLowerCase() }));
  const host = settings.tailscaleHostname || fallbackHostname;
  const scheme = override.scheme || settings.defaultScheme;
  let url = null, urlSource = 'none', warning;
  const hostUrl = port => `${scheme}://${host}${port ? `:${port}` : ''}/`;
  if (override.url) { url = safeUrl(override.url)?.href || null; urlSource = 'override'; }
  else if (override.port) {
    const template = safeUrl(raw.webUiUrl);
    if (template) { template.hostname = host; template.port = String(override.port); if (override.scheme) template.protocol = `${scheme}:`; url = template.href; }
    else url = hostUrl(override.port);
    urlSource = 'override';
  }
  else {
    let template = raw.webUiUrl || raw.labels?.['net.unraid.docker.webui'] || '';
    if (template) {
      template = String(template).replace(/\[IP\]/gi, host).replace(/\[PORT:(\d+)\]/gi, (_match, number) => {
        const mapping = ports.find(port => port.type === 'tcp' && port.privatePort === Number(number) && port.publicPort);
        return mapping?.publicPort || (raw.hostConfig?.networkMode === 'host' ? number : '[UNRESOLVED]');
      }).replace(/\[PORT\]/gi, () => {
        const candidates = [...new Set(ports.filter(port => port.type === 'tcp' && port.publicPort).map(port => port.publicPort))];
        return candidates.length === 1 ? candidates[0] : '[UNRESOLVED]';
      });
      const parsed = safeUrl(template);
      if (parsed && !/\[.*\]/.test(template)) { parsed.hostname = host; if (override.scheme) parsed.protocol = `${scheme}:`; url = parsed.href; urlSource = 'template'; }
    }
    if (!url) {
      const candidates = [...new Set(ports.filter(port => port.type === 'tcp' && port.publicPort).map(port => port.publicPort))];
      if (candidates.length === 1) { url = hostUrl(candidates[0]); urlSource = 'port'; warning = 'Using the only published TCP port. Set a link override if this is not the web interface.'; }
      else warning = candidates.length > 1 ? 'Multiple ports found. Choose the web port or set a link in edit mode.' : 'No published web port found. Set a link in edit mode.';
    }
  }
  if (raw.discoveryWarning) warning = [raw.discoveryWarning, warning].filter(Boolean).join(' ');
  return { id, name: override.name || originalName, image: String(raw.image || ''), state: String(raw.state || 'unknown').toLowerCase(), status: String(raw.status || ''), icon: resolveIconUrl(raw, serverUrl) ? `/api/containers/${encodeURIComponent(id)}/icon` : null, ports, url, urlSource, ...(warning ? { warning } : {}) };
}
export function buildUnraidShortcut(serverUrl, settings, overrides = {}) {
  const id = 'shortcut:unraid';
  const override = Object.hasOwn(overrides, id) ? overrides[id] : {};
  const target = safeUrl(serverUrl);
  if (!target) throw new Error('Unraid dashboard URL must be HTTP or HTTPS without credentials.');
  target.pathname = target.pathname.replace(/\/graphql\/?$/, '/') || '/';
  target.search = '';
  target.hash = '';
  if (settings.tailscaleHostname) target.hostname = settings.tailscaleHostname;
  if (override.scheme) target.protocol = `${override.scheme}:`;
  if (override.port) target.port = String(override.port);
  const custom = override.url && safeUrl(override.url);
  return { id, kind: 'shortcut', name: override.name || 'Unraid', url: custom ? custom.href : target.href, icon: '/icons/unraid-home.svg', ports: [], state: 'link', status: 'Server dashboard', urlSource: override.url || override.port || override.scheme ? 'override' : 'server' };
}
