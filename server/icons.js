export function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null; } catch { return null; }
}
export function containerId(raw) {
  return `container:${String(raw.names?.[0] || raw.name || raw.id).replace(/^\//, '')}`;
}
export function resolveIconUrl(raw, serverUrl = 'http://10.168.40.1') {
  const value = raw.iconUrl || raw.labels?.['net.unraid.docker.icon'];
  if (typeof value !== 'string' || !value.trim() || value.length > 2000 || /[\u0000-\u001f]/.test(value)) return null;
  try {
    const parsed = new URL(value.trim(), new URL(serverUrl).origin);
    return safeUrl(parsed.href)?.href || null;
  } catch { return null; }
}
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/avif']);
export function createIconLoader({ fetchImpl = fetch, now = Date.now, timeoutMs = 5000, maxBytes = 2 * 1024 * 1024, maxEntries = 64, maxCacheBytes = 8 * 1024 * 1024, ttlMs = 10 * 60 * 1000 } = {}) {
  const cache = new Map(), pending = new Map();
  let cachedBytes = 0;
  function remove(key) { const entry = cache.get(key); if (entry) cachedBytes -= entry.bytes.length; cache.delete(key); }
  function remember(url, entry) {
    remove(url);
    while (cache.size >= maxEntries || (cache.size && cachedBytes + entry.bytes.length > maxCacheBytes)) remove(cache.keys().next().value);
    if (entry.bytes.length <= maxCacheBytes) { cache.set(url, { ...entry, expires: now() + ttlMs }); cachedBytes += entry.bytes.length; }
  }
  async function download(url) {
    const controller = new AbortController();
    let timer, reader;
    // The deadline also covers streaming bodies and injected transports that ignore signals.
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Icon fetch timed out.')); }, timeoutMs); });
    const operation = (async () => {
      try {
        // Icons are public resources: never attach the Unraid API key, cookies, or authorization.
        const response = await fetchImpl(url, { redirect: 'error', signal: controller.signal, headers: { accept: 'image/*' }, credentials: 'omit' });
        const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!response.ok || !allowedTypes.has(type)) throw new Error('Icon response is not a supported image.');
        const declared = Number(response.headers.get('content-length'));
        if (declared > maxBytes) throw new Error('Icon is too large.');
        if (!response.body) throw new Error('Icon response is empty.');
        reader = response.body.getReader();
        const parts = []; let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new Error('Icon is too large.');
          parts.push(Buffer.from(value));
        }
        if (!size) throw new Error('Icon response is empty.');
        return { type, bytes: Buffer.concat(parts, size) };
      } finally { reader?.cancel().catch(() => {}); }
    })();
    try { return await Promise.race([operation, deadline]); }
    finally { clearTimeout(timer); controller.abort(); reader?.cancel().catch(() => {}); }
  }
  return async url => {
    if (!safeUrl(url)) throw new Error('Invalid icon URL.');
    const entry = cache.get(url);
    if (entry && entry.expires > now()) { cache.delete(url); cache.set(url, entry); return entry; }
    if (entry) remove(url);
    if (pending.has(url)) return pending.get(url);
    if (pending.size >= 16) throw new Error('Too many icon requests.');
    const request = download(url).then(entry => { remember(url, entry); return entry; }).finally(() => pending.delete(url));
    pending.set(url, request);
    return request;
  };
}
