import axios from 'axios';
import https from 'https';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_CONCURRENT_DEFAULT = 50;
const TARGET_MONEY_DEFAULT = 50000000;

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

class CPM2ApiService {
  constructor() {
    this.baseUrl = 'https://europe-west1-cpm-2-7cea1.cloudfunctions.net';
    this.firebaseApiKey = 'AIzaSyCQDz9rgjgmvmFkvVfmvr2-7fT4tfrzRRQ';
    this.firebaseAuthUrl = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty';
    this.encryptedPayload = 'ZqxVNxUDhf5bvqbtK4Ggpw==';
    this.exchangeEndpoint = '/ExchangeCarForMoney21_1';
    
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      maxSockets: 100,
      maxFreeSockets: 20,
      timeout: DEFAULT_TIMEOUT_MS
    });
    
    this.http = axios.create({
      httpsAgent: this.httpsAgent,
      timeout: DEFAULT_TIMEOUT_MS,
      validateStatus: () => true
    });
  }

  headersUnity(token) {
    return {
      'User-Agent': 'UnityPlayer/2022.3.62f2',
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
      'X-Unity-Version': '2022.3.62f2'
    };
  }

  headersFirebase() {
    return { 'Content-Type': 'application/json', 'X-Unity-Version': '2022.3.62f2' };
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

  requireToken(token) {
    if (!this.isValidToken(token)) return this.fail('Invalid authentication token');
    return null;
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

  async firebasePost(endpoint, body) {
    try {
      return await this.http.post(
        `${this.firebaseAuthUrl}/${endpoint}?key=${this.firebaseApiKey}`,
        body,
        { headers: this.headersFirebase() }
      );
    } catch (e) {
      throw e;
    }
  }

  async login(email, password) {
    if (!email || !password) return this.fail('Email and password are required');

    try {
      const response = await this.firebasePost('verifyPassword', {
        email,
        password,
        returnSecureToken: true,
        clientType: 'CLIENT_TYPE_ANDROID'
      });

      if (response.status === 200 && response.data?.idToken) {
        return this.ok({
          message: 'Login successful',
          token: response.data.idToken,
          email: response.data.email,
          localId: response.data.localId,
          refreshToken: response.data.refreshToken,
          expiresIn: response.data.expiresIn
        });
      }

      return this.fail(this.firebaseError(response.data?.error?.message) || 'Login failed');
    } catch (error) {
      return this.fail(error.message || 'Login request failed');
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
        return this.ok({ 
          message: 'Registered successfully', 
          token: res.data.idToken, 
          email: res.data.email,
          localId: res.data.localId
        });
      }

      return this.fail(this.firebaseError(res.data?.error?.message));
    } catch (e) {
      return this.fail(this.axiosError(e, 'Registration failed'));
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

  async injectMoneyStream(token, targetMoney = TARGET_MONEY_DEFAULT, maxConcurrent = MAX_CONCURRENT_DEFAULT, onProgress = null) {
    if (!token) {
      const error = this.fail('Token is required');
      onProgress?.({ type: 'error', message: error.message });
      return error;
    }

    const send = (type, data = {}) => {
      if (typeof onProgress === 'function') {
        try { onProgress({ type, ...data, timestamp: new Date().toISOString() }); } catch {}
      }
    };

    const finalTargetMoney = targetMoney || TARGET_MONEY_DEFAULT;
    const finalMaxConcurrent = maxConcurrent || MAX_CONCURRENT_DEFAULT;

    send('start', { 
      targetMoney: finalTargetMoney, 
      maxConcurrent: finalMaxConcurrent, 
      message: `Starting money injection... Target: ${finalTargetMoney.toLocaleString()}` 
    });

    const url = `${this.baseUrl}${this.exchangeEndpoint}`;
    const headers = this.headersUnity(token);
    const payload = { data: this.encryptedPayload };

    let currentMoney = 0;
    let requestCount = 0;
    let isComplete = false;
    let hasError = false;
    let errorMessage = '';

    const makeRequest = async () => {
      if (isComplete || hasError) return null;
      requestCount++;
      const requestId = requestCount;

      try {
        const response = await this.http.post(url, payload, { headers });
        if (response.status !== 200) {
          hasError = true;
          errorMessage = `HTTP ${response.status}`;
          send('error', { requestId, message: errorMessage });
          return null;
        }

        const data = response.data;
        if (!data.result) {
          hasError = true;
          errorMessage = 'Invalid response format';
          send('error', { requestId, message: errorMessage });
          return null;
        }

        const resultData = JSON.parse(data.result);
        if (!resultData.Data || resultData.Data.newMoney === undefined) {
          hasError = true;
          errorMessage = 'Invalid result data structure';
          send('error', { requestId, message: errorMessage });
          return null;
        }

        const newMoney = resultData.Data.newMoney;
        if (newMoney > currentMoney) {
          currentMoney = newMoney;
          send('progress', {
            requestId,
            money: currentMoney,
            target: finalTargetMoney,
            percentage: ((currentMoney / finalTargetMoney) * 100).toFixed(1),
            message: `Money: ${currentMoney.toLocaleString()} / ${finalTargetMoney.toLocaleString()}`
          });
        }

        if (currentMoney >= finalTargetMoney) {
          isComplete = true;
          send('target_reached', { requestId, money: currentMoney, message: 'Target achieved!' });
        }

        return { requestId, money: currentMoney, success: true };
      } catch (error) {
        hasError = true;
        errorMessage = error.message;
        send('error', { requestId, message: errorMessage });
        return null;
      }
    };

    const activePromises = new Set();

    while (!isComplete && !hasError) {
      while (activePromises.size < finalMaxConcurrent && !isComplete && !hasError) {
        const promise = makeRequest();
        if (promise) {
          activePromises.add(promise);
          promise.finally(() => activePromises.delete(promise));
        }
      }
      if (activePromises.size > 0) await Promise.race(activePromises);
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    await Promise.allSettled(activePromises);

    if (hasError) {
      send('final_error', { message: errorMessage });
      return this.fail(errorMessage);
    }

    const result = {
      finalMoney: currentMoney,
      targetMoney: finalTargetMoney,
      targetReached: currentMoney >= finalTargetMoney,
      totalRequests: requestCount,
      maxConcurrent: finalMaxConcurrent
    };

    send('complete', {
      ...result,
      message: currentMoney >= finalTargetMoney ? `Target achieved: ${currentMoney.toLocaleString()}` : `Process stopped at: ${currentMoney.toLocaleString()}`
    });

    return this.ok(result);
  }
}

export { CPM2ApiService };
