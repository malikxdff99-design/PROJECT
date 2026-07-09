/**
 * carHandler.js
 * Handles car listing and transfers for CPM1
 */

import { CPMApiService } from '../services/cpmApi.js';
import {
  fmtCarList,
  fmtTransferStart, fmtTransferProgress,
  fmtTransferComplete, fmtTransferFail,
  fmtError, fmtLoading, fmtAskInput,
} from '../utils/formatter.js';
import {
  kbCarsMenu, kbBack, kbCancel,
} from '../utils/keyboard.js';
import {
  getToken, setStep, getStep, clearStep, isLoggedIn,
} from '../sessions/userState.js';

const cpm1 = new CPMApiService();
const UPDATE_INTERVAL_MS = 2000;

export function registerCarHandler(bot) {

  // ── Cars Menu ───────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_cars', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🚗 *Cars Menu — CPM1*`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCarsMenu(),
      }
    );
  });

  // ── View Garage ─────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_view_cars', async (ctx) => {
    await ctx.answerCallbackQuery('Loading garage...');
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_cars'),
        }
      );
    }

    await ctx.editMessageText(
      fmtLoading('Fetching your garage...'),
      { parse_mode: 'MarkdownV2' }
    );

    const token  = getToken(userId, 'cpm1');
    const result = await cpm1.getAllCars(token, false);

    if (!result.success) {
      return ctx.editMessageText(
        fmtError(result.message),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_cars'),
        }
      );
    }

    await ctx.editMessageText(
      fmtCarList(result.cars),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('cpm1_cars'),
      }
    );
  });

  // ── Transfer Single ─────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_transfer_single', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_cars'),
        }
      );
    }

    setStep(userId, 'cpm1_transfer_single_src_email');
    await ctx.editMessageText(
      fmtAskInput('Enter SOURCE account email:'),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('cpm1_cars'),
      }
    );
  });

  // ── Transfer All ────────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_transfer_all', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_cars'),
        }
      );
    }

    setStep(userId, 'cpm1_transfer_all_src_email');
    await ctx.editMessageText(
      fmtAskInput('Enter SOURCE account email:'),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('cpm1_cars'),
      }
    );
  });

  // ── Transfer Missing ────────────────────────────────────────────────────────
  bot.callbackQuery('cpm1_transfer_missing', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;

    if (!isLoggedIn(userId, 'cpm1')) {
      return ctx.editMessageText(
        fmtError('You must be logged in to CPM1 first\\.'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('cpm1_cars'),
        }
      );
    }

    setStep(userId, 'cpm1_transfer_missing_src_email');
    await ctx.editMessageText(
      fmtAskInput('Enter SOURCE account email:'),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('cpm1_cars'),
      }
    );
  });

  // ── Text Step Handler ───────────────────────────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from.id;
    const { step, data } = getStep(userId);
    const text = ctx.message.text.trim();

    if (!step) return next();

    // ── Transfer Single Steps ─────────────────────────────────────────────────
    if (step === 'cpm1_transfer_single_src_email') {
      setStep(userId, 'cpm1_transfer_single_src_pass', { srcEmail: text });
      return ctx.reply(
        fmtAskInput('Enter SOURCE account password:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_single_src_pass') {
      setStep(userId, 'cpm1_transfer_single_dst_email', {
        ...data,
        srcPass: text,
      });
      return ctx.reply(
        fmtAskInput('Enter TARGET account email:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_single_dst_email') {
      setStep(userId, 'cpm1_transfer_single_dst_pass', {
        ...data,
        dstEmail: text,
      });
      return ctx.reply(
        fmtAskInput('Enter TARGET account password:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_single_dst_pass') {
      setStep(userId, 'cpm1_transfer_single_car_id', {
        ...data,
        dstPass: text,
      });
      return ctx.reply(
        fmtAskInput('Enter Car ID to transfer:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_single_car_id') {
      const carId = parseInt(text, 10);
      if (Number.isNaN(carId) || carId < 0) {
        clearStep(userId);
        return ctx.reply(
          fmtError('Invalid Car ID\\.'),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_cars'),
          }
        );
      }

      clearStep(userId);

      // Login both accounts
      const loadMsg = await ctx.reply(
        fmtLoading('Logging into accounts...'),
        { parse_mode: 'MarkdownV2' }
      );

      const [srcLogin, dstLogin] = await Promise.all([
        cpm1.login(data.srcEmail, data.srcPass),
        cpm1.login(data.dstEmail, data.dstPass),
      ]);

      if (!srcLogin.success) {
        await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
        return ctx.reply(
          fmtError(`Source login failed: ${srcLogin.message}`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_cars'),
          }
        );
      }

      if (!dstLogin.success) {
        await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
        return ctx.reply(
          fmtError(`Target login failed: ${dstLogin.message}`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_cars'),
          }
        );
      }

      await ctx.api.editMessageText(
        ctx.chat.id,
        loadMsg.message_id,
        fmtTransferStart(1),
        { parse_mode: 'MarkdownV2' }
      ).catch(() => {});

      const result = await cpm1.transferSingleVehicle(
        srcLogin.token,
        dstLogin.token,
        carId
      );

      const finalText = result.success
        ? fmtTransferComplete(1, 0, 1)
        : fmtTransferFail(result.message);

      await ctx.api
        .editMessageText(
          ctx.chat.id,
          loadMsg.message_id,
          finalText,
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_cars'),
          }
        )
        .catch(() => {});

      return;
    }

    // ── Transfer All Steps ────────────────────────────────────────────────────
    if (step === 'cpm1_transfer_all_src_email') {
      setStep(userId, 'cpm1_transfer_all_src_pass', { srcEmail: text });
      return ctx.reply(
        fmtAskInput('Enter SOURCE account password:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_all_src_pass') {
      setStep(userId, 'cpm1_transfer_all_dst_email', { ...data, srcPass: text });
      return ctx.reply(
        fmtAskInput('Enter TARGET account email:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_all_dst_email') {
      setStep(userId, 'cpm1_transfer_all_dst_pass', { ...data, dstEmail: text });
      return ctx.reply(
        fmtAskInput('Enter TARGET account password:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_all_dst_pass') {
      clearStep(userId);

      const loadMsg = await ctx.reply(
        fmtLoading('Logging into accounts...'),
        { parse_mode: 'MarkdownV2' }
      );

      const [srcLogin, dstLogin] = await Promise.all([
        cpm1.login(data.srcEmail, data.srcPass),
        cpm1.login(data.dstEmail, text),
      ]);

      if (!srcLogin.success || !dstLogin.success) {
        await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
        return ctx.reply(
          fmtError(`Login failed: ${!srcLogin.success ? srcLogin.message : dstLogin.message}`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_cars'),
          }
        );
      }

      let lastUpdate = Date.now();

      await ctx.api.editMessageText(
        ctx.chat.id,
        loadMsg.message_id,
        fmtLoading('Starting transfer...'),
        { parse_mode: 'MarkdownV2' }
      ).catch(() => {});

      const result = await cpm1.transferAllVehicles(
        srcLogin.token,
        dstLogin.token,
        async (event) => {
          const nowTs = Date.now();
          if (nowTs - lastUpdate < UPDATE_INTERVAL_MS) return;
          lastUpdate = nowTs;

          if (event.type === 'transferring' || event.type === 'success' || event.type === 'failed') {
            await ctx.api
              .editMessageText(
                ctx.chat.id,
                loadMsg.message_id,
                fmtTransferProgress(
                  event.current,
                  event.total,
                  event.carName || `Car #${event.carId}`,
                  event.type === 'success'
                ),
                { parse_mode: 'MarkdownV2' }
              )
              .catch(() => {});
          }
        }
      );

      const finalText = result.success
        ? fmtTransferComplete(
            result.results.success,
            result.results.failed,
            result.results.total
          )
        : fmtTransferFail(result.message);

      await ctx.api
        .editMessageText(
          ctx.chat.id,
          loadMsg.message_id,
          finalText,
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_cars'),
          }
        )
        .catch(() => {});

      return;
    }

    // ── Transfer Missing Steps ────────────────────────────────────────────────
    if (step === 'cpm1_transfer_missing_src_email') {
      setStep(userId, 'cpm1_transfer_missing_src_pass', { srcEmail: text });
      return ctx.reply(
        fmtAskInput('Enter SOURCE account password:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_missing_src_pass') {
      setStep(userId, 'cpm1_transfer_missing_dst_email', { ...data, srcPass: text });
      return ctx.reply(
        fmtAskInput('Enter TARGET account email:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_missing_dst_email') {
      setStep(userId, 'cpm1_transfer_missing_dst_pass', { ...data, dstEmail: text });
      return ctx.reply(
        fmtAskInput('Enter TARGET account password:'),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbCancel('cpm1_cars'),
        }
      );
    }

    if (step === 'cpm1_transfer_missing_dst_pass') {
      clearStep(userId);

      const loadMsg = await ctx.reply(
        fmtLoading('Logging into accounts...'),
        { parse_mode: 'MarkdownV2' }
      );

      const [srcLogin, dstLogin] = await Promise.all([
        cpm1.login(data.srcEmail, data.srcPass),
        cpm1.login(data.dstEmail, text),
      ]);

      if (!srcLogin.success || !dstLogin.success) {
        await ctx.api.deleteMessage(ctx.chat.id, loadMsg.message_id).catch(() => {});
        return ctx.reply(
          fmtError(`Login failed: ${!srcLogin.success ? srcLogin.message : dstLogin.message}`),
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_cars'),
          }
        );
      }

      let lastUpdate = Date.now();

      await ctx.api.editMessageText(
        ctx.chat.id,
        loadMsg.message_id,
        fmtLoading('Scanning for missing vehicles...'),
        { parse_mode: 'MarkdownV2' }
      ).catch(() => {});

      const result = await cpm1.transferMissingVehicles(
        srcLogin.token,
        dstLogin.token,
        async (event) => {
          const nowTs = Date.now();
          if (nowTs - lastUpdate < UPDATE_INTERVAL_MS) return;
          lastUpdate = nowTs;

          if (['transferring', 'success', 'failed'].includes(event.type)) {
            await ctx.api
              .editMessageText(
                ctx.chat.id,
                loadMsg.message_id,
                fmtTransferProgress(
                  event.current,
                  event.total,
                  event.carName || `Car #${event.carId}`,
                  event.type === 'success'
                ),
                { parse_mode: 'MarkdownV2' }
              )
              .catch(() => {});
          }
        }
      );

      const finalText = result.success
        ? fmtTransferComplete(
            result.results.success,
            result.results.failed,
            result.results.total
          )
        : fmtTransferFail(result.message);

      await ctx.api
        .editMessageText(
          ctx.chat.id,
          loadMsg.message_id,
          finalText,
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('cpm1_cars'),
          }
        )
        .catch(() => {});

      return;
    }

    return next();
  });
}