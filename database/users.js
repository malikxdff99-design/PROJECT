/**
 * database/users.js
 * In-memory user database with level management
 * Levels: banned | pending | premium | admin
 */

import { USER_LEVELS, config } from '../config.js';

// â”€â”€ Storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const users = new Map();

// â”€â”€ User Object Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function createUser(userId, userData = {}) {
  return {
    id:           userId,
    firstName:    userData.firstName    || 'Unknown',
    lastName:     userData.lastName     || '',
    username:     userData.username     || null,
    level:        userData.level        || USER_LEVELS.PENDING,
    joinedAt:     userData.joinedAt     || new Date().toISOString(),
    lastActiveAt: userData.lastActiveAt || new Date().toISOString(),
    banReason:    userData.banReason    || null,
    approvedBy:   userData.approvedBy   || null,
    approvedAt:   userData.approvedAt   || null,
    requestCount: userData.requestCount || 0,
  };
}

// â”€â”€ Core Functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Get user by ID â€” returns null if not found
 */
export function getUser(userId) {
  return users.get(userId) || null;
}

/**
 * Get or create a user record
 * Admins are always set to ADMIN level
 */
export function getOrCreateUser(userId, telegramUser = {}) {
  // Always treat config admins as ADMIN level
  const isAdmin = config.bot.adminIds.includes(userId);

  if (!users.has(userId)) {
    const newUser = createUser(userId, {
      firstName:    telegramUser.first_name  || 'Unknown',
      lastName:     telegramUser.last_name   || '',
      username:     telegramUser.username    || null,
      level:        isAdmin
                      ? USER_LEVELS.ADMIN
                      : USER_LEVELS.PENDING,
    });
    users.set(userId, newUser);
    return newUser;
  }

  const user = users.get(userId);

  // Always enforce admin level for config admins
  if (isAdmin && user.level !== USER_LEVELS.ADMIN) {
    user.level = USER_LEVELS.ADMIN;
  }

  // Update telegram info & last active
  user.firstName    = telegramUser.first_name || user.firstName;
  user.lastName     = telegramUser.last_name  || user.lastName;
  user.username     = telegramUser.username   || user.username;
  user.lastActiveAt = new Date().toISOString();

  return user;
}

/**
 * Set user level
 */
export function setUserLevel(userId, level, adminId = null) {
  const user = users.get(userId);
  if (!user) return false;

  user.level = level;

  if (level === USER_LEVELS.PREMIUM) {
    user.approvedBy = adminId;
    user.approvedAt = new Date().toISOString();
    user.banReason  = null;
  }

  if (level === USER_LEVELS.BANNED) {
    user.approvedBy = null;
    user.approvedAt = null;
  }

  return true;
}

/**
 * Ban a user with optional reason
 */
export function banUser(userId, reason = 'No reason provided', adminId = null) {
  const user = users.get(userId);
  if (!user) return false;

  // Cannot ban admins
  if (user.level === USER_LEVELS.ADMIN) return false;

  user.level     = USER_LEVELS.BANNED;
  user.banReason = reason;
  user.approvedBy = adminId;

  return true;
}

/**
 * Unban a user â€” sets back to pending
 */
export function unbanUser(userId) {
  const user = users.get(userId);
  if (!user) return false;

  user.level     = USER_LEVELS.PENDING;
  user.banReason = null;

  return true;
}

/**
 * Approve a user â€” gives premium access
 */
export function approveUser(userId, adminId = null) {
  return setUserLevel(userId, USER_LEVELS.PREMIUM, adminId);
}

/**
 * Revoke user access â€” sets back to pending
 */
export function revokeUser(userId) {
  const user = users.get(userId);
  if (!user) return false;
  if (user.level === USER_LEVELS.ADMIN) return false;

  user.level      = USER_LEVELS.PENDING;
  user.approvedBy = null;
  user.approvedAt = null;

  return true;
}

// â”€â”€ Level Checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function isAdmin(userId) {
  if (config.bot.adminIds.includes(userId)) return true;
  const user = users.get(userId);
  return user?.level === USER_LEVELS.ADMIN;
}

export function isPremium(userId) {
  if (isAdmin(userId)) return true;
  const user = users.get(userId);
  return user?.level === USER_LEVELS.PREMIUM;
}

export function isBanned(userId) {
  const user = users.get(userId);
  return user?.level === USER_LEVELS.BANNED;
}

export function isPending(userId) {
  const user = users.get(userId);
  return !user || user.level === USER_LEVELS.PENDING;
}

export function hasAccess(userId) {
  return isPremium(userId) || isAdmin(userId);
}

// â”€â”€ Stats & Listings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getAllUsers() {
  return [...users.values()];
}

export function getUsersByLevel(level) {
  return [...users.values()].filter(u => u.level === level);
}

export function getStats() {
  const all     = [...users.values()];
  const now     = Date.now();
  const hour    = 60 * 60 * 1000;

  return {
    total:       all.length,
    admin:       all.filter(u => u.level === USER_LEVELS.ADMIN).length,
    premium:     all.filter(u => u.level === USER_LEVELS.PREMIUM).length,
    pending:     all.filter(u => u.level === USER_LEVELS.PENDING).length,
    banned:      all.filter(u => u.level === USER_LEVELS.BANNED).length,
    activeHour:  all.filter(u =>
                   now - new Date(u.lastActiveAt).getTime() < hour
                 ).length,
  };
}

// â”€â”€ Display Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getUserDisplayName(user) {
  if (!user) return 'Unknown';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return user.username ? `${name} (@${user.username})` : name;
}

export function getLevelBadge(level) {
  const badges = {
    [USER_LEVELS.ADMIN]:   'ðŸ‘‘ Admin',
    [USER_LEVELS.PREMIUM]: 'â­ Premium',
    [USER_LEVELS.PENDING]: 'â³ Pending',
    [USER_LEVELS.BANNED]:  'ðŸš« Banned',
  };
  return badges[level] || 'â“ Unknown';
}
