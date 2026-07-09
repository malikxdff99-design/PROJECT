/**
 * profileHandler.js
 * Handles player profile settings for CPM1
 */

import { CPMApiService } from '../services/cpmApi.js';
import {
  fmtProfileSet, fmtError, fmtLoading, fmtAskInput,
} from '../utils/formatter.js';
import { kbProfileMenu, kbBack, kbCancel } from '../utils/keyboard.js';
import {
  getToken, setStep, getStep, clearStep, isLoggedIn,
} from '../sessions/userState.js';

const cpm1 = new CPMApiService();

export function registerProfileHandler(bot) {

  // ── Profile Menu ────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_profile', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `👤 *Profile — CPM1*`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbProfileMenu(),
      }
    );
  });

  // Set Name
  bot.callbackQuery('cpm1_set_name', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isLoggedIn(ctx.from.id, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
      );
    }
    setStep(ctx.from.id, 'cpm1_set_name');
    await ctx.editMessageText(
      fmtAskInput('Enter your new player name:'),
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_profile') }
    );
  });

  // Set Player ID
  bot.callbackQuery('cpm1_set_pid', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isLoggedIn(ctx.from.id, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
      );
    }
    setStep(ctx.from.id, 'cpm1_set_pid');
    await ctx.editMessageText(
      fmtAskInput('Enter your new Player ID:'),
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_profile') }
    );
  });

  // Set Wins
  bot.callbackQuery('cpm1_set_wins', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isLoggedIn(ctx.from.id, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
      );
    }
    setStep(ctx.from.id, 'cpm1_set_wins');
    await ctx.editMessageText(
      fmtAskInput('Enter number of race wins:'),
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_profile') }
    );
  });

  // Set Losses
  bot.callbackQuery('cpm1_set_losses', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isLoggedIn(ctx.from.id, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
      );
    }
    setStep(ctx.from.id, 'cpm1_set_losses');
    await ctx.editMessageText(
      fmtAskInput('Enter number of race losses:'),
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_profile') }
    );
  });

  // ── Text Steps ──────────────────────────────────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from.id;
    const { step } = getStep(userId);
    const text   = ctx.message.text.trim();
    const token  = getToken(userId, 'cpm1');

    if (!step) return next();

    if (step === 'cpm1_set_name') {
      if (!text || text.length > 300) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Name must be 1–300 characters\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
        );
      }
      const loadMsg = await ctx.reply(fmtLoading('Setting name...'), { parse_mode: 'MarkdownV2' });
      const result  = await cpm1.setPlayerName(token, text);
      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);
      return ctx.reply(
        result.success ? fmtProfileSet('Player Name', text) : fmtError(result.message),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
      );
    }

    if (step === 'cpm1_set_pid') {
      if (!text || text.length > 1000) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Player ID must be 1–1000 characters\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
        );
      }
      const loadMsg = await ctx.reply(fmtLoading('Setting Player ID...'), { parse_mode: 'MarkdownV2' });
      const result  = await cpm1.setPlayerId(token, text);
      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);
      return ctx.reply(
        result.success ? fmtProfileSet('Player ID', text) : fmtError(result.message),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
      );
    }

    if (step === 'cpm1_set_wins') {
      const wins = parseInt(text, 10);
      if (Number.isNaN(wins) || wins < 0) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Please enter a valid non\\-negative number\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
        );
      }
      const loadMsg = await ctx.reply(fmtLoading('Setting wins...'), { parse_mode: 'MarkdownV2' });
      const result  = await cpm1.setRaceWins(token, wins);
      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);
      return ctx.reply(
        result.success ? fmtProfileSet('Race Wins', wins) : fmtError(result.message),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
      );
    }

    if (step === 'cpm1_set_losses') {
      const losses = parseInt(text, 10);
      if (Number.isNaN(losses) || losses < 0) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Please enter a valid non\\-negative number\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
        );
      }
      const loadMsg = await ctx.reply(fmtLoading('Setting losses...'), { parse_mode: 'MarkdownV2' });
      const result  = await cpm1.setRaceLosses(token, losses);
      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);
      return ctx.reply(
        result.success ? fmtProfileSet('Race Losses', losses) : fmtError(result.message),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_profile') }
      );
    }

    return next();
  });
}