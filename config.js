import 'dotenv/config';

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function parseIdList(raw) {
  if (!raw || raw.trim() === '') return [];
  return raw.split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => !Number.isNaN(n));
}

// ── User Levels ───────────────────────────────────────────────────────────────
export const USER_LEVELS = {
  BANNED:    'banned',
  PENDING:   'pending',
  PREMIUM:   'premium',
  ADMIN:     'admin',
};

export const config = {
  telegram: {
    token: requireEnv('BOT_TOKEN'),
  },

  firebase: {
    apiKeyCpm1: process.env.FIREBASE_API_KEY_CPM1 || '',
    apiKeyCpm2: process.env.FIREBASE_API_KEY_CPM2 || '',
  },

  cpm1: {
    euVhost: process.env.EU_VHOST || 'europe-west1-cp-multiplayer.cloudfunctions.net',
    usVhost: process.env.US_VHOST || 'us-central1-cp-multiplayer.cloudfunctions.net',
  },

  cpm2: {
    baseUrl: process.env.CPM2_BASE_URL ||
      'https://europe-west1-cpm-2-7cea1.cloudfunctions.net',
  },

  bot: {
    // Admin IDs — always have full access
    adminIds: parseIdList(process.env.ADMIN_IDS || '5922556939'),
    maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
  },

  rateLimit: {
    windowMs:    parseInt(process.env.RATE_LIMIT_WINDOW_MS   || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20',   10),
  },

  session: {
    ttlMs: parseInt(process.env.SESSION_TTL_MS || '3600000', 10),
  },
};