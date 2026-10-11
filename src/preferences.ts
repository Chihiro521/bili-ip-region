export interface Preferences { commentsEnabled: boolean; profilesEnabled: boolean; }
export async function preferences(): Promise<Preferences> {
  const stored = await chrome.storage.sync.get(['commentsEnabled', 'profilesEnabled']);
  return { commentsEnabled: stored.commentsEnabled !== false, profilesEnabled: stored.profilesEnabled !== false };
}
export const initializeStorage = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const old = await chrome.storage.local.get(['commentsEnabled', 'preferencesMigrated']);
  if (!old.preferencesMigrated) {
    const current = await chrome.storage.sync.get('commentsEnabled');
    if (typeof current.commentsEnabled !== 'boolean' && typeof old.commentsEnabled === 'boolean') {
      await chrome.storage.sync.set({ commentsEnabled: old.commentsEnabled });
    }
    await chrome.storage.local.set({ preferencesMigrated: true });
  }
})();
