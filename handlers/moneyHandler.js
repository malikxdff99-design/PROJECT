/**
 * moneyHandler.js
 * Handles money & coins for CPM1
 * Handles money injection for CPM2
 */

import { CPMApiService  } from '../services/cpmApi.js';
import { CPM2ApiService } from '../services/cpm2Api.js';
import {
  fmtMoneySet, fmtCoinsSet, fmtMoneyAndCoinsSet,
  fmtInjectStart, fmtInjectProgress, fmtInjectComplete, fmtInjectFail,
  fmtError, fmtLoading, fmtAskInput, fmtSuccess,
} from '../utils/formatter.js';
import {
  kbMoneyMenu, kbInjectMenu, kbBack, kbCancel,
} from '../utils/keyboard.js';
import {
  getToken, setStep, getStep, clearStep, isLoggedIn,
} from '../sessions/userState.js';

const cpm1 = new CPMApiService();
const cpm2 = new CPM2ApiService();

const MAX_MONEY = 50_000_000;
const MAX_COINS =    500_000;
const MAX_UPDATE_INTERVAL_MS = 3000;

export function registerMoneyHandler(bot) {

  // ── CPM1 Money Menu ─────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_money', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💰 *Money & Coins — CPM1*`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbMoneyMenu(),
      }
    );
  });

  // Max money & coins (no input needed)
  bot.callbackQuery('cpm1_max_both', async (ctx) => {
    await ctx.answerCallbackQuery('Setting max money & coins...');
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_money'),
        }
      );
    }

    const token  = getToken(userId, 'cpm1');
    const result = await cpm1.setMaxMoneyAndCoins(token);

    await ctx.editMessageText(
      result.success
        ? fmtMoneyAndCoinsSet(MAX_MONEY, MAX_COINS)
        : fmtError(result.message),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('cpm1_money'),
      }
    );
  });

  // Set money (needs input)
  bot.callbackQuery('cpm1_set_money', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_money'),
        }
      );
    }

    setStep(userId, 'cpm1_set_money');
    await ctx.editMessageText(
      fmtAskInput(`Enter money amount (0 – ${MAX_MONEY.toLocaleString()}):`),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('cpm1_money'),
      }
    );
  });

  // Set coins (needs input)
  bot.callbackQuery('cpm1_set_coins', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_money'),
        }
      );
    }

    setStep(userId, 'cpm1_set_coins');
    await ctx.editMessageText(
      fmtAskInput(`Enter coins amount (0 – ${MAX_COINS.toLocaleString()}):`),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('cpm1_money'),
      }
    );
  });

  // Set both (needs input)
  bot.callbackQuery('cpm1_set_both', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_money'),
        }
      );
    }

    setStep(userId, 'cpm1_set_both_money');
    await ctx.editMessageText(
      fmtAskInput(`Enter money amount (0 – ${MAX_MONEY.toLocaleString()}):`),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('cpm1_money'),
      }
    );
  });

  // ── CPM2 Inject Menu ────────────────────────────────────────────────────────
  bot.callbackQuery('cpm2_inject', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💉 *Money Injection — CPM2*`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbInjectMenu(),
      }
    );
  });

  // Default inject (50M target, 50 concurrent)
  bot.callbackQuery('cpm2_inject_start', async (ctx) => {
    await ctx.answerCallbackQuery('Starting injection...');
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm2')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM2 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm2_inject'),
        }
      );
    }

    const token = getToken(userId, 'cpm2');

    const statusMsg = await ctx.editMessageText(
      fmtInjectStart(MAX_MONEY, 50),
      { parse_mode: 'MarkdownV2' }
    );

    let lastUpdate = Date.now();

    const result = await cpm2.injectMoneyStream(
      token,
      MAX_MONEY,
      50,
      async (event) => {
        if (event.type === 'progress') {
          const nowTs = Date.now();
          if (nowTs - lastUpdate < MAX_UPDATE_INTERVAL_MS) return;
          lastUpdate = nowTs;

          await ctx.api
            .editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              fmtInjectProgress(event.money, MAX_MONEY),
              { parse_mode: 'MarkdownV2' }
            )
            .catch(() => {});
        }
      }
    );

    if (result.success) {
      await ctx.api
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          fmtInjectComplete(result.finalMoney, result.totalRequests),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm2_inject'),
          }
        )
        .catch(() => {});
    } else {
      await ctx.api
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          fmtInjectFail(result.message),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm2_inject'),
          }
        )
        .catch(() => {});
    }
  });

  // Custom inject (needs input)
  bot.callbackQuery('cpm2_inject_custom', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm2')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM2 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm2_inject'),
        }
      );
    }

    setStep(userId, 'cpm2_inject_target');
    await ctx.editMessageText(
      fmtAskInput(`Enter target money amount (max ${MAX_MONEY.toLocaleString()}):`),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('cpm2_inject'),
      }
    );
  });

  // ── Text Step Handler ───────────────────────────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId  = ctx.from.id;
    const { step, data } = getStep(userId);
    const text    = ctx.message.text.trim();
    const token1  = getToken(userId, 'cpm1');
    const token2  = getToken(userId, 'cpm2');

    if (!step) return next();

    // ── Set Money ─────────────────────────────────────────────────────────────
    if (step === 'cpm1_set_money') {
      const amount = parseInt(text, 10);
      if (Number.isNaN(amount) || amount < 0 || amount > MAX_MONEY) {
        clearStep(userId);
        return ctx.reply(
          fmtError(`Invalid amount\\. Must be 0 – ${MAX_MONEY.toLocaleString()}\\.`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_money'),
          }
        );
      }

      const loadMsg = await ctx.reply(fmtLoading('Setting money...'), { parse_mode: 'MarkdownV2' });
      const result  = await cpm1.setMoney(token1, amount);
      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);

      return ctx.reply(
        result.success ? fmtMoneySet(amount) : fmtError(result.message),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_money'),
        }
      );
    }

    // ── Set Coins ─────────────────────────────────────────────────────────────
    if (step === 'cpm1_set_coins') {
      const amount = parseInt(text, 10);
      if (Number.isNaN(amount) || amount < 0 || amount > MAX_COINS) {
        clearStep(userId);
        return ctx.reply(
          fmtError(`Invalid amount\\. Must be 0 – ${MAX_COINS.toLocaleString()}\\.`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_money'),
          }
        );
      }

      const loadMsg = await ctx.reply(fmtLoading('Setting coins...'), { parse_mode: 'MarkdownV2' });
      const result  = await cpm1.setCoins(token1, amount);
      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);

      return ctx.reply(
        result.success ? fmtCoinsSet(amount) : fmtError(result.message),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_money'),
        }
      );
    }

    // ── Set Both — Money Step ─────────────────────────────────────────────────
    if (step === 'cpm1_set_both_money') {
      const amount = parseInt(text, 10);
      if (Number.isNaN(amount) || amount < 0 || amount > MAX_MONEY) {
        clearStep(userId);
        return ctx.reply(
          fmtError(`Invalid amount\\. Must be 0 – ${MAX_MONEY.toLocaleString()}\\.`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_money'),
          }
        );
      }

      setStep(userId, 'cpm1_set_both_coins', { money: amount });
      return ctx.reply(
        fmtAskInput(`Enter coins amount (0 – ${MAX_COINS.toLocaleString()}):`),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_money'),
        }
      );
    }

    // ── Set Both — Coins Step ─────────────────────────────────────────────────
    if (step === 'cpm1_set_both_coins') {
      const coins  = parseInt(text, 10);
      const money  = data.money;

      if (Number.isNaN(coins) || coins < 0 || coins > MAX_COINS) {
        clearStep(userId);
        return ctx.reply(
          fmtError(`Invalid amount\\. Must be 0 – ${MAX_COINS.toLocaleString()}\\.`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_money'),
          }
        );
      }

      const loadMsg = await ctx.reply(fmtLoading('Setting money & coins...'), { parse_mode: 'MarkdownV2' });
      const result  = await cpm1.setMoneyAndCoins(token1, money, coins);
      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
      clearStep(userId);

      return ctx.reply(
        result.success ? fmtMoneyAndCoinsSet(money, coins) : fmtError(result.message),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_money'),
        }
      );
    }

    // ── CPM2 Inject — Target Step ─────────────────────────────────────────────
    if (step === 'cpm2_inject_target') {
      const target = parseInt(text, 10);
      if (Number.isNaN(target) || target <= 0 || target > MAX_MONEY) {
        clearStep(userId);
        return ctx.reply(
          fmtError(`Invalid target\\. Must be 1 – ${MAX_MONEY.toLocaleString()}\\.`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm2_inject'),
          }
        );
      }

      setStep(userId, 'cpm2_inject_concurrent', { target });
      return ctx.reply(
        fmtAskInput('Enter concurrent requests (1 – 100):'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm2_inject'),
        }
      );
    }

    // ── CPM2 Inject — Concurrent Step ─────────────────────────────────────────
    if (step === 'cpm2_inject_concurrent') {
      const concurrent = parseInt(text, 10);
      if (Number.isNaN(concurrent) || concurrent < 1 || concurrent > 100) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid value\\. Must be 1 – 100\\.'),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm2_inject'),
          }
        );
      }

      const target   = data.target;
      clearStep(userId);

      const statusMsg = await ctx.reply(
        fmtInjectStart(target, concurrent),
        { parse_mode: 'MarkdownV2' }
      );

      let lastUpdate = Date.now();

      const result = await cpm2.injectMoneyStream(
        token2,
        target,
        concurrent,
        async (event) => {
          if (event.type === 'progress') {
            const nowTs = Date.now();
            if (nowTs - lastUpdate < MAX_UPDATE_INTERVAL_MS) return;
            lastUpdate = nowTs;

            await ctx.api
              .editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                fmtInjectProgress(event.money, target),
                { parse_mode: 'MarkdownV2' }
              )
              .catch(() => {});
          }
        }
      );

      const finalText = result.success
        ? fmtInjectComplete(result.finalMoney, result.totalRequests)
        : fmtInjectFail(result.message);

      await ctx.api
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          finalText,
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm2_inject'),
          }
        )
        .catch(() => {});
    }

    return next();
  });
}