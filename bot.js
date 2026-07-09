/**
 * bot.js
 * MALIK X BOT — Main Entry Point
 */

import { Bot } from 'grammy';
import { config } from './config.js';

// ── Middleware ─────────────────────────────────────────────────────────────────
import { accessMiddleware } from './middleware/auth.js';
import { rateLimit        } from './middleware/rateLimit.js';

// ── Handlers ──────────────────────────────────────────────────────────────────
import { registerStartHandler   } from './handlers/startHandler.js';
import { registerAuthHandler    } from './handlers/authHandler.js';
import { registerMoneyHandler   } from './handlers/moneyHandler.js';
import { registerCarHandler     } from './handlers/carHandler.js';
import { registerModHandler     } from './handlers/modHandler.js';
import { registerProfileHandler } from './handlers/profileHandler.js';
import { registerRankHandler    } from './handlers/rankHandler.js';
import { registerAccountHandler } from './handlers/accountHandler.js';
import { registerRequestHandler } from './handlers/requestHandler.js';
import { registerAdminHandler   } from './handlers/adminHandler.js';

// ── Init Bot ──────────────────────────────────────────────────────────────────
const bot = new Bot(config.telegram.token);

// ═══════════════════════════════════════════════════════════
// GLOBAL MIDDLEWARE
// Runs on every single update before handlers
// ═══════════════════════════════════════════════════════════

// 1️⃣ Access Control — registers users, checks bans & access level
bot.use(accessMiddleware);

// 2️⃣ Rate Limiting — prevents spam
bot.use(rateLimit);

// ═══════════════════════════════════════════════════════════
// HANDLERS
// Order matters — request & admin first
// ═══════════════════════════════════════════════════════════

// ── Public — handles pending/no-access users ───────────────
registerRequestHandler(bot);

// ── Navigation ─────────────────────────────────────────────
registerStartHandler(bot);

// ── Admin Panel ────────────────────────────────────────────
registerAdminHandler(bot);

// ── CPM1 & CPM2 Features ───────────────────────────────────
registerAuthHandler(bot);
registerMoneyHandler(bot);
registerCarHandler(bot);
registerModHandler(bot);
registerProfileHandler(bot);
registerRankHandler(bot);
registerAccountHandler(bot);

// ═══════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// Catches any unhandled errors from all handlers
// ═══════════════════════════════════════════════════════════
bot.catch((err) => {
  const ctx = err.ctx;
  const e   = err.error;

  console.error(
    `\n[❌ BOT ERROR]\n` +
    `Update ID : ${ctx?.update?.update_id ?? 'unknown'}\n` +
    `User ID   : ${ctx?.from?.id ?? 'unknown'}\n` +
    `Error     : ${e?.message ?? e}\n` +
    `Stack     : ${e?.stack ?? 'no stack'}\n`
  );

  // Try to notify user something went wrong
  ctx?.reply(
    `❌ *Something went wrong*\n` +
    `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
    `Please try again or use /start\\.`,
    { parse_mode: 'MarkdownV2' }
  ).catch(() => {});
});

// ═══════════════════════════════════════════════════════════
// START BOT
// ═══════════════════════════════════════════════════════════
bot.start({
  // Drop pending updates on startup
  // So old queued messages don't get processed
  drop_pending_updates: true,

  onStart: (info) => {
    console.log(
      `\n╔══════════════════════════════════════════╗\n` +
      `║          MALIK X BOT — STARTED           ║\n` +
      `╚══════════════════════════════════════════╝\n` +
      `  🤖  Bot        : @${info.username}\n` +
      `  👑  Admin ID   : ${config.bot.adminIds.join(', ')}\n` +
      `  ⚡  Rate Limit : ${config.rateLimit.maxRequests} req / ${config.rateLimit.windowMs / 1000}s\n` +
      `  🔧  Maintenance: ${config.bot.maintenanceMode ? 'ON' : 'OFF'}\n` +
      `  📡  Mode       : Long Polling\n` +
      `──────────────────────────────────────────\n`
    );
  },
});

// ═══════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// Properly stops bot on CTRL+C or server termination
// ═══════════════════════════════════════════════════════════
async function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down MALIK X BOT...`);
  await bot.stop();
  console.log(`✅ Bot stopped gracefully\n`);
  process.exit(0);
}

process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));