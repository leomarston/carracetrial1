/**
 * Tiny global settings store, persisted to localStorage. For now it only holds
 * the sound-effects volume (0..1), which the main-menu Settings panel edits and
 * the AudioManager applies live to its master gain.
 */
const KEY = 'carrace.settings';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

const saved = load();
const state = {
  sfxVolume: typeof saved.sfxVolume === 'number' ? saved.sfxVolume : 1,
};
const listeners = new Set();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export const Settings = {
  get sfxVolume() { return state.sfxVolume; },
  setSfxVolume(v) {
    state.sfxVolume = Math.max(0, Math.min(1, v));
    persist();
    for (const fn of listeners) fn(state);
  },
  /** Subscribe to changes; returns an unsubscribe fn. */
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
