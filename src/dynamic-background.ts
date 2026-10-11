import { fetchDynamic } from './dynamic-api.ts';
import type { DynamicResult } from './dynamic-data.ts';
import { contentAuthorization, contentAuthGeneration } from './profile-background.ts';
import { preferences } from './preferences.ts';
import { configureHeaders } from './request-headers.ts';

interface Cached { result: DynamicResult; expiresAt: number; }
const pending = new Map<string, Promise<DynamicResult>>();
let cacheWrite: Promise<void> = Promise.resolve();
let inFlight = 0;
const queue: (() => void)[] = [];
async function slot(): Promise<void> { if (inFlight < 3) { inFlight++; return; } await new Promise<void>(resolve => queue.push(resolve)); }
function release(): void { const next = queue.shift(); if (next) next(); else inFlight--; }
export async function getDynamic(id: string, expectedMid: string | null): Promise<DynamicResult> {
  const empty = (status: DynamicResult['status']): DynamicResult => ({ id, authorMid: expectedMid, status, region: null });
  if (!(await preferences()).dynamicsEnabled) return empty('disabled');
  const generation = contentAuthGeneration();
  const auth = await contentAuthorization();
  if (!auth) return empty('auth-required');
  if (generation !== contentAuthGeneration()) return empty('disabled');
  const key = `${id}:${expectedMid ?? ''}`;
  const stored = await chrome.storage.session.get('dynamicCache'), cached = (stored.dynamicCache as Record<string, Cached> | undefined)?.[key];
  if (generation !== contentAuthGeneration()) return empty('disabled');
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const requestKey = `${generation}:${key}`;
  if (pending.has(requestKey)) return pending.get(requestKey)!;
  if (pending.size >= 60) return empty('error');
  const task = (async () => {
    await slot();
    try {
      if (generation !== contentAuthGeneration() || !(await preferences()).dynamicsEnabled) return empty('disabled');
      await configureHeaders();
      const result = await fetchDynamic(id, expectedMid, auth);
      if (generation !== contentAuthGeneration() || !(await preferences()).dynamicsEnabled) return empty('disabled');
      if (result.status === 'ok' || result.status === 'empty') {
        const write = cacheWrite.catch(() => {}).then(async () => {
          if (generation !== contentAuthGeneration()) return;
          const latest = await chrome.storage.session.get('dynamicCache');
          if (generation !== contentAuthGeneration()) return;
          const entries = Object.entries((latest.dynamicCache ?? {}) as Record<string, Cached>).filter(([k,v]) => k !== key && v.expiresAt > Date.now()).slice(-199);
          entries.push([key, { result, expiresAt: Date.now() + (result.region ? 30 : 5) * 60000 }]);
          await chrome.storage.session.set({ dynamicCache: Object.fromEntries(entries) });
        });
        cacheWrite = write; await write;
      }
      return result;
    } catch { return empty('error'); } finally { release(); }
  })().finally(() => pending.delete(requestKey));
  pending.set(requestKey, task); return task;
}
