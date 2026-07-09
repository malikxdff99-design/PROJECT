
/**
 * accountHandler.js
 * Handles unlock features & full account setup for CPM1
 */

import { CPMApiService } from '../services/cpmApi.js';
import {
  fmtUnlockSuccess, fmtUnlockFail,
  fmtAccountInfo, fmtError, fmtLoading,
} from '../utils/formatter.js';
import { kbUnlockMenu, kbBack } from '../utils/keyboard.js';
import { getToken, isLoggedIn } from '../sessions/userState.js';

const cpm1 = new CPMApiService();

// Helper to run a simple unlock action with loading state
async function runUnlock(ctx, label, actionFn) {
  const userId = ctx.from.id;

  if (!isLoggedIn(userId, 'cpm1')) {
    return ctx.editMessageText(
      fmtError('You must be logged in to CPM1 first\\.'),
      { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_unlock') }
    );
  }

  await ctx.editMessageText(
    fmtLoading(`Unlocking ${label}...`),
    { parse_mode: 'MarkdownV2' }
  );

  const token  = getToken(userId, 'cpm1');
  const result = await actionFn(token);

  await ctx.editMessageText(
    result.success
      ? fmtUnlockSuccess(label)
      : fmtUnlockFail(label, result.message),
    { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_unlock') }
  );
}

export function registerAccountHandler(bot) {

  // â”€â”€ Unlock Menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  bot.callbackQuery('cpm1_unlock', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `ðŸŒŸ *Unlock Menu â€” CPM1*`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbUnlockMenu(),
      }
    );
  });

  bot.callbackQuery('cpm1_unlock_all', async (ctx) => {
    await ctx.answerCallbackQuery('Unlocking everything...');
    await runUnlock(ctx, 'Everything', (t) => cpm1.unlockEverything(t));
  });

  bot.callbackQuery('cpm1_unlock_wheels', async (ctx) => {
    await ctx.answerCallbackQuery('Unlocking wheels...');
    await runUnlock(ctx, 'All Wheels', (t) => cpm1.unlockAllWheels(t));
  });

  bot.callbackQuery('cpm1_unlock_houses', async (ctx) => {
    await ctx.answerCallbackQuery('Unlocking houses...');
    await runUnlock(ctx, 'All Houses', (t) => cpm1.unlockAllHouses(t));
  });

  bot.callbackQuery('cpm1_unlock_anims', async (ctx) => {
    await ctx.answerCallbackQuery('Unlocking animations...');
    await runUnlock(ctx, 'All Animations', (t) => cpm1.unlockAllAnimations(t));
  });

  bot.callbackQuery('cpm1_unlock_equipment', async (ctx) => {
    await ctx.answerCallbackQuery('Unlocking equipment...');
    await runUnlock(ctx, 'All Equipment', (t) => cpm1.unlockAllEquipment(t));
  });

  bot.callbackQuery('cpm1_unlock_perks', async (ctx) => {
    await ctx.answerCallbackQuery('Unlocking perks...');
    await runUnlock(ctx, 'All Perks', (t) => cpm1.unlockAllGameplayPerks(t));
  });

  bot.callbackQuery('cpm1_unlock_levels', async (ctx) => {
    await ctx.answerCallbackQuery('Completing levels...');
    await runUnlock(ctx, 'All Levels', (t) => cpm1.completeAllLevels(t));
  });

  // â”€â”€ Account Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  bot.callbackQuery('menu_account', async (ctx) => {
    await ctx.answerCallbackQuery('Loading account info...');
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('menu_main') }
      );
    }

    await ctx.editMessageText(
      fmtLoading('Fetching account info...'),
      { parse_mode: 'MarkdownV2' }
    );

    const token  = getToken(userId, 'cpm1');
    const result = await cpm1.getAccountInfo(token);

    await ctx.editMessageText(
      result.success ? fmtAccountInfo(result.data) : fmtError(result.message),
      { parse_mode: 'MarkdownV2', reply_markup: kbBack('menu_main') }
    );
  });
}
