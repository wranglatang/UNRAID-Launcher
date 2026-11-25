import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Box, Cloud, Download, Film, HardDrive, Home, Music, Play, Rss, Network, Check, CircleHelp, Folder, LoaderCircle, Pencil, Plus, RefreshCw, Search, Server, Settings, Star, Trash2, X } from 'lucide-react';

const clone = value => JSON.parse(JSON.stringify(value));
const blankLayout = { version: 1, revision: 0, groups: [], favorites: [], overrides: {} };
const FAVORITES = '__favorites__';
const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };
const isShortcut = container => container.kind === 'shortcut';
const isRunning = container => !isShortcut(container) && /^(running|up)$/i.test(container.state);
const appStatus = container => isShortcut(container) ? 'Web link' : isRunning(container) ? 'Running' : container.state || 'Unknown';
const titleFor = (container, layout) => layout.overrides?.[container.id]?.name || container.name;
async function request(path, options) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.error || result.message || `Request failed (${response.status})`); error.status = response.status; throw error; }
  return result;
}
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });

function App() {
  const [data, setData] = useState(null);
  const [layout, setLayout] = useState(blankLayout);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customizing, setCustomizing] = useState(null);
  const [openFolder, setOpenFolder] = useState(null);
  const [notice, setNotice] = useState('');
  const folderButtons = useRef(new Map());
  const folderOrigin = useRef(null);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { const next = await request('/api/dashboard'); setData(next); if (!editingRef.current) setLayout(next.layout); setError(''); }
    catch (err) { setError(err.message); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const timer = setInterval(refresh, Math.max(5, data?.settings?.refreshSeconds || 30) * 1000); return () => clearInterval(timer); }, [refresh, data?.settings?.refreshSeconds]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { const handler = e => { if (editingRef.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, []);
  const dockerContainers = data?.containers || [];
  const containers = [...dockerContainers, ...(data?.shortcuts || [])];
  const byId = new Map(containers.map(container => [container.id, container]));
  const favorites = layout.favorites || [];
  const assigned = new Set([...favorites, ...layout.groups.flatMap(group => group.containerIds)]);
  const getContainer = id => byId.get(id) || { id, name: layout.overrides?.[id]?.name || 'Unavailable container', image: '', state: 'unavailable', ports: [], url: null };
  const selected = [...assigned].map(getContainer);
  const matches = container => `${titleFor(container, layout)} ${container.name} ${container.image}`.toLowerCase().includes(query.toLowerCase());
  const unassigned = containers.filter(container => !assigned.has(container.id) && matches(container));
  const connection = data?.connection;
  const changeLayout = callback => setLayout(current => callback(clone(current)));
  function startEdit() { setOpenFolder(null); setQuery(''); setLayout(clone(data.layout)); editingRef.current = true; setEditing(true); setError(''); }
  function cancelEdit() { editingRef.current = false; setEditing(false); setLayout(clone(data.layout)); setError(''); }
  async function saveEdit() {
    setBusy(true); setError('');
    try { const saved = await put('/api/layout', layout); const next = saved.layout || saved; setLayout(next); setData(current => ({ ...current, layout: next })); editingRef.current = false; setEditing(false); setNotice('Your dashboard has been saved.'); await refresh(); }
    catch (err) { setError(err.status === 409 ? 'This dashboard changed on another device. Your edits are still here. Cancel to load the latest layout, then make your changes again.' : err.message); }
    finally { setBusy(false); }
  }
  function addGroup() { const id = globalThis.crypto?.randomUUID?.() || `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; changeLayout(next => { next.groups.push({ id, name: 'New folder', collapsed: false, containerIds: [] }); return next; }); }
  function moveContainer(id, groupId) {
    changeLayout(next => {
      if (groupId && groupId !== FAVORITES && !next.groups.some(group => group.id === groupId)) return next;
      next.favorites = (next.favorites || []).filter(existing => existing !== id);
      next.groups.forEach(group => { group.containerIds = group.containerIds.filter(existing => existing !== id); });
      const destination = groupId === FAVORITES ? next.favorites : next.groups.find(group => group.id === groupId)?.containerIds;
      if (destination) destination.push(id);
      return next;
    });
  }
  function locationIds(groupId) { return groupId === FAVORITES ? favorites : layout.groups.find(group => group.id === groupId)?.containerIds || []; }
  function shiftContainer(id, groupId, direction) { changeLayout(next => { const ids = groupId === FAVORITES ? next.favorites : next.groups.find(group => group.id === groupId)?.containerIds; if (!ids) return next; const index = ids.indexOf(id); const target = index + direction; if (index >= 0 && target >= 0 && target < ids.length) [ids[index], ids[target]] = [ids[target], ids[index]]; return next; }); }
  function shiftGroup(index, direction) { changeLayout(next => { const target = index + direction; if (target >= 0 && target < next.groups.length) [next.groups[index], next.groups[target]] = [next.groups[target], next.groups[index]]; return next; }); }
  function resolveLink(container) {
    if (!editing) return safeUrl(container.url);
    const override = layout.overrides?.[container.id];
    if (JSON.stringify(override || {}) === JSON.stringify(data?.layout?.overrides?.[container.id] || {})) return safeUrl(container.url);
    if (override?.url) return safeUrl(override.url);
    if (override?.port) { try { const target = new URL(container.url || data.server.url); if (data.settings.tailscaleHostname) target.hostname = data.settings.tailscaleHostname; target.port = String(override.port); target.protocol = `${override.scheme || data.settings.defaultScheme || 'http'}:`; return safeUrl(target.href); } catch { return null; } }
    return safeUrl(container.url);
  }
  const card = (container, groupId, tray = false) => {
    const name = titleFor(container, layout), url = resolveLink(container), running = isRunning(container), pinned = groupId === FAVORITES;
    return <article key={container.id} className={`app-card ${editing ? 'editable' : ''} ${tray ? 'tray-card' : ''}`} aria-label={`${name}, ${container.status || appStatus(container)}`} title={`${name} · ${container.status || appStatus(container)}`}>
      <div className="card-main"><span className="edit-icon-wrap"><AppIcon container={container}/>{!isShortcut(container) && <span className={`app-status-dot ${running ? 'running' : 'stopped'}`} aria-hidden="true"/>}</span><div className="card-copy"><strong>{name}</strong><span className="card-detail">{url ? new URL(url).host : 'Link not configured'}</span></div></div>
      <div className="card-actions">{tray ? <select aria-label={`Add ${name} to folder`} value="" disabled={!layout.groups.length} onChange={event => { if (event.target.value) moveContainer(container.id, event.target.value); }}><option value="" disabled>{layout.groups.length ? '+ Add to folder' : 'Create a folder first'}</option>{layout.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select> : <><select aria-label={`Move ${name} to group`} value={groupId} onChange={event => moveContainer(container.id, event.target.value)}><option value={FAVORITES}>Favourites</option>{layout.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}<option value="">App tray</option></select><button className="icon-button small" aria-label={`Move ${name} earlier`} disabled={locationIds(groupId)[0] === container.id} onClick={() => shiftContainer(container.id, groupId, -1)}><ArrowUp size={15}/></button><button className="icon-button small" aria-label={`Move ${name} later`} disabled={locationIds(groupId).at(-1) === container.id} onClick={() => shiftContainer(container.id, groupId, 1)}><ArrowDown size={15}/></button></>}<button className={`icon-button small pin-button ${pinned ? 'is-pinned' : ''}`} aria-label={pinned ? `Unpin ${name} to app tray` : `Pin ${name} to favourites`} aria-pressed={pinned} onClick={() => moveContainer(container.id, pinned ? '' : FAVORITES)}><Star size={16} fill={pinned ? 'currentColor' : 'none'}/></button><button className="icon-button small app-config-button" aria-label={`Customize ${name}`} aria-description={container.warning ? "Configuration warning. Open to see details." : undefined} title={container.warning ? "Configuration needs attention" : "Edit app settings"} onClick={() => setCustomizing(container)}><Pencil size={15}/>{container.warning && <span className="app-warning-indicator" aria-hidden="true">!</span>}</button></div>
    </article>;
  };

  const launchTile = container => {
    const name = titleFor(container, layout), url = resolveLink(container), running = isRunning(container);
    const content = <><span className="launch-icon-wrap"><AppIcon container={container}/>{!isShortcut(container) && <span className={`app-status-dot ${running ? 'running' : 'stopped'}`} aria-hidden="true"/>}</span><strong>{name}</strong></>;
    return <div className={`launch-tile ${url ? '' : 'unavailable'}`} key={container.id}>{url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} in a new tab`} aria-description={container.status || appStatus(container)} title={`${name} · ${container.status || container.state}`}>{content}</a> : <button onClick={() => setNotice(`${name}: set a web link in edit mode.`)} aria-label={`${name}, link not configured`} aria-description={container.status || appStatus(container)} title={`${name} · ${container.status || appStatus(container)}`}>{content}</button>}</div>;
  };
  const folderPreview = group => <div className="folder-preview" aria-hidden="true">{group.containerIds.slice(0, 9).map(id => <AppIcon key={id} container={getContainer(id)}/>)}{!group.containerIds.length && <Folder className="empty-folder-symbol" size={44}/>}</div>;
  const activeFolder = layout.groups.find(group => group.id === openFolder);
  return <div className="app-shell home-screen">
    <main className="launcher-canvas">
      {error && <div className="banner error" role="alert"><CircleHelp size={19}/><span>{error}</span><button className="text-button" onClick={refresh}>Retry</button></div>}
      {data && !connection?.connected && <div className="banner warning"><Server size={19}/><div><strong>{connection?.configured ? 'We couldn’t reach your Unraid server.' : 'Let’s connect your server.'}</strong><p>{connection?.error || 'Add UNRAID_API_KEY to your container’s environment and restart the launcher. Your API key stays on the server.'}{dockerContainers.length > 0 && ' Showing the last discovered containers; their status may be out of date.'}</p></div><button className="text-button" onClick={() => setSettingsOpen(true)}>Settings</button></div>}
      {connection?.demo && <div className="demo-note"><span/>Demo workspace<span className="demo-divider">·</span>Sample services for a look around</div>}
      <div className="content-toolbar"><div className="toolbar-actions"><label className="search-box"><Search size={18}/><input placeholder="Search your apps" aria-label="Search apps" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button className="clear-search" aria-label="Clear search" onClick={() => setQuery('')}><X size={16}/></button>}</label>{editing && <button className="button compact" onClick={addGroup}><Plus size={17}/>New folder</button>}</div></div>
      {!data && !error ? <div className="empty-state"><LoaderCircle size={30} className="spin"/><h3>Finding your services</h3><p>Connecting to your dashboard…</p></div> : <div className={`workspace ${editing ? 'is-editing' : ''}`}><div className="group-list">
      {(editing || (favorites.length > 0 && !query)) && <section className={`favorites-section ${editing ? 'favorites-edit app-group' : ''}`} aria-label="Favourites"><div className="favorites-heading"><div><Star size={17}/><h2>Favourites</h2><span>{favorites.length}</span></div>{editing && <p>Pin apps here for one-tap access</p>}</div>{editing ? <div className="app-grid">{favorites.map(getContainer).filter(matches).map(container => card(container, FAVORITES))}{!favorites.length && <div className="group-placeholder"><Star size={21}/><span>Tap the star on any app in the tray to add it here</span></div>}</div> : <div className="launcher-grid favorites-grid">{favorites.map(getContainer).map(launchTile)}</div>}</section>}
      {!editing && !query && layout.groups.length > 0 && favorites.length > 0 && <div className="folders-heading"><Folder size={17}/><h2>Folders</h2><span>{layout.groups.length}</span></div>}
      {!editing && query ? <div className="launcher-grid search-results">{selected.filter(matches).map(launchTile)}</div> : !editing ? <div className="folder-grid">{layout.groups.map(group => { const apps = group.containerIds.map(getContainer); return <div className="folder-tile" key={group.id}><button className="folder-open" ref={element => { if (element) folderButtons.current.set(group.id, element); else folderButtons.current.delete(group.id); }} onClick={event => { folderOrigin.current = event.currentTarget.querySelector('.folder-preview')?.getBoundingClientRect(); setOpenFolder(group.id); }} aria-label={`Open ${group.name} folder, ${apps.length} apps`}>{folderPreview(group)}<strong>{group.name}</strong></button></div>; })}</div> : layout.groups.map((group, index) => <section key={group.id} className="app-group"><div className="edit-folder-heading">{folderPreview(group)}<div className="edit-folder-name"><input className="group-name-input" aria-label="Group name" value={group.name} maxLength={80} onChange={event => changeLayout(next => { next.groups[index].name = event.target.value; return next; })}/><span>{group.containerIds.length} apps · Use arrows to reorder</span></div><div className="group-edit-actions"><button className="icon-button small" aria-label={`Move ${group.name} earlier`} disabled={!index} onClick={() => shiftGroup(index, -1)}><ArrowUp size={16}/></button><button className="icon-button small" aria-label={`Move ${group.name} later`} disabled={index === layout.groups.length - 1} onClick={() => shiftGroup(index, 1)}><ArrowDown size={16}/></button><button className="icon-button small danger" aria-label={`Delete ${group.name} group`} onClick={() => changeLayout(next => { next.groups.splice(index, 1); return next; })}><Trash2 size={16}/></button></div></div><div className="app-grid">{group.containerIds.map(getContainer).filter(matches).map(container => card(container, group.id))}{!group.containerIds.length && <div className="group-placeholder"><Plus size={20}/><span>Choose this folder from an app’s folder picker in the tray</span></div>}</div></section>)}
      {!editing && !layout.groups.length && !favorites.length && <div className="empty-state"><span className="empty-icon"><Folder size={32}/></span><h3>Make room for your favourites.</h3><p>Pin your go-to apps or organize them into folders.<br/>Your home screen will follow you to every device.</p><button className="button primary" disabled={!data} onClick={startEdit}><Plus size={17}/>Choose your apps</button></div>}
      {query && !editing && selected.length > 0 && !selected.some(matches) && <div className="empty-state"><Search size={30}/><h3>No matching apps</h3><p>Try another name or clear your search.</p><button className="button" onClick={() => setQuery('')}>Clear search</button></div>}</div>
      {editing && <aside className="app-tray"><div className="tray-title"><span className="tray-symbol"><Box size={21}/></span><div><h3>App tray</h3><p>{containers.filter(container => !assigned.has(container.id)).length} apps available</p></div></div><p className="tray-description">Tap the star for favourites, choose a folder, and use the arrows to reorder apps.</p>{!layout.groups.length && <div className="tray-folder-help"><span>Create a folder to organize these apps.</span><button className="button compact" onClick={addGroup}><Plus size={15}/>New folder</button></div>}<div className="tray-apps">{unassigned.map(container => card(container, '', true))}{!unassigned.length && <div className="tray-empty"><Check size={23}/><p>{query ? 'No matching apps in the tray.' : containers.length ? 'All your apps have a home.' : 'Discovered containers will appear here.'}</p></div>}</div></aside>}
      </div>}
    </main>
    <div className="floating-controls" role="group" aria-label="Dashboard tools">{editing && <div className="floating-edit-dock"><button className="button" disabled={busy} onClick={cancelEdit}>Cancel</button><button className="button primary" disabled={busy} onClick={saveEdit}>{busy ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>}Save changes</button></div>}<button className="icon-button floating-settings" aria-label="Open settings" onClick={() => setSettingsOpen(true)}><Settings size={22}/></button></div>
    {activeFolder && !editing && <Modal title={activeFolder.name} close={() => setOpenFolder(null)} className="folder-dialog" sourceElement={folderButtons.current.get(activeFolder.id)} originRect={folderOrigin.current}><div className="launcher-grid">{activeFolder.containerIds.map(getContainer).map(launchTile)}</div>{!activeFolder.containerIds.length && <div className="folder-empty"><Folder size={32}/><p>This folder is waiting for your apps.</p><button className="button" onClick={startEdit}><Pencil size={16}/>Edit dashboard</button></div>}</Modal>}
    {settingsOpen && <SettingsDialog settings={data?.settings} connection={connection} canEdit={Boolean(data)} editing={editing} onEdit={() => { setSettingsOpen(false); startEdit(); }} onRefresh={refresh} refreshing={refreshing} close={() => setSettingsOpen(false)} saved={async settings => { setData(current => ({ ...current, settings })); setNotice('Settings saved.'); await refresh(); }}/>}
    {customizing && <CustomizeDialog container={customizing} override={layout.overrides?.[customizing.id] || {}} close={() => setCustomizing(null)} save={override => { changeLayout(next => { next.overrides[customizing.id] = override; return next; }); setCustomizing(null); }}/>}
    {notice && <div className="toast" role="status"><Check size={17}/>{notice}</div>}
  </div>;
}

function AppIcon({ container }) {
  const [failed, setFailed] = useState(false);
  const source = typeof container.icon === 'string' && (/^\/api\/containers\/[^/]+\/icon$/.test(container.icon) || container.icon === '/icons/unraid-home.svg') ? container.icon : safeUrl(container.icon);
  useEffect(() => setFailed(false), [source]);
  const knownIcons = [[/unraid/i, Server], [/plex|jellyfin|emby/i, Play], [/radarr|sonarr|overseerr|tautulli/i, Film], [/download|torrent|sabnzbd|deluge/i, Download], [/home.?assistant/i, Home], [/nextcloud/i, Cloud], [/music|navidrome|lidarr/i, Music], [/proxy|traefik|network|tailscale|pihole/i, Network], [/backup|duplicati|syncthing/i, HardDrive], [/rss|freshrss|prowlarr/i, Rss], [/portainer|docker/i, Box]];
  const KnownIcon = knownIcons.find(([pattern]) => pattern.test(container.name))?.[1];
  const colors = ['purple', 'blue', 'amber', 'green', 'pink'];
  const color = colors[[...container.name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length];
  return <span className={`app-icon ${color}`}>{source && !failed ? <img draggable={false} src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : KnownIcon ? <KnownIcon size={32} strokeWidth={1.7}/> : <span>{container.name.replace(/^(binhex-|linuxserver-)/, '').slice(0, 2).toUpperCase()}</span>}</span>;
}

function Modal({ title, subtitle, close, children, className = '', sourceElement, originRect }) {
  const dialog = useRef(null);
  const motion = useRef(null);
  const closing = useRef(false);
  const mounted = useRef(false);
  const animated = className.includes('folder-dialog');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sourceBounds = () => {
    const source = sourceElement?.isConnected ? sourceElement.querySelector('.folder-preview') || sourceElement : null;
    const bounds = source?.getBoundingClientRect() || originRect;
    return bounds?.width > 0 && bounds?.height > 0 ? bounds : null;
  };
  const sourceFrame = (bounds, target) => bounds ? {
    transform: `translate(${bounds.left + bounds.width / 2 - target.left - target.width / 2}px, ${bounds.top + bounds.height / 2 - target.top - target.height / 2}px) scale(${Math.max(.05, bounds.width / target.width)}, ${Math.max(.05, bounds.height / target.height)})`,
    opacity: .12,
    borderRadius: '38px'
  } : { transform: 'scale(.96)', opacity: 0, borderRadius: '32px' };
  useEffect(() => {
    const element = dialog.current;
    mounted.current = true;
    element.showModal();
    if (animated && !reduceMotion() && typeof element.animate === 'function') {
      const target = element.getBoundingClientRect();
      // Native dialog positioning establishes the final rectangle before the FLIP animation.
      motion.current = element.animate([sourceFrame(originRect || sourceBounds(), target), { transform: 'translate(0, 0) scale(1, 1)', opacity: 1, borderRadius: getComputedStyle(element).borderRadius }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    }
    const resized = () => {
      if (closing.current) motion.current?.finish();
      else { motion.current?.cancel(); motion.current = null; }
    };
    window.addEventListener('resize', resized);
    return () => {
      mounted.current = false;
      window.removeEventListener('resize', resized);
      motion.current?.cancel();
      element.close();
      if (animated) requestAnimationFrame(() => {
        if (sourceElement?.isConnected && !document.querySelector('dialog[open]')) sourceElement.focus({ preventScroll: true });
      });
    };
  }, []);
  function requestClose() {
    if (closing.current) return;
    const element = dialog.current;
    if (!animated || reduceMotion() || typeof element.animate !== 'function') { close(); return; }
    closing.current = true;
    const current = getComputedStyle(element);
    const start = { transform: current.transform === 'none' ? 'translate(0, 0) scale(1, 1)' : current.transform, opacity: current.opacity, borderRadius: current.borderRadius };
    motion.current?.cancel();
    const target = element.getBoundingClientRect();
    element.dataset.closing = 'true';
    element.setAttribute('aria-busy', 'true');
    const animation = element.animate([start, sourceFrame(sourceBounds(), target)], { duration: 260, easing: 'cubic-bezier(.4,0,.7,.2)', fill: 'both' });
    motion.current = animation;
    animation.finished.then(() => { if (mounted.current) close(); }).catch(() => {});
  }
  return <dialog ref={dialog} className={`modal ${className}`} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); requestClose(); }} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose(); } }}><div className="modal-heading"><div><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={requestClose}><X size={20}/></button></div>{children}</dialog>;
}

function SettingsDialog({ settings, connection, close, saved, onEdit, onRefresh, refreshing, canEdit, editing }) {
  const [form, setForm] = useState({ tailscaleHostname: settings?.tailscaleHostname || '', defaultScheme: settings?.defaultScheme || 'http', refreshSeconds: settings?.refreshSeconds || 30 });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { const result = await put('/api/settings', form); await saved(result.settings || result); close(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <Modal title="Settings" subtitle="Workspace preferences and dashboard controls." close={close}><div className="settings-dashboard-tools"><span className={`connection-pill ${connection?.connected ? 'online' : ''}`}><i/>{connection?.demo ? 'Demo mode' : connection?.connected ? 'Server connected' : 'Server disconnected'}</span><div><button type="button" className="button" onClick={onEdit} disabled={!canEdit || editing}><Pencil size={16}/>{editing ? 'Editing dashboard' : 'Edit dashboard'}</button><button type="button" className={`button ${refreshing ? 'spinning' : ''}`} onClick={onRefresh} disabled={refreshing}><RefreshCw size={16}/>Refresh containers</button></div></div><form onSubmit={submit}><label className="field"><span className="hostname-label">Tailscale MagicDNS hostname{settings?.tailscaleHostnameManaged && <em className="managed-badge">Environment</em>}</span><input autoFocus={!settings?.tailscaleHostnameManaged} readOnly={Boolean(settings?.tailscaleHostnameManaged)} aria-describedby="hostname-help" value={form.tailscaleHostname} onChange={event => update('tailscaleHostname', event.target.value)} placeholder="tower.your-tailnet.ts.net" autoCapitalize="none" autoCorrect="off" spellCheck="false"/><small id="hostname-help">{settings?.tailscaleHostnameManaged ? 'Set by TAILSCALE_HOSTNAME in your Docker environment. Update that value in Docker and apply the container changes.' : 'The hostname only, without a protocol or port. Set TAILSCALE_HOSTNAME in Docker to manage this address through your environment instead.'}</small></label><div className="field-row"><label className="field"><span>Default link protocol</span><select value={form.defaultScheme} onChange={event => update('defaultScheme', event.target.value)}><option value="http">HTTP</option><option value="https">HTTPS</option></select></label><label className="field"><span>Refresh status every</span><select value={form.refreshSeconds} onChange={event => update('refreshSeconds', Number(event.target.value))}><option value="10">10 seconds</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option></select></label></div><div className="settings-connection"><Server size={20}/><div><strong>{connection?.demo ? 'Demo data active' : connection?.configured ? 'Unraid API key configured' : 'Unraid API key needed'}</strong><p>Set UNRAID_URL and UNRAID_API_KEY in your Docker environment. Your API key stays on the server and is never sent to this browser.</p></div></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button" onClick={close} disabled={busy}>Cancel</button><button type="submit" className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>}Save settings</button></div></form></Modal>;
}

function CustomizeDialog({ container, override, close, save }) {
  const [name, setName] = useState(override.name || ''); const [url, setUrl] = useState(override.url || ''); const [port, setPort] = useState(override.port || ''); const [scheme, setScheme] = useState(override.scheme || 'http'); const [error, setError] = useState('');
  function submit(event) { event.preventDefault(); if (url && !safeUrl(url)) { setError('Enter a full HTTP or HTTPS URL.'); return; } if (port && (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)) { setError('Enter a port between 1 and 65535.'); return; } const next = {}; if (name.trim()) next.name = name.trim(); if (url.trim()) next.url = url.trim(); if (port) { next.port = Number(port); next.scheme = scheme; } save(next); }
  return <Modal title="Make this app your own" subtitle={container.name} close={close}><form onSubmit={submit}>{container.warning && <div className="app-config-warning" role="note"><CircleHelp size={19}/><div><strong>Configuration needs attention</strong><p>{container.warning}</p></div></div>}<label className="field"><span>Display name</span><input autoFocus value={name} maxLength={100} onChange={event => setName(event.target.value)} placeholder={container.name}/></label><label className="field"><span>Custom URL <em>optional</em></span><input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://service.example.com/path" autoCapitalize="none" autoCorrect="off"/><small>A custom URL takes priority over automatic discovery.</small></label><div className="field-row"><label className="field"><span>Web port <em>optional</em></span><input type="number" min="1" max="65535" value={port} onChange={event => setPort(event.target.value)} placeholder="Auto-detect"/></label><label className="field"><span>Port protocol</span><select value={scheme} onChange={event => setScheme(event.target.value)}><option value="http">HTTP</option><option value="https">HTTPS</option></select></label></div><p className="form-hint">Leave overrides empty to use the discovered app link. Changes are applied when you save your dashboard.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button" onClick={close}>Cancel</button><button type="submit" className="button primary"><Check size={17}/>Apply</button></div></form></Modal>;
}

export default App;
