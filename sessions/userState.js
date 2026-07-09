/**
 * userState.js
 * In-memory session store for user tokens and conversation state
 */

import { config } from '../config.js';

const store = new Map();

function now() {
  return Date.now();
}

function getOrCreate(userId) {
  if (!store.has(userId)) {
    store.set(userId, {
      cpm1Token:  null,
      cpm1Email:  null,
      cpm2Token:  null,
      cpm2Email:  null,
      step:       null,
      stepData:   {},
      createdAt:  now(),
      updatedAt:  now(),
    });
  }
  return store.get(userId);
}

// ── Token Management ─────────────────────────────────────────────────────────
export function setToken(userId, game, token, email) {
  const s      = getOrCreate(userId);
  const key    = game === 'cpm2' ? 'cpm2' : 'cpm1';
  s[`${key}Token`] = token;
  s[`${key}Email`] = email;
  s.updatedAt  = now();
}

export function getToken(userId, game = 'cpm1') {
  const s   = store.get(userId);
  if (!s)   return null;
  const key = game === 'cpm2' ? 'cpm2' : 'cpm1';
  return s[`${key}Token`] || null;
}

export function getEmail(userId, game = 'cpm1') {
  const s   = store.get(userId);
  if (!s)   return null;
  const key = game === 'cpm2' ? 'cpm2' : 'cpm1';
  return s[`${key}Email`] || null;
}

export function clearToken(userId, game = 'cpm1') {
  const s = store.get(userId);
  if (!s) return;
  const key = game === 'cpm2' ? 'cpm2' : 'cpm1';
  s[`${key}Token`] = null;
  s[`${key}Email`] = null;
  s.updatedAt = now();
}

export function clearAllTokens(userId) {
  const s = store.get(userId);
  if (!s) return;
  s.cpm1Token = null;
  s.cpm1Email = null;
  s.cpm2Token = null;
  s.cpm2Email = null;
  s.updatedAt = now();
}

export function isLoggedIn(userId, game = 'cpm1') {
  return !!getToken(userId, game);
}

// ── Conversation Step Management ─────────────────────────────────────────────
export function setStep(userId, step, data = {}) {
  const s    = getOrCreate(userId);
  s.step     = step;
  s.stepData = data;
  s.updatedAt = now();
}

export function getStep(userId) {
  const s = store.get(userId);
  return s ? { step: s.step, data: s.stepData } : { step: null, data: {} };
}

export function clearStep(userId) {
  const s = store.get(userId);
  if (!s) return;
  s.step     = null;
  s.stepData = {};
  s.updatedAt = now();
}

// ── Session Cleanup ───────────────────────────────────────────────────────────
export function clearSession(userId) {
  store.delete(userId);
}

export function cleanupExpired() {
  const ttl = config.session.ttlMs;
  const cutoff = now() - ttl;

  let count = 0;
  for (const [userId, session] of store.entries()) {
    if (session.updatedAt < cutoff) {
      store.delete(userId);
      count++;
    }
  }

  if (count > 0) {
    console.log(`[Session] Cleaned up ${count} expired sessions`);
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpired, 10 * 60 * 1000);
