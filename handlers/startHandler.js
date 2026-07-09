/**
 * startHandler.js
 * MALIK X BOT — Welcome & navigation
 */

import {
  getOrCreateUser,
  hasAccess,
  isAdmin,
  isBanned,
} from '../database/users.js';
import { getPhotoFileId } from '../database/botSettings.js';
import {
  fmtWelcomeNew,
  fmtWelcomeBack,
  fmtWelcomeAdmin,
  fmtMainMenu,
  fmtCancelled,
  fmtBanned,
} from '../utils/formatter.js';
import {
  kbMainMenu,
  kbCpm1Menu,
  kbCpm2Menu,
  kbNoAccess,
  kbBack,
} from '../utils/keyboard.js';
import { clearStep } from '../sessions/userState.js';
import { sendNoAccessMessage } from '../middleware/auth.js';

// ── Send Message With Optional Photo ─────────────────────────────────────────
async function sendWithPhoto(ctx, text, keyboard) {
  const photoId = getPhotoFileId();

  if (photoId) {
    try {
      await ctx.replyWithPhoto(photoId, {
        caption:      text,
        parse_mode:   'MarkdownV2',
        reply_markup: keyboard,
      });
      return;
    } catch {
      // Fall through to text if photo fails
    }
  }

  await ctx.reply(text, {
    parse_mode:   'MarkdownV2',
    reply_markup: keyboard,
  });
}

export function registerStartHandler(bot) {

  // ── /start ──────────────────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    clearStep(ctx.from.id);
    const userId    = ctx.from.id;
    const firstName = ctx.from.first_name || 'User';
    const user      = getOrCreateUser(userId, ctx.from);

    // Admin
    if (isAdmin(userId)) {
      return sendWithPhoto(
        ctx,
        fmtWelcomeAdmin(firstName),
        kbMainMenu()
      );
    }

    // Banned
    if (isBanned(userId)) {
      return ctx.reply(
        fmtBanned(user.banReason),
        { parse_mode: 'MarkdownV2' }
      );
    }

    // Has access
    if (hasAccess(userId)) {
      return sendWithPhoto(
        ctx,
        fmtWelcomeBack(firstName),
        kbMainMenu()
      );
    }

    // Pending — show access screen with photo
    await sendWithPhoto(
      ctx,
      fmtWelcomeNew(firstName),
      kbNoAccess()
    );
  });

  // ── /cancel ─────────────────────────────────────────────────────────────────
  bot.command('cancel', async (ctx) => {
    clearStep(ctx.from.id);
    await ctx.reply(fmtCancelled(), { parse_mode: 'MarkdownV2' });
  });

  // ── /help ───────────────────────────────────────────────────────────────────
  bot.command('help', async (ctx) => {
    const userId = ctx.from.id;
    if (!hasAccess(userId) && !isAdmin(userId)) {
      return sendNoAccessMessage(ctx);
    }

    await ctx.reply(
      `❓ *Help — MALIK X BOT*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `/start — Main menu\n` +
      `/logout — Logout from account\n` +
      `/cancel — Cancel current action\n` +
      `/admin — Admin panel \\(admins only\\)\n` +
      `/help — Show this message\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `_@malikabubakker_`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // ── Menu Callbacks ───────────────────────────────────────────────────────────
  bot.callbackQuery('menu_main', async (ctx) => {
    await ctx.answerCallbackQuery();
    clearStep(ctx.from.id);

    const photoId = getPhotoFileId();

    if (photoId) {
      // Delete old message and send new one with photo
      try {
        await ctx.deleteMessage();
      } catch {}

      return sendWithPhoto(
        ctx,
        fmtMainMenu(),
        kbMainMenu()
      );
    }

    await ctx.editMessageText(fmtMainMenu(), {
      parse_mode:   'MarkdownV2',
      reply_markup: kbMainMenu(),
    });
  });

  bot.callbackQuery('menu_cpm1', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(fmtMainMenu('CPM1'), {
      parse_mode:   'MarkdownV2',
      reply_markup: kbCpm1Menu(),
    }).catch(async () => {
      await ctx.reply(fmtMainMenu('CPM1'), {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCpm1Menu(),
      });
    });
  });

  bot.callbackQuery('menu_cpm2', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(fmtMainMenu('CPM2'), {
      parse_mode:   'MarkdownV2',
      reply_markup: kbCpm2Menu(),
    }).catch(async () => {
      await ctx.reply(fmtMainMenu('CPM2'), {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCpm2Menu(),
      });
    });
  });

  bot.callbackQuery('menu_help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `❓ *Help — MALIK X BOT*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `🎮 *CPM1* — Car Parking Multiplayer 1\n` +
      `🎮 *CPM2* — Car Parking Multiplayer 2\n\n` +
      `Use the buttons below to navigate\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('menu_main'),
      }
    );
  });
}