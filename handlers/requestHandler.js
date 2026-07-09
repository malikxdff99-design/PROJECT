/**
 * requestHandler.js
 * Handles user access requests & messages to admin
 */

import { config } from '../config.js';
import {
  getOrCreateUser,
  getUserDisplayName,
  getLevelBadge,
  hasAccess,
} from '../database/users.js';
import {
  createNewRequest,
  approveRequest,
  rejectRequest,
  markReplied,
  getRequest,
  getPendingAccessRequest,
  REQUEST_TYPES,
  REQUEST_STATUS,
} from '../database/requests.js';
import {
  setStep,
  getStep,
  clearStep,
} from '../sessions/userState.js';
import { sendNoAccessMessage } from '../middleware/auth.js';
import { approveUser, revokeUser } from '../database/users.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function escMd(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function getAdminIds() {
  return config.bot.adminIds;
}

async function notifyAdmins(bot, text, keyboard = null) {
  for (const adminId of getAdminIds()) {
    try {
      await bot.api.sendMessage(adminId, text, {
        parse_mode:   'MarkdownV2',
        reply_markup: keyboard || undefined,
      });
    } catch {}
  }
}

function buildUserInfo(tgUser, user) {
  return (
    `👤 *User Info*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 ID: \`${escMd(tgUser.id)}\`\n` +
    `📛 Name: ${escMd(getUserDisplayName(user))}\n` +
    `📊 Level: ${escMd(getLevelBadge(user.level))}\n` +
    `📅 Joined: ${escMd(new Date(user.joinedAt).toLocaleDateString())}`
  );
}

// ── Register Handler ──────────────────────────────────────────────────────────
export function registerRequestHandler(bot) {

  // ── Request Access Button ───────────────────────────────────────────────────
  bot.callbackQuery('request_access', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId  = ctx.from.id;
    const tgUser  = ctx.from;
    const user    = getOrCreateUser(userId, tgUser);

    // Already has access
    if (hasAccess(userId)) {
      return ctx.editMessageText(
        `✅ *You already have access\\!*\nUse /start to continue\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    // Check existing pending request
    const existing = getPendingAccessRequest(userId);
    if (existing) {
      return ctx.editMessageText(
        `⏳ *Request Already Sent*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Your access request \\#${escMd(existing.id)} is still pending\\.\n` +
        `Please wait for admin approval\\.`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Message Admin', callback_data: 'request_message_admin' }],
            ],
          },
        }
      );
    }

    // Ask for optional message
    setStep(userId, 'request_access_message');
    await ctx.editMessageText(
      `📨 *Access Request*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Send a message explaining why you need access\\.\n` +
      `Or tap *Skip* to send without a message\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏭️ Skip', callback_data: 'request_access_skip' }],
            [{ text: '❌ Cancel', callback_data: 'request_cancel'     }],
          ],
        },
      }
    );
  });

  // ── Skip Message in Access Request ──────────────────────────────────────────
  bot.callbackQuery('request_access_skip', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const tgUser = ctx.from;

    clearStep(userId);
    await submitAccessRequest(ctx, bot, userId, tgUser, '');
  });

  // ── Cancel Request ──────────────────────────────────────────────────────────
  bot.callbackQuery('request_cancel', async (ctx) => {
    await ctx.answerCallbackQuery('Cancelled');
    clearStep(ctx.from.id);
    await sendNoAccessMessage(ctx);
  });

  // ── Message Admin Button ────────────────────────────────────────────────────
  bot.callbackQuery('request_message_admin', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;

    setStep(userId, 'request_send_message');
    await ctx.editMessageText(
      `💬 *Message Admin*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Type your message below and it will be sent to the admin\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'request_cancel' }],
          ],
        },
      }
    );
  });

  // ── Admin: Approve Request ──────────────────────────────────────────────────
  bot.callbackQuery(/^admin_approve_req_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const requestId = parseInt(ctx.match[1], 10);
    const adminId   = ctx.from.id;
    const req       = getRequest(requestId);

    if (!req) {
      return ctx.editMessageText(
        `❌ *Request not found*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    // Approve request & give premium
    approveRequest(requestId, adminId, 'Approved by admin');
    approveUser(req.userId, adminId);

    // Update admin message
    await ctx.editMessageText(
      ctx.message?.text + `\n\n✅ *APPROVED* by admin`,
      { parse_mode: 'MarkdownV2' }
    ).catch(() => {});

    // Notify user
    try {
      await bot.api.sendMessage(
        req.userId,
        `✅ *Access Approved\\!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Your access request has been *approved*\\!\n` +
        `Use /start to begin using the bot\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    } catch {}

    await ctx.reply(
      `✅ User \`${escMd(req.userId)}\` approved and notified\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // ── Admin: Reject Request ───────────────────────────────────────────────────
  bot.callbackQuery(/^admin_reject_req_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const requestId = parseInt(ctx.match[1], 10);
    const adminId   = ctx.from.id;
    const req       = getRequest(requestId);

    if (!req) {
      return ctx.editMessageText(
        `❌ *Request not found*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    rejectRequest(requestId, adminId, 'Rejected by admin');

    // Update admin message
    await ctx.editMessageText(
      ctx.message?.text + `\n\n❌ *REJECTED* by admin`,
      { parse_mode: 'MarkdownV2' }
    ).catch(() => {});

    // Notify user
    try {
      await bot.api.sendMessage(
        req.userId,
        `❌ *Access Denied*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Your access request has been *rejected*\\.\n` +
        `You can send a message to the admin for more info\\.`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Message Admin', callback_data: 'request_message_admin' }],
            ],
          },
        }
      );
    } catch {}

    await ctx.reply(
      `✅ User \`${escMd(req.userId)}\` rejected and notified\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // ── Admin: Reply to Message ─────────────────────────────────────────────────
  bot.callbackQuery(/^admin_reply_msg_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const requestId = parseInt(ctx.match[1], 10);
    const adminId   = ctx.from.id;

    setStep(adminId, 'admin_reply_message', { requestId });

    await ctx.reply(
      `💬 *Reply to Request \\#${escMd(requestId)}*\n` +
      `Type your reply message:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'admin_cancel_reply' }],
          ],
        },
      }
    );
  });

  bot.callbackQuery('admin_cancel_reply', async (ctx) => {
    await ctx.answerCallbackQuery('Cancelled');
    clearStep(ctx.from.id);
    await ctx.reply('↩️ Reply cancelled\\.', { parse_mode: 'MarkdownV2' });
  });

  // ── Text Step Handler ───────────────────────────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId  = ctx.from.id;
    const tgUser  = ctx.from;
    const { step, data } = getStep(userId);
    const text    = ctx.message.text.trim();

    if (!step) return next();

    // ── Access Request Message ────────────────────────────────────────────────
    if (step === 'request_access_message') {
      clearStep(userId);
      await submitAccessRequest(ctx, bot, userId, tgUser, text);
      return;
    }

    // ── Send Message to Admin ─────────────────────────────────────────────────
    if (step === 'request_send_message') {
      clearStep(userId);

      const user    = getOrCreateUser(userId, tgUser);
      const result  = createNewRequest(
        userId,
        REQUEST_TYPES.MESSAGE,
        text,
        {
          firstName: tgUser.first_name,
          lastName:  tgUser.last_name,
          username:  tgUser.username,
        }
      );

      const req = result.request;

      // Confirm to user
      await ctx.reply(
        `✅ *Message Sent\\!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Your message has been sent to the admin\\.\n` +
        `Request ID: \\#${escMd(req.id)}`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📨 Request Access', callback_data: 'request_access' }],
            ],
          },
        }
      );

      // Notify admins
      await notifyAdmins(
        bot,
        `💬 *New Message from User*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 ID: \`${escMd(userId)}\`\n` +
        `📛 Name: ${escMd(getUserDisplayName(user))}\n` +
        `📊 Level: ${escMd(getLevelBadge(user.level))}\n` +
        `🔢 Request \\#${escMd(req.id)}\n\n` +
        `💬 *Message:*\n${escMd(text)}`,
        {
          inline_keyboard: [
            [{ text: '💬 Reply', callback_data: `admin_reply_msg_${req.id}` }],
          ],
        }
      );

      return;
    }

    // ── Admin Reply ───────────────────────────────────────────────────────────
    if (step === 'admin_reply_message') {
      clearStep(userId);
      const { requestId } = data;
      const req = getRequest(requestId);

      if (!req) {
        return ctx.reply(
          `❌ *Request not found*`,
          { parse_mode: 'MarkdownV2' }
        );
      }

      markReplied(requestId, userId);

      // Send reply to user
      try {
        await bot.api.sendMessage(
          req.userId,
          `📩 *Admin Reply*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Re: Your request \\#${escMd(requestId)}\n\n` +
          `💬 ${escMd(text)}`,
          {
            parse_mode:   'MarkdownV2',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📨 Request Access', callback_data: 'request_access'        }],
                [{ text: '💬 Message Admin',  callback_data: 'request_message_admin' }],
              ],
            },
          }
        );

        await ctx.reply(
          `✅ *Reply sent to user*`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch {
        await ctx.reply(
          `❌ *Failed to send reply — user may have blocked the bot*`,
          { parse_mode: 'MarkdownV2' }
        );
      }

      return;
    }

    return next();
  });
}

// ── Submit Access Request Helper ──────────────────────────────────────────────
async function submitAccessRequest(ctx, bot, userId, tgUser, message) {
  const user   = getOrCreateUser(userId, tgUser);
  const result = createNewRequest(
    userId,
    REQUEST_TYPES.ACCESS,
    message,
    {
      firstName: tgUser.first_name,
      lastName:  tgUser.last_name,
      username:  tgUser.username,
    }
  );

  if (!result.success) {
    return ctx.reply(
      `⏳ *Request Already Pending*\n` +
      `Your request \\#${escMd(result.request.id)} is still pending\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  const req = result.request;

  // Confirm to user
  await ctx.reply(
    `✅ *Access Request Sent\\!*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Your request \\#${escMd(req.id)} has been sent to the admin\\.\n` +
    `You will be notified once it's reviewed\\.`,
    {
      parse_mode:   'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 Message Admin', callback_data: 'request_message_admin' }],
        ],
      },
    }
  );

  // Notify admins
  const msgText =
    `📨 *New Access Request*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 ID: \`${escMd(userId)}\`\n` +
    `📛 Name: ${escMd(getUserDisplayName(user))}\n` +
    `🔢 Request \\#${escMd(req.id)}\n` +
    (message ? `\n💬 *Message:*\n${escMd(message)}` : '');

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `admin_approve_req_${req.id}` },
        { text: '❌ Reject',  callback_data: `admin_reject_req_${req.id}`  },
      ],
      [
        { text: '💬 Reply',   callback_data: `admin_reply_msg_${req.id}`   },
      ],
    ],
  };

  await notifyAdmins(bot, msgText, keyboard);
}