import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError, validateLayout, validateSettings } from './model.js';
export const emptyLayout = () => ({ version: 1, revision: 0, favorites: [], groups: [], overrides: {} });
export async function createStore(directory, defaults) {
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, 'dashboard.json');
  let state = { layout: emptyLayout(), settings: validateSettings(defaults) };
  try {
    const saved = JSON.parse(await readFile(filename, 'utf8'));
    state = { layout: validateLayout(saved.layout), settings: validateSettings(saved.settings) };
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read dashboard.json. Restore a valid backup before restarting; the existing file has been preserved.'); }
  let queue = Promise.resolve();
  const mutate = operation => {
    const result = queue.then(async () => {
      const next = operation(state);
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 }); await rename(temporary, filename); }
      catch (error) { await unlink(temporary).catch(() => {}); throw error; }
      state = next;
      return structuredClone(state);
    });
    queue = result.catch(() => {});
    return result;
  };
  return {
    read: () => structuredClone(state),
    saveLayout: layout => mutate(current => {
      const valid = validateLayout(layout);
      if (valid.revision !== current.layout.revision) throw new HttpError(409, 'This dashboard changed on another device. Reload before saving.');
      return { ...current, layout: { ...valid, revision: current.layout.revision + 1 } };
    }).then(state => state.layout),
    saveSettings: settings => mutate(current => ({ ...current, settings: validateSettings(settings) })).then(state => state.settings),
  };
}
