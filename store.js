// Picks the backend once: Firebase when firebase-config.js is filled in, otherwise local.
import {firebaseEnabled} from './firebase-config.js';
import {local} from './backend-local.js';

let backend = local;
export async function initStore() {
  if (firebaseEnabled()) {
    try { const m = await import('./backend-firebase.js'); backend = m.firebase; }
    catch (e) { console.error('Firebase failed to load; falling back to local mode.', e); backend = local; }
  }
  await backend.init();
  return backend;
}
export const store = new Proxy({}, {get: (_, k) => typeof backend[k] === 'function' ? backend[k].bind(backend) : backend[k]});
