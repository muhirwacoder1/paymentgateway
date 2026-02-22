const axios = require('axios');

class LMBTechPaymentService {
  constructor(appKey, secretKey, options = {}) {
    this.appKey = appKey || process.env.LMBTECH_APP_KEY;
    this.secretKey = secretKey || process.env.LMBTECH_SECRET_KEY;
    this.apiUrl = options.apiUrl || process.env.LMBTECH_API_URL || 'https://pay.lmbtech.rw/pay/config/api.php';
    this.timeoutMs = Number(options.timeoutMs || process.env.LMBTECH_TIMEOUT_MS || 60000);

    if (!this.appKey || !this.secretKey) {
      throw new Error('LMBTech credentials are required');
    }
  }

  getAuthHeader() {
    const credentials = Buffer.from(`${this.appKey}:${this.secretKey}`).toString('base64');
    return `Basic ${credentials}`;
  }

  formatPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') {
      throw new Error('Phone number is required');
    }

    const clean = phone.replace(/[^\d+]/g, '');

    if (clean.startsWith('+250') && clean.length === 13) {
      return clean;
    }

    if (clean.startsWith('250') && clean.length === 12) {
      return `+${clean}`;
    }

    if (clean.startsWith('0') && clean.length === 10) {
      return `+250${clean.slice(1)}`;
    }

    if (/^\d{9}$/.test(clean) && clean.startsWith('7')) {
      return `+250${clean}`;
    }

    throw new Error('Phone number must be a Rwanda MTN number, e.g. +25078xxxxxxx');
  }

  generateReferenceId(prefix = 'ORDER') {
    const date = new Date();
    const dateStr = date.getFullYear()
      + String(date.getMonth() + 1).padStart(2, '0')
      + String(date.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${prefix}-${dateStr}-${random}`;
  }

  parseJsonLikePayload(raw) {
    if (typeof raw !== 'string') {
      return raw;
    }

    const trimmed = raw.trim();
    const attempts = [trimmed];
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
    }

    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt);
      } catch (error) {
        continue;
      }
    }

    return raw;
  }

  statusToString(status) {
    if (typeof status === 'boolean') {
      return status ? 'success' : 'fail';
    }
    if (typeof status === 'number') {
      return status === 1 ? 'success' : 'fail';
    }
    if (typeof status === 'string') {
      return status.trim().toLowerCase();
    }
    return 'unknown';
  }

  isPositiveStatus(status) {
    const normalized = this.statusToString(status);
    return normalized === 'success' || normalized === 'pending' || normalized === 'ok' || normalized === 'true';
  }

  buildResult(rawPayload, httpStatus = 200) {
    const payload = this.parseJsonLikePayload(rawPayload);
    const apiStatus = payload && typeof payload === 'object' ? payload.status : null;
    const success = httpStatus < 400 && this.isPositiveStatus(apiStatus);

    return {
      success,
      data: payload,
      httpStatus
    };
  }

  async makeRequest(data, method = 'POST', meta = {}) {
    try {
      const upperMethod = method.toUpperCase();
      const config = {
        method: upperMethod,
        url: this.apiUrl,
        timeout: this.timeoutMs,
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        validateStatus: () => true
      };

      if (upperMethod === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }

      const response = await axios(config);
      return this.buildResult(response.data, response.status);
    } catch (error) {
      const timeoutError = error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
      const referenceId = meta.referenceId || data?.reference_id || null;

      if (timeoutError) {
        return {
          success: true,
          data: {
            status: 'pending',
            message: `Gateway timeout after ${this.timeoutMs}ms. Payment may still complete. Check status with your reference ID.`,
            reference_id: referenceId,
            timeout: true
          },
          timeout: true,
          httpStatus: 202
        };
      }

      const responsePayload = error.response?.data;
      const fallbackError = responsePayload || { message: error.message };
      const normalizedFallback = this.parseJsonLikePayload(fallbackError);
      return {
        success: false,
        data: {
          status: 'fail',
          ...(normalizedFallback && typeof normalizedFallback === 'object'
            ? normalizedFallback
            : { message: String(normalizedFallback) }),
          reference_id: referenceId
        },
        error: fallbackError,
        httpStatus: error.response?.status || 500
      };
    }
  }

  async collectPayment({
    email,
    name,
    amount,
    payerPhone,
    servicePaid,
    callbackUrl,
    referenceId = null
  }) {
    const formattedPhone = this.formatPhoneNumber(payerPhone);

    const generatedReferenceId = referenceId || this.generateReferenceId('ORDER');

    const data = {
      action: 'pay',
      email,
      name,
      payment_method: 'MTN_MOMO_RWA',
      amount: Number(amount),
      payer_phone: formattedPhone,
      service_paid: servicePaid,
      'service-paid': servicePaid,
      reference_id: generatedReferenceId,
      callback_url: callbackUrl
    };

    return this.makeRequest(data, 'POST', { referenceId: generatedReferenceId });
  }

  async initiateCardPayment({
    email,
    name,
    amount,
    servicePaid,
    callbackUrl,
    cardRedirectUrl,
    referenceId = null
  }) {
    const generatedReferenceId = referenceId || this.generateReferenceId('ORDER');

    const data = {
      action: 'pay',
      email,
      name,
      payment_method: 'card',
      amount: Number(amount),
      service_paid: servicePaid,
      'service-paid': servicePaid,
      reference_id: generatedReferenceId,
      callback_url: callbackUrl,
      card_redirect_url: cardRedirectUrl,
      cardredirect_url: cardRedirectUrl
    };

    return this.makeRequest(data, 'POST', { referenceId: generatedReferenceId });
  }

  async sendMoney({
    email,
    name,
    amount,
    recipientPhone,
    servicePaid = 'payout',
    callbackUrl,
    referenceId = null
  }) {
    const formattedPhone = this.formatPhoneNumber(recipientPhone);

    const generatedReferenceId = referenceId || this.generateReferenceId('PAYOUT');

    const data = {
      action: 'payout',
      email,
      name,
      payment_method: 'MTN_MOMO_RWA',
      amount: Number(amount),
      payer_phone: formattedPhone,
      service_paid: servicePaid,
      'service-paid': servicePaid,
      reference_id: generatedReferenceId,
      callback_url: callbackUrl
    };

    return this.makeRequest(data, 'POST', { referenceId: generatedReferenceId });
  }

  async sendSMS({
    name,
    phoneNumber,
    message,
    referenceId = null
  }) {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    const generatedReferenceId = referenceId || this.generateReferenceId('SMS');

    const data = {
      action: 'sms',
      name,
      tel: formattedPhone,
      message,
      reference_id: generatedReferenceId
    };

    return this.makeRequest(data, 'POST', { referenceId: generatedReferenceId });
  }

  async checkStatus(referenceId) {
    if (!referenceId) {
      return {
        success: false,
        data: { status: 'fail', message: 'Reference ID is required' }
      };
    }

    return this.makeRequest({ reference_id: referenceId }, 'GET');
  }

  normalizeCallbackStatus(status) {
    const normalized = this.statusToString(status);
    if (normalized === 'completed' || normalized === 'success') {
      return 'success';
    }
    if (normalized === 'pending') {
      return 'pending';
    }
    return 'failed';
  }

  validateMoMoCallback(callbackData) {
    const required = ['reference_id', 'transaction_id', 'status'];
    const missing = required.filter((field) => !callbackData[field]);

    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required fields: ${missing.join(', ')}`
      };
    }

    return {
      valid: true,
      data: {
        referenceId: callbackData.reference_id,
        transactionId: callbackData.transaction_id,
        status: this.normalizeCallbackStatus(callbackData.status),
        amount: callbackData.amount,
        paymentMethod: callbackData.payment_method,
        payerPhone: callbackData.payer_phone
      }
    };
  }

  validateCardCallback(formData) {
    const merchantRef = formData.pesapal_merchant_reference;
    const trackingId = formData.pesapal_transaction_tracking_id;
    const responseData = formData.pesapal_response_data;

    if (!merchantRef || !trackingId || !responseData) {
      return {
        valid: false,
        error: 'Missing required Pesapal fields'
      };
    }

    return {
      valid: true,
      data: {
        referenceId: merchantRef,
        transactionId: trackingId,
        status: this.normalizeCallbackStatus(responseData),
        responseData
      }
    };
  }
}

module.exports = LMBTechPaymentService;
