/**
 * adminHandler.js
 * MALIK X BOT — Full Admin Panel
 */

import {
  getAllUsers,
  getUsersByLevel,
  getUser,
  getOrCreateUser,
  getUserDisplayName,
  getLevelBadge,
  getStats,
  approveUser,
  revokeUser,
  banUser,
  unbanUser,
  isAdmin,
} from '../database/users.js';

import {
  getPendingRequests,
  getAllRequests,
  getRequest,
  getRequestStats,
  approveRequest,
  rejectRequest,
  markReplied,
  REQUEST_STATUS,
  REQUEST_TYPES,
} from '../database/requests.js';

import {
  getStep,
  setStep,
  clearStep,
  clearAllTokens,
} from '../sessions/userState.js';

import {
  setMaintenanceMode,
  getMaintenanceMode,
} from '../middleware/auth.js';

import {
  getAllSettings,
  getPhotoFileId,
  setPhotoFileId,
  clearPhoto,
  setBotName,
  setWelcomeTitle,
  setWelcomeSubtitle,
  setFooter,
} from '../database/botSettings.js';

import {
  fmtAdminPanel,
  fmtBotSettings,
  fmtBroadcastComplete,
  fmtError,
  fmtLoading,
  esc,
} from '../utils/formatter.js';

import {
  kbAdminMain,
  kbUsersMenu,
  kbRequestsMenu,
  kbUserActions,
  kbPhotoMenu,
  kbSettingsMenu,
  kbBack,
  kbCancel,
} from '../utils/keyboard.js';

import { USER_LEVELS } from '../config.js';

// ── Admin Guard ───────────────────────────────────────────────────────────────
function adminOnly(handler) {
  return async (ctx, ...args) => {
    if (!isAdmin(ctx.from?.id)) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery('❌ Admin only').catch(() => {});
      }
      return;
    }
    return handler(ctx, ...args);
  };
}

// ── User Card Builder ─────────────────────────────────────────────────────────
function buildUserCard(user) {
  if (!user) return `❌ *User not found*`;
  return (
    `👤 *User Card*\n` +
    `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
    `🆔 *ID:* \`${esc(user.id)}\`\n` +
    `📛 *Name:* ${esc(getUserDisplayName(user))}\n` +
    `📊 *Level:* ${esc(getLevelBadge(user.level))}\n` +
    `📅 *Joined:* ${esc(new Date(user.joinedAt).toLocaleDateString())}\n` +
    `🕐 *Last Active:* ${esc(new Date(user.lastActiveAt).toLocaleDateString())}` +
    (user.banReason
      ? `\n🚫 *Ban Reason:* _${esc(user.banReason)}_`
      : '') +
    (user.approvedAt
      ? `\n✅ *Approved:* ${esc(new Date(user.approvedAt).toLocaleDateString())}`
      : '') +
    `\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`
  );
}

// ── Request Card Builder ──────────────────────────────────────────────────────
function buildRequestCard(req) {
  const reqUser  = getUser(req.userId);
  const name     = reqUser
    ? getUserDisplayName(reqUser)
    : `User ${req.userId}`;
  const typeIcon = req.type === REQUEST_TYPES.ACCESS ? '📨' : '💬';
  const statusIcon = {
    [REQUEST_STATUS.PENDING]:  '⏳',
    [REQUEST_STATUS.APPROVED]: '✅',
    [REQUEST_STATUS.REJECTED]: '❌',
    [REQUEST_STATUS.REPLIED]:  '💬',
  }[req.status] || '❓';

  return (
    `${typeIcon} *Request \\#${esc(req.id)}*\n` +
    `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
    `🆔 *User ID:* \`${esc(req.userId)}\`\n` +
    `📛 *Name:* ${esc(name)}\n` +
    `📝 *Type:* ${esc(req.type)}\n` +
    `${statusIcon} *Status:* ${esc(req.status)}\n` +
    `📅 *Date:* ${esc(new Date(req.createdAt).toLocaleDateString())}` +
    (req.message
      ? `\n\n💬 *Message:*\n${esc(req.message)}`
      : '') +
    (req.adminNote
      ? `\n\n📝 *Admin Note:*\n${esc(req.adminNote)}`
      : '') +
    `\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`
  );
}

// ── Notify User Helper ────────────────────────────────────────────────────────
async function notifyUser(bot, userId, text, keyboard = null) {
  try {
    await bot.api.sendMessage(userId, text, {
      parse_mode:   'MarkdownV2',
      reply_markup: keyboard || undefined,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Register ──────────────────────────────────────────────────────────────────
export function registerAdminHandler(bot) {

  // ════════════════════════════════════════════════════════
  // /admin COMMAND
  // ════════════════════════════════════════════════════════
  bot.command('admin', adminOnly(async (ctx) => {
    const photoId = getPhotoFileId();

    const text     = fmtAdminPanel();
    const keyboard = kbAdminMain();

    if (photoId) {
      try {
        await ctx.replyWithPhoto(photoId, {
          caption:      text,
          parse_mode:   'MarkdownV2',
          reply_markup: keyboard,
        });
        return;
      } catch {}
    }

    await ctx.reply(text, {
      parse_mode:   'MarkdownV2',
      reply_markup: keyboard,
    });
  }));

  // ════════════════════════════════════════════════════════
  // MAIN PANEL
  // ════════════════════════════════════════════════════════
  bot.callbackQuery('admin_main', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(fmtAdminPanel(), {
      parse_mode:   'MarkdownV2',
      reply_markup: kbAdminMain(),
    }).catch(async () => {
      await ctx.reply(fmtAdminPanel(), {
        parse_mode:   'MarkdownV2',
        reply_markup: kbAdminMain(),
      });
    });
  }));

  // ════════════════════════════════════════════════════════
  // STATISTICS
  // ════════════════════════════════════════════════════════
  bot.callbackQuery('admin_stats', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();

    const s  = getStats();
    const rs = getRequestStats();

    const text =
      `📊 *Bot Statistics*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `👥 *Users*\n` +
      `  Total:          \`${esc(s.total)}\`\n` +
      `  👑 Admin:       \`${esc(s.admin)}\`\n` +
      `  ⭐ Premium:     \`${esc(s.premium)}\`\n` +
      `  ⏳ Pending:     \`${esc(s.pending)}\`\n` +
      `  🚫 Banned:      \`${esc(s.banned)}\`\n` +
      `  🟢 Active \\(1h\\): \`${esc(s.activeHour)}\`\n\n` +
      `📨 *Requests*\n` +
      `  Total:          \`${esc(rs.total)}\`\n` +
      `  ⏳ Pending:     \`${esc(rs.pending)}\`\n` +
      `  ✅ Approved:    \`${esc(rs.approved)}\`\n` +
      `  ❌ Rejected:    \`${esc(rs.rejected)}\`\n` +
      `  💬 Replied:     \`${esc(rs.replied)}\`\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`;

    await ctx.editMessageText(text, {
      parse_mode:   'MarkdownV2',
      reply_markup: kbBack('admin_main'),
    });
  }));

  // ════════════════════════════════════════════════════════
  // USER MANAGEMENT
  // ════════════════════════════════════════════════════════
  bot.callbackQuery('admin_users', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `👥 *User Management*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Select a category:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbUsersMenu(),
      }
    );
  }));

  // ── Users By Level ────────────────────────────────────────────────────────
  const levelFilters = [
    ['admin_users_pending', USER_LEVELS.PENDING, '⏳ Pending Users'],
    ['admin_users_premium', USER_LEVELS.PREMIUM, '⭐ Premium Users'],
    ['admin_users_banned',  USER_LEVELS.BANNED,  '🚫 Banned Users' ],
  ];

  for (const [cbData, level, label] of levelFilters) {
    bot.callbackQuery(cbData, adminOnly(async (ctx) => {
      await ctx.answerCallbackQuery();
      const list = getUsersByLevel(level);

      if (!list.length) {
        return ctx.editMessageText(
          `${label}\n` +
          `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
          `_No users found in this category_`,
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('admin_users'),
          }
        );
      }

      const lines = list.slice(0, 20).map((u, i) =>
        `${esc(i + 1)}\\. \`${esc(u.id)}\` — ${esc(getUserDisplayName(u))}`
      );

      const extra = list.length > 20
        ? `\n_\\.\\.\\.and ${esc(list.length - 20)} more_`
        : '';

      await ctx.editMessageText(
        `${label} \\(${esc(list.length)}\\)\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        lines.join('\n') +
        extra,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_users'),
        }
      );
    }));
  }

  // ── All Users ────────────────────────────────────────────────────────────
  bot.callbackQuery('admin_users_all', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const list = getAllUsers();

    if (!list.length) {
      return ctx.editMessageText(
        `👥 *All Users*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `_No users yet_`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_users'),
        }
      );
    }

    const lines = list.slice(0, 20).map((u, i) =>
      `${esc(i + 1)}\\. \`${esc(u.id)}\` ${esc(getLevelBadge(u.level))} — ${esc(getUserDisplayName(u))}`
    );

    const extra = list.length > 20
      ? `\n_\\.\\.\\.and ${esc(list.length - 20)} more_`
      : '';

    await ctx.editMessageText(
      `👥 *All Users* \\(${esc(list.length)}\\)\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      lines.join('\n') +
      extra,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('admin_users'),
      }
    );
  }));

  // ── Find User ────────────────────────────────────────────────────────────
  bot.callbackQuery('admin_users_find', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx.from.id, 'admin_find_user');
    await ctx.editMessageText(
      `🔍 *Find User*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Enter the user's Telegram ID:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('admin_users'),
      }
    );
  }));

  // ════════════════════════════════════════════════════════
  // USER ACTIONS
  // ════════════════════════════════════════════════════════

  // ── Approve ──────────────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_ua_approve_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);

    if (isAdmin(targetId)) {
      return ctx.reply(
        `⚠️ *Cannot modify admin accounts*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    approveUser(targetId, ctx.from.id);

    await notifyUser(
      bot,
      targetId,
      `✅ *Access Approved\\!*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `You now have *premium access*\\!\n` +
      `Use /start to begin\\.`
    );

    const user = getUser(targetId);
    await ctx.editMessageText(buildUserCard(user), {
      parse_mode:   'MarkdownV2',
      reply_markup: kbUserActions(targetId),
    }).catch(() => {});

    await ctx.reply(
      `✅ User \`${esc(targetId)}\` approved and notified\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  }));

  // ── Revoke ───────────────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_ua_revoke_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);

    if (isAdmin(targetId)) {
      return ctx.reply(
        `⚠️ *Cannot modify admin accounts*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    revokeUser(targetId);

    await notifyUser(
      bot,
      targetId,
      `⚠️ *Access Revoked*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Your premium access has been revoked\\.`
    );

    const user = getUser(targetId);
    await ctx.editMessageText(buildUserCard(user), {
      parse_mode:   'MarkdownV2',
      reply_markup: kbUserActions(targetId),
    }).catch(() => {});

    await ctx.reply(
      `✅ User \`${esc(targetId)}\` access revoked\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  }));

  // ── Ban ───────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_ua_ban_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);

    if (isAdmin(targetId)) {
      return ctx.reply(
        `⚠️ *Cannot ban admin accounts*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    setStep(ctx.from.id, 'admin_ban_reason', { targetId });

    await ctx.reply(
      `🚫 *Ban User \`${esc(targetId)}\`*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Enter a ban reason or tap Skip:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏭️ Skip \\(No Reason\\)', callback_data: `admin_ua_ban_skip_${targetId}` }],
            [{ text: '❌ Cancel',               callback_data: 'admin_users'                   }],
          ],
        },
      }
    );
  }));

  // ── Ban No Reason ─────────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_ua_ban_skip_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);
    clearStep(ctx.from.id);

    banUser(targetId, 'No reason provided', ctx.from.id);

    await notifyUser(
      bot,
      targetId,
      `🚫 *You Have Been Banned*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `*Reason:* _No reason provided_`
    );

    await ctx.editMessageText(
      `✅ User \`${esc(targetId)}\` banned\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('admin_users'),
      }
    ).catch(() => {});
  }));

  // ── Unban ─────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_ua_unban_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);

    unbanUser(targetId);

    await notifyUser(
      bot,
      targetId,
      `✅ *You Have Been Unbanned\\!*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Use /start to continue\\.`
    );

    const user = getUser(targetId);
    await ctx.editMessageText(buildUserCard(user), {
      parse_mode:   'MarkdownV2',
      reply_markup: kbUserActions(targetId),
    }).catch(() => {});

    await ctx.reply(
      `✅ User \`${esc(targetId)}\` unbanned\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  }));

  // ── Force Logout ──────────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_ua_logout_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);

    clearAllTokens(targetId);

    await notifyUser(
      bot,
      targetId,
      `🔒 *Force Logged Out*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `You were logged out by admin\\.\n` +
      `Use /start to login again\\.`
    );

    await ctx.reply(
      `✅ User \`${esc(targetId)}\` force logged out\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  }));

  // ── Send Message To User ──────────────────────────────────────────────────
  bot.callbackQuery(/^admin_ua_msg_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);

    setStep(ctx.from.id, 'admin_send_user_msg', { targetId });

    await ctx.reply(
      `💬 *Send Message to \`${esc(targetId)}\`*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Type your message:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('admin_users'),
      }
    );
  }));

  // ════════════════════════════════════════════════════════
  // REQUEST MANAGEMENT
  // ════════════════════════════════════════════════════════
  bot.callbackQuery('admin_requests', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📨 *Request Management*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Select a category:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbRequestsMenu(),
      }
    );
  }));

  // ── Pending Requests ──────────────────────────────────────────────────────
  bot.callbackQuery('admin_req_pending', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const list = getPendingRequests();

    if (!list.length) {
      return ctx.editMessageText(
        `📨 *Pending Requests*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `_No pending requests\\!_ ✅`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_requests'),
        }
      );
    }

    await ctx.editMessageText(
      `📨 *Pending Requests* \\(${esc(list.length)}\\)\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Showing ${esc(Math.min(list.length, 5))} requests below:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('admin_requests'),
      }
    );

    for (const req of list.slice(0, 5)) {
      await ctx.reply(buildRequestCard(req), {
        parse_mode:   'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `admin_approve_req_${req.id}` },
              { text: '❌ Reject',  callback_data: `admin_reject_req_${req.id}`  },
            ],
            [
              { text: '💬 Reply',   callback_data: `admin_reply_msg_${req.id}`   },
            ],
          ],
        },
      });
    }
  }));

  // ── All Requests ──────────────────────────────────────────────────────────
  bot.callbackQuery('admin_req_all', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const list = getAllRequests().slice(0, 20);
    const rs   = getRequestStats();

    if (!list.length) {
      return ctx.editMessageText(
        `📋 *All Requests*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `_No requests yet_`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_requests'),
        }
      );
    }

    const statusIcon = {
      [REQUEST_STATUS.PENDING]:  '⏳',
      [REQUEST_STATUS.APPROVED]: '✅',
      [REQUEST_STATUS.REJECTED]: '❌',
      [REQUEST_STATUS.REPLIED]:  '💬',
    };

    const lines = list.map((r, i) =>
      `${esc(i + 1)}\\. ${statusIcon[r.status] || '❓'} \\#${esc(r.id)} \`${esc(r.userId)}\` _${esc(r.type)}_`
    );

    await ctx.editMessageText(
      `📋 *All Requests* \\(${esc(rs.total)}\\)\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      lines.join('\n') +
      (rs.total > 20 ? `\n_\\.\\.\\.and ${esc(rs.total - 20)} more_` : ''),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('admin_requests'),
      }
    );
  }));

  // ── Approve Request ───────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_approve_req_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const requestId = parseInt(ctx.match[1], 10);
    const adminId   = ctx.from.id;
    const req       = getRequest(requestId);

    if (!req) {
      return ctx.reply(
        `❌ *Request \\#${esc(requestId)} not found*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    approveRequest(requestId, adminId, 'Approved by admin');
    approveUser(req.userId, adminId);

    const sent = await notifyUser(
      bot,
      req.userId,
      `✅ *Access Approved\\!*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `🎉 Your request *\\#${esc(requestId)}* has been *approved*\\!\n` +
      `Use /start to begin using the bot\\.`
    );

    await ctx.editMessageText(
      buildRequestCard(getRequest(requestId)) +
      `\n\n✅ *APPROVED* by admin`,
      { parse_mode: 'MarkdownV2' }
    ).catch(() => {});

    await ctx.reply(
      `✅ Request \\#${esc(requestId)} approved\\.\n` +
      `User \`${esc(req.userId)}\` ${sent ? 'notified\\.' : 'could not be notified \\(blocked bot\\)\\.'}`,
      { parse_mode: 'MarkdownV2' }
    );
  }));

  // ── Reject Request ────────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_reject_req_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const requestId = parseInt(ctx.match[1], 10);
    const adminId   = ctx.from.id;
    const req       = getRequest(requestId);

    if (!req) {
      return ctx.reply(
        `❌ *Request \\#${esc(requestId)} not found*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    rejectRequest(requestId, adminId, 'Rejected by admin');

    const sent = await notifyUser(
      bot,
      req.userId,
      `❌ *Access Denied*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Your request *\\#${esc(requestId)}* has been *rejected*\\.\n` +
      `Contact admin for more information\\.`,
      {
        inline_keyboard: [
          [{ text: '💬 Message Admin', callback_data: 'request_message_admin' }],
        ],
      }
    );

    await ctx.editMessageText(
      buildRequestCard(getRequest(requestId)) +
      `\n\n❌ *REJECTED* by admin`,
      { parse_mode: 'MarkdownV2' }
    ).catch(() => {});

    await ctx.reply(
      `✅ Request \\#${esc(requestId)} rejected\\.\n` +
      `User \`${esc(req.userId)}\` ${sent ? 'notified\\.' : 'could not be notified \\(blocked bot\\)\\.'}`,
      { parse_mode: 'MarkdownV2' }
    );
  }));

  // ── Reply To Request ──────────────────────────────────────────────────────
  bot.callbackQuery(/^admin_reply_msg_(\d+)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const requestId = parseInt(ctx.match[1], 10);
    const req       = getRequest(requestId);

    if (!req) {
      return ctx.reply(
        `❌ *Request \\#${esc(requestId)} not found*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    setStep(ctx.from.id, 'admin_reply_message', { requestId });

    await ctx.reply(
      `💬 *Reply to Request \\#${esc(requestId)}*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
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
  }));

  bot.callbackQuery('admin_cancel_reply', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery('Cancelled');
    clearStep(ctx.from.id);
    await ctx.reply(
      `🚫 *Reply cancelled*`,
      { parse_mode: 'MarkdownV2' }
    );
  }));

  // ════════════════════════════════════════════════════════
  // BROADCAST
  // ════════════════════════════════════════════════════════
  bot.callbackQuery('admin_broadcast', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx.from.id, 'admin_broadcast_msg');
    await ctx.editMessageText(
      `📢 *Broadcast Message*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Type the message to send to *ALL* users:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('admin_main'),
      }
    );
  }));

  // ════════════════════════════════════════════════════════
  // MAINTENANCE MODE
  // ════════════════════════════════════════════════════════
  bot.callbackQuery('admin_maintenance', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const current = getMaintenanceMode();

    await ctx.editMessageText(
      `🔧 *Maintenance Mode*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Current Status: ${current ? '🔴 *ON*' : '🟢 *OFF*'}\n\n` +
      `When ON: Only admins can use the bot\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{
              text:          current ? '🟢 Turn OFF' : '🔴 Turn ON',
              callback_data: 'admin_maintenance_toggle',
            }],
            [{ text: '🔙 Back', callback_data: 'admin_main' }],
          ],
        },
      }
    );
  }));

  bot.callbackQuery('admin_maintenance_toggle', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const current  = getMaintenanceMode();
    const newState = !current;
    setMaintenanceMode(newState);

    await ctx.editMessageText(
      `🔧 *Maintenance Mode*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Status: ${newState ? '🔴 *ON*' : '🟢 *OFF*'}\n` +
      (newState
        ? `_Users cannot access the bot now_`
        : `_Bot is now accessible to all users_`),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{
              text:          newState ? '🟢 Turn OFF' : '🔴 Turn ON',
              callback_data: 'admin_maintenance_toggle',
            }],
            [{ text: '🔙 Back', callback_data: 'admin_main' }],
          ],
        },
      }
    );
  }));

  // ════════════════════════════════════════════════════════
  // BOT PHOTO
  // ════════════════════════════════════════════════════════
  bot.callbackQuery('admin_photo', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = getAllSettings();

    await ctx.editMessageText(
      `🖼 *Bot Photo*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Current Photo: ${s.photoFileId ? '✅ *Set*' : '❌ *Not set*'}\n\n` +
      `Upload a photo to show with all bot messages\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbPhotoMenu(!!s.photoFileId),
      }
    );
  }));

  bot.callbackQuery('admin_photo_upload', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx.from.id, 'admin_upload_photo');
    await ctx.editMessageText(
      `📤 *Upload Bot Photo*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Send a photo now\\.\n` +
      `It will be shown with all bot messages\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('admin_photo'),
      }
    );
  }));

  bot.callbackQuery('admin_photo_preview', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    const photoId = getPhotoFileId();

    if (!photoId) {
      return ctx.reply(
        `❌ *No photo set*\nUpload a photo first\\.`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_photo'),
        }
      );
    }

    await ctx.replyWithPhoto(photoId, {
      caption:      `🖼 *Current Bot Photo*\n_This photo appears with all bot messages_`,
      parse_mode:   'MarkdownV2',
      reply_markup: kbBack('admin_photo'),
    });
  }));

  bot.callbackQuery('admin_photo_remove', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    clearPhoto();

    await ctx.editMessageText(
      `✅ *Photo Removed*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Bot will now send text\\-only messages\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('admin_photo'),
      }
    );
  }));

  // ════════════════════════════════════════════════════════
  // BOT SETTINGS
  // ════════════════════════════════════════════════════════
  bot.callbackQuery('admin_settings', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      fmtBotSettings(getAllSettings()),
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbSettingsMenu(),
      }
    );
  }));

  bot.callbackQuery('admin_set_botname', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx.from.id, 'admin_setting_botname');
    await ctx.editMessageText(
      `📛 *Change Bot Name*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Enter the new bot name:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('admin_settings'),
      }
    );
  }));

  bot.callbackQuery('admin_set_title', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx.from.id, 'admin_setting_title');
    await ctx.editMessageText(
      `📝 *Change Welcome Title*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Enter the new welcome title:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('admin_settings'),
      }
    );
  }));

  bot.callbackQuery('admin_set_subtitle', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx.from.id, 'admin_setting_subtitle');
    await ctx.editMessageText(
      `💬 *Change Welcome Subtitle*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Enter the new subtitle:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('admin_settings'),
      }
    );
  }));

  bot.callbackQuery('admin_set_footer', adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx.from.id, 'admin_setting_footer');
    await ctx.editMessageText(
      `🔗 *Change Footer Text*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Enter the new footer text:`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbCancel('admin_settings'),
      }
    );
  }));

  // ════════════════════════════════════════════════════════
  // PHOTO UPLOAD HANDLER
  // ════════════════════════════════════════════════════════
  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from?.id;
    if (!isAdmin(userId)) return;

    const { step } = getStep(userId);
    if (step !== 'admin_upload_photo') return;

    clearStep(userId);

    // Get best quality photo
    const photos = ctx.message.photo;
    const best   = photos[photos.length - 1];
    setPhotoFileId(best.file_id);

    await ctx.reply(
      `✅ *Photo Updated\\!*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `Photo will now appear with all bot messages\\.`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: kbBack('admin_photo'),
      }
    );
  });

  // ════════════════════════════════════════════════════════
  // TEXT STEP HANDLER
  // ════════════════════════════════════════════════════════
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!isAdmin(userId)) return next();

    const { step, data } = getStep(userId);
    const text = ctx.message.text.trim();

    if (!step) return next();

    // ── Find User ─────────────────────────────────────────────────────────────
    if (step === 'admin_find_user') {
      clearStep(userId);
      const targetId = parseInt(text, 10);

      if (Number.isNaN(targetId)) {
        return ctx.reply(
          `❌ *Invalid ID*\nPlease enter a valid Telegram user ID\\.`,
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('admin_users'),
          }
        );
      }

      const user = getUser(targetId);
      if (!user) {
        return ctx.reply(
          `❌ *User Not Found*\n` +
          `\`${esc(targetId)}\` has never used the bot\\.`,
          {
            parse_mode:   'MarkdownV2',
            reply_markup: kbBack('admin_users'),
          }
        );
      }

      return ctx.reply(buildUserCard(user), {
        parse_mode:   'MarkdownV2',
        reply_markup: kbUserActions(targetId),
      });
    }

    // ── Ban Reason ────────────────────────────────────────────────────────────
    if (step === 'admin_ban_reason') {
      clearStep(userId);
      const { targetId } = data;

      banUser(targetId, text, userId);

      await notifyUser(
        bot,
        targetId,
        `🚫 *You Have Been Banned*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `*Reason:* _${esc(text)}_`
      );

      return ctx.reply(
        `✅ User \`${esc(targetId)}\` banned\\.\n*Reason:* _${esc(text)}_`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_users'),
        }
      );
    }

    // ── Send Message To User ──────────────────────────────────────────────────
    if (step === 'admin_send_user_msg') {
      clearStep(userId);
      const { targetId } = data;

      const sent = await notifyUser(
        bot,
        targetId,
        `📩 *Message from Admin*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `${esc(text)}`
      );

      return ctx.reply(
        sent
          ? `✅ *Message sent to \`${esc(targetId)}\`*`
          : `❌ *Failed to send — User may have blocked the bot*`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_users'),
        }
      );
    }

    // ── Admin Reply To Request ────────────────────────────────────────────────
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

      const sent = await notifyUser(
        bot,
        req.userId,
        `📩 *Admin Reply*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `_Re: Request \\#${esc(requestId)}_\n\n` +
        `${esc(text)}`,
        {
          inline_keyboard: [
            [{ text: '📨 Request Access', callback_data: 'request_access'        }],
            [{ text: '💬 Message Admin',  callback_data: 'request_message_admin' }],
          ],
        }
      );

      return ctx.reply(
        sent
          ? `✅ *Reply sent to user successfully*`
          : `❌ *Failed to send — User may have blocked the bot*`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    // ── Broadcast ─────────────────────────────────────────────────────────────
    if (step === 'admin_broadcast_msg') {
      clearStep(userId);
      const allUsers = getAllUsers();
      const total    = allUsers.length;

      const statusMsg = await ctx.reply(
        `📢 *Broadcasting to ${esc(total)} users\\.\\.\\.*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `⏳ Please wait\\.`,
        { parse_mode: 'MarkdownV2' }
      );

      let sent   = 0;
      let failed = 0;

      for (const user of allUsers) {
        if (user.id === userId) continue;
        try {
          await bot.api.sendMessage(
            user.id,
            `📢 *Announcement*\n` +
            `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
            `${esc(text)}`,
            { parse_mode: 'MarkdownV2' }
          );
          sent++;
        } catch {
          failed++;
        }
        // Avoid Telegram flood limits
        await new Promise(r => setTimeout(r, 50));
      }

      await bot.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        fmtBroadcastComplete(sent, failed, total),
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_main'),
        }
      ).catch(() => {});

      return;
    }

    // ── Bot Settings Steps ────────────────────────────────────────────────────
    if (step === 'admin_setting_botname') {
      clearStep(userId);
      setBotName(text);
      return ctx.reply(
        `✅ *Bot name updated\\!*\n📛 New name: *${esc(text)}*`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_settings'),
        }
      );
    }

    if (step === 'admin_setting_title') {
      clearStep(userId);
      setWelcomeTitle(text);
      return ctx.reply(
        `✅ *Welcome title updated\\!*\n📝 New title: *${esc(text)}*`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_settings'),
        }
      );
    }

    if (step === 'admin_setting_subtitle') {
      clearStep(userId);
      setWelcomeSubtitle(text);
      return ctx.reply(
        `✅ *Subtitle updated\\!*\n💬 New subtitle: *${esc(text)}*`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_settings'),
        }
      );
    }

    if (step === 'admin_setting_footer') {
      clearStep(userId);
      setFooter(text);
      return ctx.reply(
        `✅ *Footer updated\\!*\n🔗 New footer: *${esc(text)}*`,
        {
          parse_mode:   'MarkdownV2',
          reply_markup: kbBack('admin_settings'),
        }
      );
    }

    return next();
  });
}