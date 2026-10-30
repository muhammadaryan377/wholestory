import { useSyncExternalStore } from 'react';

let unlocked = false;
const listeners = new Set<() => void>();
export const privateIsUnlocked = () => unlocked;
export function setPrivateUnlocked(value: boolean) {
  unlocked = value;
  listeners.forEach(listener => listener());
}
export function usePrivateUnlocked() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, privateIsUnlocked, () => false);
}
export class PrivateLockedError extends Error {
  constructor() { super('Unlock Private albums first.'); }
}
