import axios from 'axios';
import https from 'https';
import { generateLocalId, buildWheelsArray, buildIntegersArray } from '../utils/helpers.js';
import { CAR_ID_MAPPING, SELLING_CAR_TEMPLATE } from '../utils/constants.js';

const DEFAULT_TIMEOUT_MS = 15000;
const TRANSFER_TIMEOUT_MS = 45000;
const MAX_CONTENT_BYTES = 50 * 1024 * 1024;
const MAX_CUSTOM_DATA_BYTES = 70 * 1024;
const WRAPPER_REFRESH_DELAY_MS = 100;

const UA_DALVIK = 'Dalvik/2.1.0 (Linux; U; Android 12; SM-A025F Build/SP1A.210812.016)';
const UA_UNITY = 'UnityPlayer/2022.3.62f2 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)';
const UA_UNITY_OLD = 'UnityPlayer/2020.3.48f1 (UnityWebRequest/1.0, libcurl/7.84.0-DEV)';
const UA_OKHTTP = 'okhttp/3.12.13';

const FIREBASE_ERRORS = {
  EMAIL_NOT_FOUND: 'Email not found',
  INVALID_PASSWORD: 'Invalid password',
  USER_DISABLED: 'Account disabled',
  EMAIL_EXISTS: 'Email already in use',
  OPERATION_NOT_ALLOWED: 'Operation not allowed',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts, try again later',
  INVALID_EMAIL: 'Invalid email format',
  WEAK_PASSWORD: 'Password is too weak',
  INVALID_ID_TOKEN: 'Invalid session token',
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Please login again',
  TOKEN_EXPIRED: 'Session expired, please login again',
  USER_NOT_FOUND: 'User not found',
};

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 200,
  maxFreeSockets: 50,
  timeout: DEFAULT_TIMEOUT_MS,
  scheduling: 'fifo',
  keepAliveMsecs: 30000,
});

function resolveCarId(car, fallback = null) {
  return car?.CarID ?? car?.carID ?? car?.id ?? car?.ID ?? fallback;
}

function safeJsonParse(value, fallback = {}) {
  if (typeof value !== 'string') return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toCarArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function makeAbortSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function validateCustomDataSize(data) {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const bytes = Buffer.byteLength(jsonString, 'utf8');
  return bytes <= MAX_CUSTOM_DATA_BYTES;
}

function extractCarIdsFromPlayerData(playerData) {
  const carIds = new Set();
  
  if (playerData.carIDnStatus?.carGeneratedIDs) {
    playerData.carIDnStatus.carGeneratedIDs.forEach(id => {
      if (id && id.trim() !== '') carIds.add(id);
    });
  }
  
  return carIds;
}

function mergeCarData(sourceCarData, targetCarData) {
  const sourceCarIds = extractCarIdsFromPlayerData(sourceCarData);
  const targetCarIds = extractCarIdsFromPlayerData(targetCarData);
  
  const missingCarIds = [...sourceCarIds].filter(id => !targetCarIds.has(id));
  
  if (missingCarIds.length === 0) {
    return { merged: targetCarData, added: [] };
  }
  
  const merged = JSON.parse(JSON.stringify(targetCarData));
  
  if (!merged.carIDnStatus) {
    merged.carIDnStatus = { carGeneratedIDs: [], carStatus: [] };
  }
  
  missingCarIds.forEach(carId => {
    const sourceIndex = sourceCarData.carIDnStatus.carGeneratedIDs.indexOf(carId);
    const targetIndex = merged.carIDnStatus.carGeneratedIDs.length;
    
    merged.carIDnStatus.carGeneratedIDs[targetIndex] = carId;
    
    if (sourceCarData.carIDnStatus.carStatus && sourceCarData.carIDnStatus.carStatus[sourceIndex] !== undefined) {
      merged.carIDnStatus.carStatus[targetIndex] = sourceCarData.carIDnStatus.carStatus[sourceIndex];
    } else {
      merged.carIDnStatus.carStatus[targetIndex] = 1;
    }
  });
  
  return { merged, added: missingCarIds };
}

function normalizeFloatsArray(floats, minLength = 48) {
  const normalized = Array.isArray(floats) ? [...floats] : [];
  while (normalized.length < minLength) {
    normalized.push(0.0);
  }
  return normalized.map(v => typeof v === 'number' ? v : 0.0);
}

function formatCarDisplay(carId, carName) {
  return `ID: ${carId} | ${carName}`;
}

class CPMApiService {
  constructor() {
    this.firebaseAuthUrl = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty';
    this.maxMoney = 50000000;
    this.maxCoin = 500000;

    this.usVhost = process.env.US_VHOST || 'us-central1-cp-multiplayer.cloudfunctions.net';
    this.euVhost = process.env.EU_VHOST || 'europe-west1-cp-multiplayer.cloudfunctions.net';
    this.firebaseApiKey = process.env.FIREBASE_API_KEY || 'AIzaSyBW1ZbMiUeDZHYUO2bY8Bfnf5rRgrQGPTM';
    this.fitToken = process.env.FIT_TOKEN || '';

    this.carsCache = new Map();
    this.cacheTimeout = 30000;

    this.http = axios.create({
      httpsAgent,
      timeout: DEFAULT_TIMEOUT_MS,
      maxContentLength: MAX_CONTENT_BYTES,
      maxBodyLength: MAX_CONTENT_BYTES,
      validateStatus: () => true,
    });
  }

  euUrl(path) {
    return `https://${this.euVhost}/${path}`;
  }

  usUrl(path) {
    return `https://${this.usVhost}/${path}`;
  }

  fbUrl(path) {
    return `${this.firebaseAuthUrl}/${path}?key=${this.firebaseApiKey}`;
  }

  headersFirebase() {
    return { 'User-Agent': UA_DALVIK, 'Content-Type': 'application/json' };
  }

  headersUnity(token) {
    return {
      'User-Agent': UA_UNITY,
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Firebase-Lite-Sdk': '1',
      'X-Unity-Version': '2022.3.62f2',
      'Authorization': `Bearer ${token}`,
    };
  }

  headersSave(token) {
    return {
      'User-Agent': UA_UNITY_OLD,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'firebase-instance-id-token': this.fitToken,
    };
  }

  headersRating(token) {
    return {
      'User-Agent': UA_OKHTTP,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async streamPost(url, body, headers, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const { signal, clear } = makeAbortSignal(timeoutMs);
    let streamRef = null;

    try {
      const response = await this.http.post(url, body, {
        headers,
        responseType: 'stream',
        signal,
      });

      streamRef = response.data;

      return await new Promise((resolve, reject) => {
        const chunks = [];

        const onData = (chunk) => chunks.push(chunk);

        const onEnd = () => {
          cleanup();
          try {
            const text = Buffer.concat(chunks).toString('utf-8');
            resolve({ status: response.status, data: JSON.parse(text) });
          } catch {
            reject(new Error('Failed to parse stream response'));
          }
        };

        const onError = (err) => {
          cleanup();
          reject(err);
        };

        const cleanup = () => {
          streamRef.removeListener('data', onData);
          streamRef.removeListener('end', onEnd);
          streamRef.removeListener('error', onError);
          if (!streamRef.destroyed) streamRef.destroy();
        };

        streamRef.on('data', onData);
        streamRef.on('end', onEnd);
        streamRef.on('error', onError);
      });
    } catch (err) {
      if (streamRef && !streamRef.destroyed) streamRef.destroy();
      throw err;
    } finally {
      clear();
    }
  }

  async post(url, body, headers, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const { signal, clear } = makeAbortSignal(timeoutMs);
    try {
      return await this.http.post(url, body, { headers, signal, timeout: timeoutMs });
    } finally {
      clear();
    }
  }

  firebaseError(code) {
    return FIREBASE_ERRORS[code] || code || 'Unknown error occurred';
  }

  axiosError(err, fallback) {
    if (err.response) {
      const { status, data } = err.response;
      if (status === 400) return data?.error?.message || 'Bad request';
      if (status === 401) return 'Unauthorized';
      if (status === 403) return 'Forbidden';
      if (status === 404) return 'Not found';
      if (status === 429) return 'Rate limited, slow down';
      if (status >= 500) return 'Server error';
      return data?.error?.message || `${fallback} (${status})`;
    }
    if (err.name === 'AbortError' || err.code === 'ECONNABORTED') return 'Request timed out';
    if (err.request) return 'Network unreachable';
    return `${fallback}: ${err.message}`;
  }

  ok(extra = {}) {
    return { success: true, ...extra };
  }

  fail(message) {
    return { success: false, message };
  }

  isValidEmail(v) {
    return typeof v === 'string' && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
  }

  isValidPassword(v) {
    return typeof v === 'string' && v.length >= 6 && v.length <= 128;
  }

  isValidToken(v) {
    return typeof v === 'string' && v.length >= 10;
  }

  isValidAmount(v, max) {
    return Number.isFinite(v) && v >= 0 && v <= max;
  }

  isValidCount(v) {
    return Number.isInteger(v) && v >= 1 && v <= 100;
  }

  isValidName(v) {
    return typeof v === 'string' && v.trim().length >= 1 && v.length <= 300;
  }

  isValidPlayerId(v) {
    return typeof v === 'string' && v.trim().length >= 1 && v.length <= 1000;
  }

  isValidNonNegativeInt(v) {
    return Number.isInteger(v) && v >= 0;
  }

  isValidNumber(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
  }

  isValidCarId(v) {
    if (v === 'ALL' || v === 'all') return true;
    if (v == null) return false;
    const num = parseInt(v, 10);
    return !Number.isNaN(num) && num >= 0;
  }

  requireToken(token) {
    if (!this.isValidToken(token)) return this.fail('Invalid authentication token');
    return null;
  }

  requireTokenPair(a, b) {
    if (!this.isValidToken(a) || !this.isValidToken(b)) return this.fail('Invalid authentication tokens');
    return null;
  }

  requireValidCarId(carId) {
    if (!this.isValidCarId(carId)) return this.fail('Invalid car ID');
    return null;
  }

  makeSendProgress(onProgress) {
    return (type, data = {}) => {
      if (typeof onProgress !== 'function') return;
      try {
        onProgress({ type, ...data, timestamp: new Date().toISOString() });
      } catch {}
    };
  }

  getCarName(carId) {
    if (carId == null || carId === '') return 'Unknown Car';
    const id = parseInt(carId, 10);
    if (Number.isNaN(id)) return `Car #${carId}`;
    const entry = CAR_ID_MAPPING[id];
    return entry ? `${entry.brand} ${entry.model}` : `Car #${id}`;
  }

  buildMaleEquipments() {
    return {
      Gender: 1,
      bag: Array.from({ length: 7 }, (_, i) => i),
      beard: Array.from({ length: 15 }, (_, i) => i + 6),
      face: [0, 1, 2],
      glasses: Array.from({ length: 12 }, (_, i) => i),
      gloves: Array.from({ length: 6 }, (_, i) => i),
      hair: Array.from({ length: 19 }, (_, i) => i + 1),
      mask: Array.from({ length: 6 }, (_, i) => i + 3),
      cap: Array.from({ length: 86 }, (_, i) => i + 3),
      pants: Array.from({ length: 33 }, (_, i) => i),
      shoes: Array.from({ length: 32 }, (_, i) => i),
      top: Array.from({ length: 123 }, (_, i) => i),
      SelectedEquipments: [-1, 0, 19, 88, -1, 122, -1, 5, 32, 31, 11],
    };
  }

  buildFemaleEquipments() {
    return {
      Gender: 1,
      bag: Array.from({ length: 7 }, (_, i) => i),
      beard: [],
      cap: Array.from({ length: 63 }, (_, i) => i + 3),
      face: [0],
      glasses: Array.from({ length: 12 }, (_, i) => i),
      gloves: [1],
      hair: [0, 7, 8, 9, 10],
      mask: Array.from({ length: 5 }, (_, i) => i + 3),
      pants: Array.from({ length: 16 }, (_, i) => i),
      shoes: Array.from({ length: 13 }, (_, i) => i + 3),
      top: Array.from({ length: 75 }, (_, i) => i + 5),
      SelectedEquipments: [-1, 0, -1, 65, -1, -1, -1, 6, 15, 15, 9],
    };
  }

  buildFullAccountData(localId = null) {
    const floats = Array(54).fill(0);
    
    floats[0] = 142;
    floats[1] = 248;
    floats[3] = 1;
    floats[8] = 2147483647;
    floats[27] = 1;
    floats[28] = 1;
    floats[29] = 1;
    floats[30] = 1;
    floats[31] = 1;
    floats[32] = 1;
    floats[33] = 1;
    floats[34] = 1;

    return {
      localID: localId || generateLocalId(),
      Name: 'Player',
      allData: 'AFCB1B2A1DFDC063E4949A07E068A6A42950B58B',
      boughtPoliceLights: [0, 9, 1, 1, 4, 0, 2, 2, 0, 3, 2, 0, 4, 1, 0],
      boughtPoliceSirens: [1],
      LevelsDoneTime: [0, ...Array(42).fill(1), 120, ...Array(66).fill(1)],
      favouriteWheels: [],
      favouriteEmojis: [],
      favouriteVinyls: [],
      platesData: {
        allPlates: Array.from({ length: 6 }, (_, i) => ({
          plateId: i + 1,
          frontCarId: -1,
          rearCarId: -1,
          vinyls: [],
        })),
      },
      flags: {},
      animations: Array.from({ length: 44 }, (_, i) => i),
      emojiPacks: [],
      wheels: buildWheelsArray(),
      FriendsID: [],
      money: this.maxMoney,
      boughtFsos: [-1],
      coin: this.maxCoin,
      integers: buildIntegersArray(),
      personEquipmentsFemale: this.buildFemaleEquipments(),
      personEquipmentsMale: this.buildMaleEquipments(),
      floats: floats,
      fcar: [0],
    };
  }

  async saveAccountData(token, accountData) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!accountData || typeof accountData !== 'object') return this.fail('Invalid account data');

    try {
      const res = await this.post(
        this.euUrl('SavePlayerRecordsIOS1'),
        { data: JSON.stringify(accountData) },
        this.headersSave(token)
      );

      if (res.status !== 200) return this.fail(`Save failed (${res.status})`);

      const inner = safeJsonParse(res.data?.result);
      return inner.result === 1
        ? this.ok({ message: 'Account data saved successfully' })
        : this.fail(`Save failed: ${JSON.stringify(res.data)}`);
    } catch (e) {
      return this.fail(this.axiosError(e, 'Save failed'));
    }
  }

  async savePlayerData(token, data) {
    return this.saveAccountData(token, data);
  }

  async saveFloats(token, floatMap) {
    return this.savePlayerData(token, { floats: floatMap });
  }

  async saveIntegers(token, intMap) {
    return this.savePlayerData(token, { integers: intMap });
  }

  buildTransferPayload(carData, wrapper) {
    const src = structuredClone(carData);
    const carId = parseInt(resolveCarId(src, 0), 10);
    src.CarID = carId;
    src.Vynils ??= { allVynils: [], CarID: carId };
    src.Vynils.CarID = carId;

    return {
      ownerID: wrapper.full.ownerID || '',
      ownerName: wrapper.full.ownerName || '',
      description: wrapper.full.description || '',
      CarID: parseInt(wrapper.carId, 10),
      carGeneratedID: wrapper.full.carGeneratedID || '',
      ownerAccountID: wrapper.owner,
      oneCar: src,
      vynilOneCar: src.Vynils,
      loadedLocalCar: { instanceID: -226578 },
      price: wrapper.price,
      SellingCar: SELLING_CAR_TEMPLATE,
      willReject: false,
      dislike: 1,
      like: 0,
      liked: false,
      disliked: false,
      mode: 1,
    };
  }

  async firebasePost(endpoint, body) {
    const { signal, clear } = makeAbortSignal(DEFAULT_TIMEOUT_MS);
    try {
      return await this.http.post(this.fbUrl(endpoint), body, {
        headers: this.headersFirebase(),
        signal,
      });
    } finally {
      clear();
    }
  }

  async login(email, password) {
    if (!this.isValidEmail(email)) return this.fail('Invalid email format');
    if (!this.isValidPassword(password)) return this.fail('Password must be 6–128 characters');

    try {
      const res = await this.firebasePost('verifyPassword', {
        email,
        password,
        returnSecureToken: true,
        clientType: 'CLIENT_TYPE_ANDROID',
      });

      if (res.data?.idToken) {
        return this.ok({ message: 'Login successful', token: res.data.idToken, email: res.data.email });
      }

      return this.fail(this.firebaseError(res.data?.error?.message));
    } catch (e) {
      return this.fail(this.axiosError(e, 'Login failed'));
    }
  }

  async register(email, password) {
    if (!this.isValidEmail(email)) return this.fail('Invalid email format');
    if (!this.isValidPassword(password)) return this.fail('Password must be 6–128 characters');

    try {
      const res = await this.firebasePost('signupNewUser', {
        email,
        password,
        clientType: 'CLIENT_TYPE_ANDROID',
      });

      if (res.data?.idToken) {
        return this.ok({ message: 'Registered successfully', token: res.data.idToken, email: res.data.email });
      }

      return this.fail(this.firebaseError(res.data?.error?.message));
    } catch (e) {
      return this.fail(this.axiosError(e, 'Registration failed'));
    }
  }

  async changePassword(token, newPassword) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidPassword(newPassword)) return this.fail('Password must be 6–128 characters');

    try {
      const res = await this.firebasePost('setAccountInfo', {
        idToken: token,
        password: newPassword,
        returnSecureToken: true,
      });

      if (res.status === 200 && res.data?.idToken) return this.ok({ message: 'Password changed' });
      return this.fail(this.firebaseError(res.data?.error?.message));
    } catch (e) {
      return this.fail(this.axiosError(e, 'Change password failed'));
    }
  }

  async changeEmail(token, newEmail) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidEmail(newEmail)) return this.fail('Invalid email format');

    try {
      const res = await this.firebasePost('setAccountInfo', {
        idToken: token,
        email: newEmail,
        returnSecureToken: true,
      });

      if (res.status === 200 && res.data?.idToken) return this.ok({ message: 'Email changed' });
      return this.fail(this.firebaseError(res.data?.error?.message));
    } catch (e) {
      return this.fail(this.axiosError(e, 'Change email failed'));
    }
  }

  async getAccountInfo(token) {
    const err = this.requireToken(token);
    if (err) return err;

    try {
      const res = await this.firebasePost('getAccountInfo', { idToken: token });
      if (res.status === 200 && res.data?.users) return this.ok({ data: res.data });
      return this.fail(this.firebaseError(res.data?.error?.message));
    } catch (e) {
      return this.fail(this.axiosError(e, 'Get account info failed'));
    }
  }

  async setMoney(token, money) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidAmount(money, this.maxMoney)) return this.fail(`Money must be 0–${this.maxMoney}`);
    return this.savePlayerData(token, { money: Math.min(money, this.maxMoney) });
  }

  async setCoins(token, coin) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidAmount(coin, this.maxCoin)) return this.fail(`Coins must be 0–${this.maxCoin}`);
    return this.savePlayerData(token, { coin: Math.min(coin, this.maxCoin) });
  }

  async setMoneyAndCoins(token, money, coin) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidAmount(money, this.maxMoney)) return this.fail(`Money must be 0–${this.maxMoney}`);
    if (!this.isValidAmount(coin, this.maxCoin)) return this.fail(`Coins must be 0–${this.maxCoin}`);
    return this.savePlayerData(token, {
      money: Math.min(money, this.maxMoney),
      coin: Math.min(coin, this.maxCoin),
    });
  }

  async setMaxMoneyAndCoins(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.savePlayerData(token, { money: this.maxMoney, coin: this.maxCoin });
  }

  async setPlayerName(token, name) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidName(name)) return this.fail('Name must be 1–300 characters');
    return this.savePlayerData(token, { Name: name.trim() });
  }

  async setPlayerId(token, playerId) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidPlayerId(playerId)) return this.fail('Invalid player ID');
    return this.savePlayerData(token, { localID: playerId.trim().toUpperCase() });
  }

  async setRaceWins(token, amount) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidNonNegativeInt(amount)) return this.fail('Amount must be a non-negative integer');
    return this.saveFloats(token, { 8: amount });
  }

  async setRaceLosses(token, amount) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidNonNegativeInt(amount)) return this.fail('Amount must be a non-negative integer');
    return this.saveFloats(token, { 9: amount });
  }

  async setRaceWinsAndLosses(token, wins, losses) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidNonNegativeInt(wins)) return this.fail('Wins must be a non-negative integer');
    if (!this.isValidNonNegativeInt(losses)) return this.fail('Losses must be a non-negative integer');
    return this.saveFloats(token, { 8: wins, 9: losses });
  }

  async unlockW16Engine(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.saveFloats(token, { 32: 1 });
  }

  async unlockAllHorns(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.saveFloats(token, { 27: 1, 28: 1, 29: 1, 30: 1, 31: 1 });
  }

  async disableVehicleDamage(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.saveFloats(token, { 34: 1 });
  }

  async enableUnlimitedFuel(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.saveFloats(token, { 3: 1 });
  }

  async unlockSmokeEffect(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.saveFloats(token, { 33: 1 });
  }

  async unlockAllGameplayPerks(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.saveFloats(token, { 3: 1, 27: 1, 28: 1, 29: 1, 30: 1, 31: 1, 32: 1, 33: 1, 34: 1 });
  }

  async unlockAllAnimations(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.savePlayerData(token, { animations: Array.from({ length: 44 }, (_, i) => i) });
  }

  async unlockAllWheels(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.savePlayerData(token, { integers: buildIntegersArray(), wheels: buildWheelsArray() });
  }

  async unlockAllHouses(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.saveIntegers(token, { 8: 1, 110: 1, 111: 1, 112: 1 });
  }

  async completeAllLevels(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.savePlayerData(token, {
      LevelsDoneTime: [0, ...Array(42).fill(1), 120, ...Array(66).fill(1)],
    });
  }

  async unlockMaleEquipment(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.savePlayerData(token, { personEquipmentsMale: this.buildMaleEquipments() });
  }

  async unlockFemaleEquipment(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.savePlayerData(token, { personEquipmentsFemale: this.buildFemaleEquipments() });
  }

  async unlockAllEquipment(token) {
    const err = this.requireToken(token);
    if (err) return err;
    return this.savePlayerData(token, {
      personEquipmentsMale: this.buildMaleEquipments(),
      personEquipmentsFemale: this.buildFemaleEquipments(),
    });
  }

  async setRank(token) {
    const err = this.requireToken(token);
    if (err) return err;

    const ratingData = {
      RatingData: {
        time: 10000000000000000000000,
        cars: 10000000000000000,
        car_fix: 10000000000000,
        car_collided: 1000000000000,
        car_exchange: 10000000000000,
        car_trade: 10000000000000,
        car_wash: 10000000000000,
        slicer_cut: 10000000000000,
        drift_max: 100000000000000,
        drift: 100000000000000,
        cargo: 100000,
        delivery: 100000,
        race_win: 300000000000000000000,
        taxi: 10000000000,
        levels: 10000990000,
        gifts: 1000000000,
        fuel: 10000000000,
        offroad: 10000000000,
        speed_banner: 1000000000,
        reactions: 100000090999009000,
        police: 1000000000,
        run: 1000000000,
        real_estate: 1000000000,
        t_distance: 10000000000,
        treasure: 10000000000,
        block_post: 10000000000,
        push_ups: 1000000000000,
        burnt_tire: 10000000000,
        passanger_distance: 100000000,
      },
    };

    try {
      const res = await this.post(
        this.usUrl('SetUserRating4'),
        { data: JSON.stringify(ratingData) },
        this.headersRating(token)
      );

      if (res.status === 200 && res.data?.result) {
        return this.ok({ message: 'Rank set successfully' });
      }
      return this.fail('Failed to set rank');
    } catch (e) {
      return this.fail(this.axiosError(e, 'Rank update failed'));
    }
  }

  async getRank(token) {
    const err = this.requireToken(token);
    if (err) return err;

    try {
      const accountInfoRes = await this.getAccountInfo(token);
      if (!accountInfoRes.success) {
        return this.fail('Failed to get account info');
      }

      const localId = accountInfoRes.data?.users?.[0]?.localId;
      if (!localId) {
        return this.fail('Could not retrieve local ID');
      }

      const res = await this.post(
        this.usUrl('GetUserRating'),
        { data: localId },
        this.headersRating(token)
      );

      if (res.status === 200 && res.data?.result) {
        const ratingData = safeJsonParse(res.data.result, {});
        return this.ok({ message: 'Rank retrieved successfully', data: ratingData });
      }
      return this.fail('Failed to get rank');
    } catch (e) {
      return this.fail(this.axiosError(e, 'Get rank failed'));
    }
  }

  async createFullAccount(token, customLocalId = null) {
    const err = this.requireToken(token);
    if (err) return err;
    
    if (customLocalId && !this.isValidPlayerId(customLocalId)) {
      return this.fail('Invalid custom local ID');
    }
    
    const accountData = this.buildFullAccountData(customLocalId);
    return this.saveAccountData(token, accountData);
  }

  async unlockEverything(token, customLocalId = null) {
    const err = this.requireToken(token);
    if (err) return err;

    if (customLocalId && !this.isValidPlayerId(customLocalId)) {
      return this.fail('Invalid custom local ID');
    }

    const accountResult = await this.createFullAccount(token, customLocalId);
    if (!accountResult.success) {
      return this.fail('Failed to create full account');
    }

    const rankResult = await this.setRank(token);
    if (!rankResult.success) {
      return this.fail('Account created but rank update failed');
    }

    return this.ok({ message: 'Account fully unlocked with max rank', localId: customLocalId });
  }

  async getAllCars(token, useCache = true) {
    const err = this.requireToken(token);
    if (err) return err;

    if (useCache) {
      const cached = this.carsCache.get(token);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return this.ok({ cars: cached.cars });
      }
    }

    try {
      const { status, data } = await this.streamPost(
        this.euUrl('TestGetAllCars'),
        { data: '' },
        this.headersUnity(token)
      );

      if (status !== 200) return this.fail(`Failed to fetch cars (${status})`);

      const raw = safeJsonParse(data?.result);
      const cars = toCarArray(raw)
        .filter((c) => c !== null && typeof c === 'object')
        .map((c) => {
          const id = resolveCarId(c);
          if (id == null) return null;
          return { ...c, CarID: id, displayName: this.getCarName(id) };
        })
        .filter(Boolean);

      this.carsCache.set(token, { cars, timestamp: Date.now() });

      return this.ok({ cars });
    } catch (e) {
      return this.fail(this.axiosError(e, 'Failed to fetch cars'));
    }
  }

  async getStoreListings(token, count = 10) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!this.isValidCount(count)) return this.fail('Count must be 1–100');

    try {
      const { status, data } = await this.streamPost(
        this.euUrl('WSGetCarListV3'),
        { data: count },
        this.headersUnity(token)
      );

      if (status !== 200) return this.fail('Failed to fetch listings');

      const raw = safeJsonParse(data?.result);
      const cars = toCarArray(raw).map((c) => ({
        ...c,
        displayName: this.getCarName(resolveCarId(c)),
      }));

      return this.ok({ cars });
    } catch (e) {
      return this.fail(this.axiosError(e, 'Failed to fetch listings'));
    }
  }

  async getVehicleDetails(token, ownerId, carId) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!ownerId || typeof ownerId !== 'string') return this.fail('Invalid owner ID');
    if (carId == null) return this.fail('Invalid car ID');

    try {
      const res = await this.post(
        this.euUrl('WSGetFullCarV3'),
        { data: [ownerId, String(carId), '20'] },
        this.headersUnity(token)
      );

      if (res.status === 200) return this.ok({ data: safeJsonParse(res.data?.result) });
      return this.fail('Failed to fetch vehicle details');
    } catch (e) {
      return this.fail(this.axiosError(e, 'Failed to fetch vehicle details'));
    }
  }

  async executeTransfer(token, carData, wrapper) {
    const err = this.requireToken(token);
    if (err) return err;
    if (!carData || typeof carData !== 'object') return this.fail('Invalid car data');
    if (!wrapper?.full) return this.fail('Invalid wrapper data');

    try {
      const payload = this.buildTransferPayload(carData, wrapper);
      const res = await this.post(
        this.euUrl('WSPurchaseCarV3'),
        { data: JSON.stringify(payload) },
        this.headersUnity(token),
        TRANSFER_TIMEOUT_MS
      );

      if (res.status === 200) {
        const r = res.data?.result;
        return { success: r === 1 || r === '1' };
      }

      return this.fail(`Transfer failed (${res.status})`);
    } catch (e) {
      return this.fail(this.axiosError(e, 'Transfer failed'));
    }
  }

  async getTransferWrapper(token) {
    if (!this.isValidToken(token)) return null;

    try {
      const store = await this.getStoreListings(token, 10);
      if (!store.success || !store.cars?.length) return null;

      const car = store.cars[0];
      const carId = String(resolveCarId(car));
      const owner = car.ownerAccountID || car.ownerID;

      const full = await this.getVehicleDetails(token, owner, carId);
      if (!full.success || !full.data) return null;

      return { full: full.data, carId, owner, price: car.price, displayName: car.displayName };
    } catch {
      return null;
    }
  }

  async transferSingleVehicle(tokenSource, tokenTarget, carId, onProgress = null) {
    const err = this.requireTokenPair(tokenSource, tokenTarget);
    if (err) {
      onProgress?.({ type: 'error', message: err.message, timestamp: new Date().toISOString() });
      return err;
    }

    const carIdErr = this.requireValidCarId(carId);
    if (carIdErr) {
      onProgress?.({ type: 'error', message: carIdErr.message, timestamp: new Date().toISOString() });
      return carIdErr;
    }

    if (carId === 'ALL' || carId === 'all') {
      const msg = 'Please use transferAllVehicles for transferring all vehicles';
      onProgress?.({ type: 'error', message: msg, timestamp: new Date().toISOString() });
      return this.fail(msg);
    }

    const send = this.makeSendProgress(onProgress);

    try {
      send('fetching', { message: 'Fetching vehicles from source...' });

      const carsRes = await this.getAllCars(tokenSource);
      if (!carsRes.success || !carsRes.cars?.length) {
        send('error', { message: 'No cars found in source account' });
        return this.fail('No cars found in source account');
      }

      const list = carsRes.cars;
      
      const targetCarId = String(carId);
      const car = list.find(c => {
        const id = resolveCarId(c);
        return id != null && String(id) === targetCarId;
      });

      if (!car) {
        send('error', { message: `Car with ID ${carId} not found in source account` });
        return this.fail(`Car with ID ${carId} not found`);
      }

      const foundCarId = resolveCarId(car);
      const carName = car.displayName || this.getCarName(foundCarId);

      send('found', { 
        carId: foundCarId, 
        carName, 
        message: `Found: ${formatCarDisplay(foundCarId, carName)}` 
      });
      send('wrapper', { message: 'Getting transfer wrapper...' });

      const wrapper = await this.getTransferWrapper(tokenTarget);
      if (!wrapper) {
        send('error', { message: 'Target account has no vehicle listed for sale' });
        return this.fail('Failed to get transfer wrapper');
      }

      send('wrapper_ready', { 
        wrapperCarId: wrapper.carId, 
        wrapperName: wrapper.displayName, 
        message: `Wrapper: ${formatCarDisplay(wrapper.carId, wrapper.displayName)}` 
      });
      send('transferring', { 
        carId: foundCarId, 
        carName, 
        message: `Transferring ${formatCarDisplay(foundCarId, carName)}...` 
      });

      const result = await this.executeTransfer(tokenTarget, car, wrapper);

      if (result.success) {
        send('success', { 
          carId: foundCarId, 
          carName, 
          wrapperCarId: wrapper.carId, 
          message: `SUCCESS: ${formatCarDisplay(foundCarId, carName)}` 
        });
        return this.ok({ 
          carId: foundCarId, 
          carName, 
          wrapperCarId: wrapper.carId, 
          message: `"${carName}" transferred` 
        });
      }

      send('failed', { 
        carId: foundCarId, 
        carName, 
        message: `FAILED: ${formatCarDisplay(foundCarId, carName)}` 
      });
      return this.fail('Transfer failed');
    } catch (e) {
      const msg = this.axiosError(e, 'Transfer failed');
      send('error', { message: msg });
      return this.fail(msg);
    }
  }

  async transferAllVehicles(tokenSource, tokenTarget, onProgress = null) {
    const err = this.requireTokenPair(tokenSource, tokenTarget);
    if (err) {
      onProgress?.({ type: 'error', message: err.message, timestamp: new Date().toISOString() });
      return err;
    }

    const send = this.makeSendProgress(onProgress);

    try {
      send('start', { message: 'Starting batch transfer...' });
      send('fetching', { message: 'Fetching source vehicles...' });

      const carsRes = await this.getAllCars(tokenSource);
      if (!carsRes.success || !carsRes.cars?.length) {
        send('error', { message: 'No cars in source account' });
        return this.fail('No cars found in source account');
      }

      const list = carsRes.cars;
      const stats = { success: 0, failed: 0, total: list.length, cars: [] };

      send('vehicles_fetched', { 
        total: list.length, 
        message: `Found ${list.length} vehicles` 
      });

      list.forEach((car) => {
        const id = resolveCarId(car);
        const name = car.displayName || this.getCarName(id);
        send('vehicle_list', { 
          id, 
          name, 
          display: formatCarDisplay(id, name) 
        });
      });

      send('wrapper', { message: 'Getting initial transfer wrapper...' });

      let wrapper = await this.getTransferWrapper(tokenTarget);
      if (!wrapper) {
        send('error', { message: 'Target has no vehicle listed. Cannot start transfer.' });
        return this.fail('Failed to get initial transfer wrapper');
      }

      send('wrapper_ready', { 
        wrapperCarId: wrapper.carId, 
        wrapperName: wrapper.displayName, 
        message: `Wrapper ready: ${formatCarDisplay(wrapper.carId, wrapper.displayName)}` 
      });
      send('transfer_start', { message: `Transferring ${list.length} vehicles...` });

      for (let i = 0; i < list.length; i++) {
        const car = list[i];
        const carId = resolveCarId(car, i);
        const carName = car.displayName || this.getCarName(carId);

        if (!wrapper) {
          send('wrapper_refresh', { message: `Refreshing wrapper [${i + 1}/${list.length}]...` });
          wrapper = await this.getTransferWrapper(tokenTarget);

          if (!wrapper) {
            send('error', { message: 'Lost wrapper. Stopping transfer.' });
            break;
          }

          send('wrapper_ready', { 
            wrapperCarId: wrapper.carId, 
            wrapperName: wrapper.displayName, 
            message: `New wrapper: ${formatCarDisplay(wrapper.carId, wrapper.displayName)}` 
          });
        }

        send('transferring', { 
          current: i + 1, 
          total: list.length, 
          carId, 
          carName, 
          message: `[${i + 1}/${list.length}] ${formatCarDisplay(carId, carName)}` 
        });

        const result = await this.executeTransfer(tokenTarget, car, wrapper);
        const succeeded = result.success;

        stats.cars.push({ carId, carName, success: succeeded });
        succeeded ? stats.success++ : stats.failed++;

        const progressStats = { success: stats.success, failed: stats.failed, total: stats.total };

        send(succeeded ? 'success' : 'failed', {
          current: i + 1,
          total: list.length,
          carId,
          carName,
          success: succeeded,
          results: progressStats,
          message: `[${i + 1}/${list.length}] ${succeeded ? 'OK' : 'FAIL'}: ${formatCarDisplay(carId, carName)}`,
        });

        wrapper = null;

        await new Promise((r) => setTimeout(r, WRAPPER_REFRESH_DELAY_MS));
      }

      send('complete', {
        results: stats,
        message: `Done: ${stats.success} ok, ${stats.failed} failed, ${stats.total} total`,
      });

      return this.ok({ results: stats });
    } catch (e) {
      const msg = this.axiosError(e, 'Batch transfer failed');
      send('error', { message: msg });
      return this.fail(msg);
    }
  }

  async transferMissingVehicles(tokenSource, tokenTarget, onProgress = null) {
    const err = this.requireTokenPair(tokenSource, tokenTarget);
    if (err) {
      onProgress?.({ type: 'error', message: err.message, timestamp: new Date().toISOString() });
      return err;
    }

    const send = this.makeSendProgress(onProgress);

    try {
      send('start', { message: 'Starting missing vehicles transfer...' });
      send('fetching_source', { message: 'Fetching source vehicles...' });

      const sourceCarsRes = await this.getAllCars(tokenSource);
      if (!sourceCarsRes.success || !sourceCarsRes.cars?.length) {
        send('error', { message: 'No cars found in source account' });
        return this.fail('No cars found in source account');
      }

      send('fetching_target', { message: 'Fetching target vehicles...' });

      const targetCarsRes = await this.getAllCars(tokenTarget);
      if (!targetCarsRes.success) {
        send('error', { message: 'Failed to fetch target account vehicles' });
        return this.fail('Failed to fetch target account vehicles');
      }

      const sourceCars = sourceCarsRes.cars;
      const targetCars = targetCarsRes.cars || [];

      const targetCarIds = new Set(
        targetCars.map(car => resolveCarId(car)).filter(id => id != null)
      );

      const missingCars = sourceCars.filter(car => {
        const carId = resolveCarId(car);
        return carId != null && !targetCarIds.has(carId);
      });

      if (missingCars.length === 0) {
        send('complete', { message: 'No missing vehicles found to transfer' });
        return this.ok({ 
          message: 'No missing vehicles found', 
          results: { success: 0, failed: 0, total: 0, cars: [] } 
        });
      }

      send('missing_found', { 
        total: missingCars.length, 
        message: `Found ${missingCars.length} missing vehicles to transfer` 
      });

      missingCars.forEach((car) => {
        const id = resolveCarId(car);
        const name = car.displayName || this.getCarName(id);
        send('vehicle_list', { 
          id, 
          name, 
          display: formatCarDisplay(id, name) 
        });
      });

      const stats = { success: 0, failed: 0, total: missingCars.length, cars: [] };

      send('wrapper', { message: 'Getting initial transfer wrapper...' });

      let wrapper = await this.getTransferWrapper(tokenTarget);
      if (!wrapper) {
        send('error', { message: 'Target has no vehicle listed. Cannot start transfer.' });
        return this.fail('Failed to get initial transfer wrapper');
      }

      send('wrapper_ready', { 
        wrapperCarId: wrapper.carId, 
        wrapperName: wrapper.displayName, 
        message: `Wrapper ready: ${formatCarDisplay(wrapper.carId, wrapper.displayName)}` 
      });

      send('transfer_start', { message: `Transferring ${missingCars.length} missing vehicles...` });

      for (let i = 0; i < missingCars.length; i++) {
        const car = missingCars[i];
        const carId = resolveCarId(car, i);
        const carName = car.displayName || this.getCarName(carId);

        if (!wrapper) {
          send('wrapper_refresh', { 
            message: `Refreshing wrapper [${i + 1}/${missingCars.length}]...` 
          });
          
          wrapper = await this.getTransferWrapper(tokenTarget);

          if (!wrapper) {
            send('error', { message: 'Lost wrapper. Stopping transfer.' });
            break;
          }

          send('wrapper_ready', { 
            wrapperCarId: wrapper.carId, 
            wrapperName: wrapper.displayName, 
            message: `New wrapper: ${formatCarDisplay(wrapper.carId, wrapper.displayName)}` 
          });
        }

        send('transferring', { 
          current: i + 1, 
          total: missingCars.length, 
          carId, 
          carName, 
          message: `[${i + 1}/${missingCars.length}] ${formatCarDisplay(carId, carName)}` 
        });

        const result = await this.executeTransfer(tokenTarget, car, wrapper);
        const succeeded = result.success;

        stats.cars.push({ carId, carName, success: succeeded });
        succeeded ? stats.success++ : stats.failed++;

        const progressStats = { 
          success: stats.success, 
          failed: stats.failed, 
          total: stats.total 
        };

        send(succeeded ? 'success' : 'failed', {
          current: i + 1,
          total: missingCars.length,
          carId,
          carName,
          success: succeeded,
          results: progressStats,
          message: `[${i + 1}/${missingCars.length}] ${succeeded ? 'OK' : 'FAIL'}: ${formatCarDisplay(carId, carName)}`,
        });

        wrapper = null;

        await new Promise((r) => setTimeout(r, WRAPPER_REFRESH_DELAY_MS));
      }

      send('complete', {
        results: stats,
        message: `Done: ${stats.success} transferred, ${stats.failed} failed, ${stats.total} total missing vehicles`,
      });

      return this.ok({ 
        results: stats,
        message: `Successfully transferred ${stats.success} out of ${stats.total} missing vehicles`
      });
    } catch (e) {
      const msg = this.axiosError(e, 'Missing vehicles transfer failed');
      send('error', { message: msg });
      return this.fail(msg);
    }
  }

  async saveCustomPlayerData(token, customData) {
    const err = this.requireToken(token);
    if (err) return err;

    if (!customData || typeof customData !== 'object') {
      return this.fail('Invalid custom data format');
    }

    if (!validateCustomDataSize(customData)) {
      return this.fail(`Custom data exceeds maximum size of ${MAX_CUSTOM_DATA_BYTES / 1024}KB`);
    }

    try {
      const parsedData = typeof customData === 'string' ? safeJsonParse(customData) : customData;
      
      if (parsedData.coin !== undefined && !this.isValidAmount(parsedData.coin, this.maxCoin)) {
        parsedData.coin = Math.min(Math.max(0, parsedData.coin), this.maxCoin);
      }
      
      if (parsedData.money !== undefined && !this.isValidAmount(parsedData.money, this.maxMoney)) {
        parsedData.money = Math.min(Math.max(0, parsedData.money), this.maxMoney);
      }

      return this.saveAccountData(token, parsedData);
    } catch (e) {
      return this.fail(this.axiosError(e, 'Failed to save custom player data'));
    }
  }

  async unlockAllWithCustomOptions(token, options = {}) {
    const err = this.requireToken(token);
    if (err) return err;

    const {
      customMoney = this.maxMoney,
      customCoins = this.maxCoin,
      customName = null,
      customLocalId = null
    } = options;

    if (!this.isValidAmount(customMoney, this.maxMoney)) {
      return this.fail(`Custom money must be 0–${this.maxMoney}`);
    }
    
    if (!this.isValidAmount(customCoins, this.maxCoin)) {
      return this.fail(`Custom coins must be 0–${this.maxCoin}`);
    }
    
    if (customName && !this.isValidName(customName)) {
      return this.fail('Custom name must be 1–300 characters');
    }
    
    if (customLocalId && !this.isValidPlayerId(customLocalId)) {
      return this.fail('Invalid custom local ID');
    }

    const accountData = this.buildFullAccountData(customLocalId);
    
    if (customName) {
      accountData.Name = customName.trim();
    }

    accountData.money = customMoney;
    accountData.coin = customCoins;

    const saveResult = await this.saveAccountData(token, accountData);
    if (!saveResult.success) {
      return this.fail('Failed to save account data');
    }

    const rankResult = await this.setRank(token);
    if (!rankResult.success) {
      return this.fail('Account unlocked but rank update failed');
    }

    return this.ok({
      message: 'Account fully unlocked with custom options',
      localId: accountData.localID,
      name: accountData.Name,
      money: accountData.money,
      coins: accountData.coin
    });
  }

  async transferMissingCarData(tokenSource, tokenTarget, sourcePlayerData, targetPlayerData) {
    const err = this.requireTokenPair(tokenSource, tokenTarget);
    if (err) return err;

    if (!sourcePlayerData || !targetPlayerData) {
      return this.fail('Invalid player data provided');
    }

    try {
      const { merged, added } = mergeCarData(sourcePlayerData, targetPlayerData);
      
      if (added.length === 0) {
        return this.ok({ 
          message: 'No missing car data found', 
          added: [], 
          merged 
        });
      }

      const saveResult = await this.saveAccountData(tokenTarget, merged);
      
      if (!saveResult.success) {
        return this.fail('Failed to save merged car data');
      }

      return this.ok({ 
        message: `Successfully added ${added.length} missing cars`, 
        added, 
        merged 
      });
    } catch (e) {
      return this.fail(this.axiosError(e, 'Failed to transfer missing car data'));
    }
  }

  filterCarsByTarget(cars, targetCarId) {
    if (targetCarId === 'ALL' || targetCarId === 'all' || targetCarId == null) {
      return cars;
    }
    
    const targetId = String(targetCarId);
    return cars.filter(car => {
      const carId = resolveCarId(car);
      return carId != null && String(carId) === targetId;
    });
  }

  applyModification(car, modifierFn) {
    const modifiedCar = structuredClone(car);
    const floats = normalizeFloatsArray(modifiedCar.floats, 48);
    modifierFn(floats);
    modifiedCar.floats = floats;
    modifiedCar.CarID = parseInt(resolveCarId(modifiedCar, 0), 10);
    
    if (!modifiedCar.Vynils) {
      modifiedCar.Vynils = { allVynils: [], CarID: modifiedCar.CarID };
    }
    modifiedCar.Vynils.CarID = modifiedCar.CarID;
    
    return modifiedCar;
  }

  applyCustomEngine(car, hp, innerHp, nm, innerNm, grip, shift) {
    return this.applyModification(car, floats => {
      floats[1] = hp;
      floats[2] = innerHp;
      floats[3] = nm;
      floats[4] = innerNm;
      floats[7] = grip;
      floats[16] = shift;
    });
  }

  applyPoliceSiren(car) {
    return this.applyModification(car, floats => {
      floats[0] = 1;
    });
  }

  applyMillage(car, customValue) {
    return this.applyModification(car, floats => {
      floats[5] = customValue;
      floats[6] = customValue;
    });
  }

  applyChrome(car, bodyValue1, bodyValue2) {
    return this.applyModification(car, floats => {
      floats[10] = bodyValue1;
      floats[11] = bodyValue2;
    });
  }

  async applyModificationToCars(token, targetCarId, modificationFn, onProgress = null) {
    const err = this.requireToken(token);
    if (err) return err;

    const carIdErr = this.requireValidCarId(targetCarId);
    if (carIdErr) return carIdErr;

    const send = this.makeSendProgress(onProgress);

    try {
      send('fetching', { message: 'Fetching vehicles...' });

      const carsRes = await this.getAllCars(token);
      if (!carsRes.success || !carsRes.cars?.length) {
        send('error', { message: 'No cars found in account' });
        return this.fail('No cars found in account');
      }

      const allCars = carsRes.cars;
      const targetCars = this.filterCarsByTarget(allCars, targetCarId);
      
      if (targetCars.length === 0) {
        send('error', { message: `Car ${targetCarId} not found` });
        return this.fail(`Car ${targetCarId} not found`);
      }

      send('found', { 
        total: targetCars.length, 
        message: `Found ${targetCars.length} vehicle(s) to modify` 
      });

      targetCars.forEach((car) => {
        const id = resolveCarId(car);
        const name = car.displayName || this.getCarName(id);
        send('vehicle_list', { 
          id, 
          name, 
          display: formatCarDisplay(id, name) 
        });
      });

      const stats = { success: 0, failed: 0, total: targetCars.length, cars: [] };

      send('wrapper', { message: 'Getting initial transfer wrapper...' });

      let wrapper = await this.getTransferWrapper(token);
      if (!wrapper) {
        send('error', { message: 'No vehicle listed for sale. Cannot apply modifications.' });
        return this.fail('Failed to get transfer wrapper');
      }

      send('wrapper_ready', { 
        wrapperCarId: wrapper.carId, 
        wrapperName: wrapper.displayName, 
        message: `Wrapper ready: ${formatCarDisplay(wrapper.carId, wrapper.displayName)}` 
      });

      for (let i = 0; i < targetCars.length; i++) {
        const car = targetCars[i];
        const carId = resolveCarId(car, i);
        const carName = car.displayName || this.getCarName(carId);

        if (!wrapper) {
          send('wrapper_refresh', { message: `Refreshing wrapper [${i + 1}/${targetCars.length}]...` });
          wrapper = await this.getTransferWrapper(token);

          if (!wrapper) {
            send('error', { message: 'Lost wrapper. Stopping.' });
            break;
          }

          send('wrapper_ready', { 
            wrapperCarId: wrapper.carId, 
            wrapperName: wrapper.displayName, 
            message: `New wrapper: ${formatCarDisplay(wrapper.carId, wrapper.displayName)}` 
          });
        }

        send('processing', { 
          current: i + 1, 
          total: targetCars.length, 
          carId, 
          carName, 
          message: `[${i + 1}/${targetCars.length}] Processing ${formatCarDisplay(carId, carName)}` 
        });

        const modifiedCar = modificationFn(car);
        const result = await this.executeTransfer(token, modifiedCar, wrapper);
        const succeeded = result.success;

        stats.cars.push({ carId, carName, success: succeeded });
        succeeded ? stats.success++ : stats.failed++;

        const progressStats = { success: stats.success, failed: stats.failed, total: stats.total };

        send(succeeded ? 'success' : 'failed', {
          current: i + 1,
          total: targetCars.length,
          carId,
          carName,
          success: succeeded,
          results: progressStats,
          message: `[${i + 1}/${targetCars.length}] ${succeeded ? 'OK' : 'FAIL'}: ${formatCarDisplay(carId, carName)}`,
        });

        wrapper = null;

        await new Promise((r) => setTimeout(r, WRAPPER_REFRESH_DELAY_MS));
      }

      send('complete', {
        results: stats,
        message: `Done: ${stats.success} ok, ${stats.failed} failed, ${stats.total} total`,
      });

      return this.ok({ results: stats });
    } catch (e) {
      const msg = this.axiosError(e, 'Modification failed');
      send('error', { message: msg });
      return this.fail(msg);
    }
  }

  async setCustomEngine(token, targetCarId = 'ALL', hp = 9999, innerHp = 9999, nm = 9999, innerNm = 9999, grip = 9999, shift = 0.05, onProgress = null) {
    const carIdErr = this.requireValidCarId(targetCarId);
    if (carIdErr) return carIdErr;
    
    if (!this.isValidNumber(hp) || !this.isValidNumber(innerHp) || !this.isValidNumber(nm) || 
        !this.isValidNumber(innerNm) || !this.isValidNumber(grip) || !this.isValidNumber(shift)) {
      return this.fail('All engine parameters must be non-negative numbers');
    }
    
    const modificationFn = (car) => this.applyCustomEngine(car, hp, innerHp, nm, innerNm, grip, shift);
    return this.applyModificationToCars(token, targetCarId, modificationFn, onProgress);
  }

  async setPoliceSiren(token, targetCarId = 'ALL', onProgress = null) {
    const carIdErr = this.requireValidCarId(targetCarId);
    if (carIdErr) return carIdErr;
    
    const modificationFn = (car) => this.applyPoliceSiren(car);
    return this.applyModificationToCars(token, targetCarId, modificationFn, onProgress);
  }

  async setMillage(token, targetCarId = 'ALL', customValue = 0, onProgress = null) {
    const carIdErr = this.requireValidCarId(targetCarId);
    if (carIdErr) return carIdErr;
    
    if (!this.isValidNumber(customValue)) {
      return this.fail('Custom value must be a non-negative number');
    }
    
    const modificationFn = (car) => this.applyMillage(car, customValue);
    return this.applyModificationToCars(token, targetCarId, modificationFn, onProgress);
  }

  async setChrome(token, targetCarId = 'ALL', bodyValue1 = 99.0, bodyValue2 = 99.0, onProgress = null) {
    const carIdErr = this.requireValidCarId(targetCarId);
    if (carIdErr) return carIdErr;
    
    if (!this.isValidNumber(bodyValue1) || !this.isValidNumber(bodyValue2)) {
      return this.fail('Body values must be non-negative numbers');
    }
    
    const modificationFn = (car) => this.applyChrome(car, bodyValue1, bodyValue2);
    return this.applyModificationToCars(token, targetCarId, modificationFn, onProgress);
  }
}

export { CPMApiService };
