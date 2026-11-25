// Schema: https://github.com/unraid/api/blob/main/api/generated-schema.graphql
// Auth: https://docs.unraid.net/API/how-to-use-the-api/#using-api-keys
const basicFields = 'id names image state status ports { privatePort publicPort type }';
const coreFields = 'hostConfig { networkMode } labels';
const extraFields = `iconUrl webUiUrl templatePorts { privatePort publicPort type } ${coreFields}`;
function allowPartialPortErrors(payload, variant) {
  const legacy = variant.startsWith('legacy');
  const containers = legacy ? payload.data?.dockerContainers : payload.data?.docker?.containers;
  if (!Array.isArray(containers)) return false;
  return payload.errors.every(error => {
    const p = error.path;
    const offset = legacy ? 1 : 2;
    return error.message === 'Value is not a valid TCP port: 0' && error.extensions?.code === 'INTERNAL_SERVER_ERROR' && Array.isArray(p) && p.length === offset + 4 && (legacy ? p[0] === 'dockerContainers' : p[0] === 'docker' && p[1] === 'containers') && Number.isInteger(p[offset]) && p[offset] >= 0 && p[offset] < containers.length && p[offset + 1] === 'ports' && Number.isInteger(p[offset + 2]) && p[offset + 2] >= 0 && ['privatePort', 'publicPort'].includes(p[offset + 3]) && Array.isArray(containers[p[offset]]?.ports) && p[offset + 2] < containers[p[offset]].ports.length && containers[p[offset]].ports[p[offset + 2]]?.[p[offset + 3]] === null;
  });
}
export class UnraidClient {
  constructor({ url, apiKey, fetchImpl = fetch }) {
    this.url = new URL(url);
    if (!['http:', 'https:'].includes(this.url.protocol) || this.url.username || this.url.password || this.url.search || this.url.hash) throw new Error('UNRAID_URL must be an HTTP or HTTPS URL without credentials, query, or fragment.');
    if (!this.url.pathname.endsWith('/graphql')) this.url.pathname = `${this.url.pathname.replace(/\/$/, '')}/graphql`;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.variant = null;
  }
  async containers() {
    const variants = this.variant ? [this.variant] : ['modern', 'modern-core', 'modern-basic', 'legacy', 'legacy-core', 'legacy-basic'];
    for (const variant of variants) {
      const fields = `${basicFields} ${variant.endsWith('basic') ? '' : variant.endsWith('core') ? coreFields : extraFields}`;
      const query = variant.startsWith('legacy') ? `query LauncherContainers { dockerContainers { ${fields} } }` : `query LauncherContainers { docker { containers { ${fields} } } }`;
      let response;
      try { response = await this.fetchImpl(this.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(8000), redirect: 'error' }); }
      catch { throw new Error('Could not reach the Unraid API. Check the server address, network access, and HTTPS certificate.'); }
      if ([401, 403].includes(response.status)) throw new Error('Unraid rejected the API key. Check its Docker read permission.');
      if (response.status === 429) throw new Error('Unraid is limiting API requests. Please wait before refreshing.');
      let payload;
      try { payload = await response.json(); } catch { throw new Error('Unraid returned a non-JSON response. Check the GraphQL endpoint address.'); }
      if (payload.errors?.length && !allowPartialPortErrors(payload, variant)) {
        const validation = payload.errors.every(error => error.extensions?.code === 'GRAPHQL_VALIDATION_FAILED' || /Cannot query field|Unknown type|Unknown argument/.test(error.message || ''));
        if (validation && this.variant) { this.variant = null; return this.containers(); }
        if (validation) continue;
        if (payload.errors.some(error => /FORBIDDEN|UNAUTHENTICATED/.test(error.extensions?.code || ''))) throw new Error('Unraid rejected the API key. Check its Docker read permission.');
        throw new Error('The Unraid Docker query failed. Check API key permissions and API compatibility.');
      }
      if (!response.ok) throw new Error(`Unraid API returned HTTP ${response.status}.`);
      const containers = variant.startsWith('legacy') ? payload.data?.dockerContainers : payload.data?.docker?.containers;
      if (!Array.isArray(containers)) throw new Error('Docker data is unavailable. Check that Docker is enabled on Unraid.');
      this.variant = variant;
      const offset = variant.startsWith('legacy') ? 1 : 2;
      const affected = new Map();
      for (const error of payload.errors || []) {
        const index = error.path[offset];
        if (!affected.has(index)) affected.set(index, new Set());
        affected.get(index).add(error.path[offset + 2]);
      }
      return containers.map((container, index) => affected.has(index) ? { ...container, ports: container.ports.filter((_port, portIndex) => !affected.get(index).has(portIndex)), discoveryWarning: 'Unraid reported an invalid port mapping. That port was ignored; check the web link if needed.' } : container);
    }
    throw new Error('This Unraid API does not expose the expected Docker fields. Update the Unraid API or check its schema.');
  }
}
export const demoContainers = [
  ['plex', 'Plex', 'plexinc/pms-docker', 32400, 'RUNNING', '/web'],
  ['immich', 'Immich', 'ghcr.io/immich-app/immich-server', 2283, 'RUNNING', '/'],
  ['home-assistant', 'Home Assistant', 'ghcr.io/home-assistant/home-assistant', 8123, 'RUNNING', '/'],
  ['jellyfin', 'Jellyfin', 'jellyfin/jellyfin', 8096, 'RUNNING', '/'],
  ['sonarr', 'Sonarr', 'lscr.io/linuxserver/sonarr', 8989, 'RUNNING', '/'],
  ['radarr', 'Radarr', 'lscr.io/linuxserver/radarr', 7878, 'RUNNING', '/'],
  ['qbittorrent', 'qBittorrent', 'lscr.io/linuxserver/qbittorrent', 8080, 'PAUSED', '/'],
  ['grafana', 'Grafana', 'grafana/grafana', 3001, 'RUNNING', '/'],
  ['uptime-kuma', 'Uptime Kuma', 'louislam/uptime-kuma', 3002, 'EXITED', '/'],
].map(([id, name, image, port, state, pathname]) => ({ id, names: [`/${name}`], iconUrl: `https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/png/${id}.png`, image, state, status: state === 'RUNNING' ? 'Up 3 days' : state === 'PAUSED' ? 'Paused' : 'Exited (0)', ports: [{ privatePort: port, publicPort: port, type: 'TCP' }], webUiUrl: `http://192.0.2.10:${port}${pathname}` }));
