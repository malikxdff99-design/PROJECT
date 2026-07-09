/**
 * authHandler.js
 * Handles login, register, change password, change email
 * for both CPM1 and CPM2
 */

import { CPMApiService  } from '../services/cpmApi.js';
import { CPM2ApiService } from '../services/cpm2Api.js';
import {
  fmtLoginSuccess, fmtLoginFail,
  fmtRegisterSuccess, fmtRegisterFail,
  fmtLoggedOut, fmtAlreadyLoggedIn,
  fmtSuccess, fmtError, fmtAskInput, fmtLoading,
} from '../utils/formatter.js';
import { kbAuthMenu, kbBack, kbCancel } from '../utils/keyboard.js';
import {
  setToken, getToken, getEmail,
  clearAllTokens, isLoggedIn, setStep, getStep, clearStep,
} from '../sessions/userState.js';

const cpm1 = new CPMApiService();
const cpm2 = new CPM2ApiService();

function getService(game) {
  return game === 'cpm2' ? cpm2 : cpm1;
}

export function registerAuthHandler(bot) {

  // ── Menu Callbacks ──────────────────────────────────────────────────────────
  for (const game of ['cpm1', 'cpm2']) {
    bot.callbackQuery(`${game}_auth`, async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `🔐 *Auth Menu — ${game.toUpperCase()}*`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbAuthMenu(game),
        }
      );
    });

    // ── Login ─────────────────────────────────────────────────────────────────
    bot.callbackQuery(`${game}_login`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;

      if (isLoggedIn(userId, game)) {
        const email = getEmail(userId, game);
        return ctx.editMessageText(
          fmtAlreadyLoggedIn(email),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack(`${game}_auth`),
          }
        );
      }

      setStep(userId, `${game}_login_email`, { game });
      await ctx.editMessageText(
        fmtAskInput('Enter your email address:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel(`${game}_auth`),
        }
      );
    });

    // ── Register ──────────────────────────────────────────────────────────────
    bot.callbackQuery(`${game}_register`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;

      setStep(userId, `${game}_register_email`, { game });
      await ctx.editMessageText(
        fmtAskInput('Enter a new email address:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel(`${game}_auth`),
        }
      );
    });

    // ── Change Password ───────────────────────────────────────────────────────
    bot.callbackQuery(`${game}_change_password`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;

      if (!isLoggedIn(userId, game)) {
        return ctx.editMessageText(
          fmtError('You must be logged in first\\.'),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack(`${game}_auth`),
          }
        );
      }

      setStep(userId, `${game}_change_password`, { game });
      await ctx.editMessageText(
        fmtAskInput('Enter your new password (min 6 characters):'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel(`${game}_auth`),
        }
      );
    });

    // ── Change Email ──────────────────────────────────────────────────────────
    bot.callbackQuery(`${game}_change_email`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;

      if (!isLoggedIn(userId, game)) {
        return ctx.editMessageText(
          fmtError('You must be logged in first\\.'),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack(`${game}_auth`),
          }
        );
      }

      setStep(userId, `${game}_change_email`, { game });
      await ctx.editMessageText(
        fmtAskInput('Enter your new email address:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel(`${game}_auth`),
        }
      );
    });
  }

  // ── /logout command ─────────────────────────────────────────────────────────
  bot.command('logout', async (ctx) => {
    clearAllTokens(ctx.from.id);
    clearStep(ctx.from.id);
    await ctx.reply(fmtLoggedOut(), { parse_mode: 'MarkdownV2' });
  });

  // ── Text Message Step Handler ───────────────────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from.id;
    const { step, data } = getStep(userId);
    const text  = ctx.message.text.trim();
    const game  = data?.game || 'cpm1';
    const svc   = getService(game);

    if (!step) return next();

    // ── Login steps ───────────────────────────────────────────────────────────
    if (step === `${game}_login_email`) {
      setStep(userId, `${game}_login_password`, { game, email: text });
      return ctx.reply(
        fmtAskInput('Enter your password:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel(`${game}_auth`),
        }
      );
    }

    if (step === `${game}_login_password`) {
      const loadMsg = await ctx.reply(
        fmtLoading('Logging in...'),
        { parse_mode: 'MarkdownV2' }
      );

      const result = await svc.login(data.email, text);

      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});

      if (result.success) {
        setToken(userId, game, result.token, result.email);
        clearStep(userId);
        return ctx.reply(
          fmtLoginSuccess(result.email),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack(`menu_${game}`),
          }
        );
      }

      clearStep(userId);
      return ctx.reply(
        fmtLoginFail(result.message),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack(`${game}_auth`),
        }
      );
    }

    // ── Register steps ────────────────────────────────────────────────────────
    if (step === `${game}_register_email`) {
      setStep(userId, `${game}_register_password`, { game, email: text });
      return ctx.reply(
        fmtAskInput('Enter a password (min 6 characters):'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel(`${game}_auth`),
        }
      );
    }

    if (step === `${game}_register_password`) {
      const loadMsg = await ctx.reply(
        fmtLoading('Registering...'),
        { parse_mode: 'MarkdownV2' }
      );

      const result = await svc.register(data.email, text);

      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});

      if (result.success) {
        setToken(userId, game, result.token, result.email);
        clearStep(userId);
        return ctx.reply(
          fmtRegisterSuccess(result.email),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack(`menu_${game}`),
          }
        );
      }

      clearStep(userId);
      return ctx.reply(
        fmtRegisterFail(result.message),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack(`${game}_auth`),
        }
      );
    }

    // ── Change password step ──────────────────────────────────────────────────
    if (step === `${game}_change_password`) {
      const token = getToken(userId, game);
      const loadMsg = await ctx.reply(
        fmtLoading('Changing password...'),
        { parse_mode: 'MarkdownV2' }
      );

      const result = await svc.changePassword(token, text);

      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);

      return ctx.reply(
        result.success ? fmtSuccess('Password changed successfully\\.') : fmtError(result.message),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack(`${game}_auth`),
        }
      );
    }

    // ── Change email step ─────────────────────────────────────────────────────
    if (step === `${game}_change_email`) {
      const token = getToken(userId, game);
      const loadMsg = await ctx.reply(
        fmtLoading('Changing email...'),
        { parse_mode: 'MarkdownV2' }
      );

      const result = await svc.changeEmail(token, text);

      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);

      return ctx.reply(
        result.success ? fmtSuccess('Email changed successfully\\.') : fmtError(result.message),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack(`${game}_auth`),
        }
      );
    }

    return next();
  });
}