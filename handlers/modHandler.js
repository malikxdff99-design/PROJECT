/**
 * modHandler.js
 * Handles car modifications for CPM1
 */

import { CPMApiService } from '../services/cpmApi.js';
import {
  fmtModComplete, fmtModFail,
  fmtError, fmtLoading, fmtAskInput,
} from '../utils/formatter.js';
import { kbModsMenu, kbBack, kbCancel } from '../utils/keyboard.js';
import {
  getToken, setStep, getStep, clearStep, isLoggedIn,
} from '../sessions/userState.js';

const cpm1 = new CPMApiService();
const UPDATE_INTERVAL_MS = 2000;

export function registerModHandler(bot) {

  // ── Mods Menu ───────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_mods', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🔧 *Car Modifications — CPM1*`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbModsMenu(),
      }
    );
  });

  // ── Engine ──────────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_mod_engine', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isLoggedIn(ctx.from.id, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
      );
    }
    setStep(ctx.from.id, 'cpm1_mod_engine_carid');
    await ctx.editMessageText(
      fmtAskInput('Enter Car ID to modify (or ALL for all cars):'),
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_mods') }
    );
  });

  // ── Siren ───────────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_mod_siren', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isLoggedIn(ctx.from.id, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
      );
    }
    setStep(ctx.from.id, 'cpm1_mod_siren_carid');
    await ctx.editMessageText(
      fmtAskInput('Enter Car ID (or ALL for all cars):'),
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_mods') }
    );
  });

  // ── Mileage ─────────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_mod_mileage', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isLoggedIn(ctx.from.id, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
      );
    }
    setStep(ctx.from.id, 'cpm1_mod_mileage_carid');
    await ctx.editMessageText(
      fmtAskInput('Enter Car ID (or ALL for all cars):'),
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_mods') }
    );
  });

  // ── Chrome ──────────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_mod_chrome', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isLoggedIn(ctx.from.id, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
      );
    }
    setStep(ctx.from.id, 'cpm1_mod_chrome_carid');
    await ctx.editMessageText(
      fmtAskInput('Enter Car ID (or ALL for all cars):'),
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_mods') }
    );
  });

  // ── Text Steps ──────────────────────────────────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from.id;
    const { step, data } = getStep(userId);
    const text  = ctx.message.text.trim();
    const token = getToken(userId, 'cpm1');

    if (!step) return next();

    // ── Engine Steps ───────────────────────────────────────────────────────────
    if (step === 'cpm1_mod_engine_carid') {
      const carId = text.toUpperCase() === 'ALL' ? 'ALL' : parseInt(text, 10);
      if (carId !== 'ALL' && Number.isNaN(carId)) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid Car ID\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
        );
      }
      setStep(userId, 'cpm1_mod_engine_hp', { carId });
      return ctx.reply(
        fmtAskInput('Enter HP value (default 9999):'),
        { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_mods') }
      );
    }

    if (step === 'cpm1_mod_engine_hp') {
      const hp = parseFloat(text);
      if (Number.isNaN(hp) || hp < 0) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid HP value\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
        );
      }
      setStep(userId, 'cpm1_mod_engine_nm', { ...data, hp });
      return ctx.reply(
        fmtAskInput('Enter NM (torque) value (default 9999):'),
        { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_mods') }
      );
    }

    if (step === 'cpm1_mod_engine_nm') {
      const nm = parseFloat(text);
      if (Number.isNaN(nm) || nm < 0) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid NM value\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
        );
      }

      clearStep(userId);

      const loadMsg = await ctx.reply(
        fmtLoading('Applying engine modification...'),
        { parse_mode: 'MarkdownV2' }
      );

      let lastUpdate = Date.now();

      const result = await cpm1.setCustomEngine(
        token,
        data.carId,
        data.hp, data.hp,
        nm, nm,
        9999,
        0.05,
        async (event) => {
          const nowTs = Date.now();
          if (nowTs - lastUpdate < UPDATE_INTERVAL_MS) return;
          lastUpdate = nowTs;
          if (['processing', 'success', 'failed'].includes(event.type)) {
            await ctx.api
              .editMessageText(
                ctx.chat.id,
                loadMsg.message_id,
                fmtLoading(`[${event.current}/${event.total}] ${event.carName || ''}...`),
                { parse_mode: 'MarkdownV2' }
              )
              .catch(() => {});
          }
        }
      );

      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});

      return ctx.reply(
        result.success
          ? fmtModComplete('Custom Engine', result.results.success, result.results.failed, result.results.total)
          : fmtModFail('Custom Engine', result.message),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
      );
    }

    // ── Siren Step ────────────────────────────────────────────────────────────
    if (step === 'cpm1_mod_siren_carid') {
      const carId = text.toUpperCase() === 'ALL' ? 'ALL' : parseInt(text, 10);
      if (carId !== 'ALL' && Number.isNaN(carId)) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid Car ID\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
        );
      }

      clearStep(userId);

      const loadMsg = await ctx.reply(
        fmtLoading('Applying police siren...'),
        { parse_mode: 'MarkdownV2' }
      );

      const result = await cpm1.setPoliceSiren(token, carId);

      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});

      return ctx.reply(
        result.success
          ? fmtModComplete('Police Siren', result.results.success, result.results.failed, result.results.total)
          : fmtModFail('Police Siren', result.message),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
      );
    }

    // ── Mileage Steps ─────────────────────────────────────────────────────────
    if (step === 'cpm1_mod_mileage_carid') {
      const carId = text.toUpperCase() === 'ALL' ? 'ALL' : parseInt(text, 10);
      if (carId !== 'ALL' && Number.isNaN(carId)) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid Car ID\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
        );
      }
      setStep(userId, 'cpm1_mod_mileage_value', { carId });
      return ctx.reply(
        fmtAskInput('Enter mileage value (e.g. 0 to reset):'),
        { parse_mode: 'MarkdownV2', reply_markup: kbCancel('cpm1_mods') }
      );
    }

    if (step === 'cpm1_mod_mileage_value') {
      const value = parseFloat(text);
      if (Number.isNaN(value) || value < 0) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid mileage value\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
        );
      }

      clearStep(userId);

      const loadMsg = await ctx.reply(
        fmtLoading('Setting mileage...'),
        { parse_mode: 'MarkdownV2' }
      );

      const result = await cpm1.setMillage(token, data.carId, value);

      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});

      return ctx.reply(
        result.success
          ? fmtModComplete('Mileage', result.results.success, result.results.failed, result.results.total)
          : fmtModFail('Mileage', result.message),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
      );
    }

    // ── Chrome Steps ──────────────────────────────────────────────────────────
    if (step === 'cpm1_mod_chrome_carid') {
      const carId = text.toUpperCase() === 'ALL' ? 'ALL' : parseInt(text, 10);
      if (carId !== 'ALL' && Number.isNaN(carId)) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid Car ID\\.'),
          { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
        );
      }

      clearStep(userId);

      const loadMsg = await ctx.reply(
        fmtLoading('Applying chrome effect...'),
        { parse_mode: 'MarkdownV2' }
      );

      const result = await cpm1.setChrome(token, carId, 99.0, 99.0);

      await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});

      return ctx.reply(
        result.success
          ? fmtModComplete('Chrome', result.results.success, result.results.failed, result.results.total)
          : fmtModFail('Chrome', result.message),
        { parse_mode: 'MarkdownV2', reply_markup: kbBack('cpm1_mods') }
      );
    }

    return next();
  });
}