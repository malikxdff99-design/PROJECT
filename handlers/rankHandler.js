/**
 * rankHandler.js
 * Handles rank get/set for CPM1
 */

import { CPMApiService } from '../services/cpmApi.js';
import {
  fmtRankSet, fmtRankGet, fmtError, fmtLoading,
} from '../utils/formatter.js';
import { kbRankMenu, kbBack } from '../utils/keyboard.js';
import { getToken, isLoggedIn } from '../sessions/userState.js';

const cpm1 = new CPMApiService();

export function registerRankHandler(bot) {

  bot.callbackQuery('cpm1_rank', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🏆 *Rank — CPM1*`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbRankMenu(),
      }
    );
  });

  bot.callbackQuery('cpm1_rank_set', async (ctx) => {
    await ctx.answerCallbackQuery('Setting max rank...');
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_rank') }
      );
    }

    await ctx.editMessageText(
      fmtLoading('Setting max rank...'),
      { parse_mode: 'MarkdownV2' }
    );

    const token  = getToken(userId, 'cpm1');
    const result = await cpm1.setRank(token);

    await ctx.editMessageText(
      result.success ? fmtRankSet() : fmtError(result.message),
      { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_rank') }
    );
  });

  bot.callbackQuery('cpm1_rank_get', async (ctx) => {
    await ctx.answerCallbackQuery('Fetching rank...');
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_rank') }
      );
    }

    await ctx.editMessageText(
      fmtLoading('Fetching rank data...'),
      { parse_mode: 'MarkdownV2' }
    );

    const token  = getToken(userId, 'cpm1');
    const result = await cpm1.getRank(token);

    await ctx.editMessageText(
      result.success ? fmtRankGet(result.data) : fmtError(result.message),
      { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_rank') }
    );
  });
}