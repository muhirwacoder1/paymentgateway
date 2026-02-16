require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const LMBTechPaymentService = require('./LMBTechPaymentService-Official');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const RAW_CALLBACK_BASE_URL = (process.env.CALLBACK_BASE_URL || '').trim();
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOG_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'logs');
const CALLBACK_LOG_FILE = path.join(LOG_DIR, 'callback_log.txt');
let paymentService;

try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (error) {
  console.warn(`Log directory unavailable: ${error.message}`);
}

const callbackState = new Map();

// Needed on Vercel/other proxies so req.protocol resolves to https.
app.set('trust proxy', true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

function getPaymentService() {
  if (paymentService) {
    return paymentService;
  }

  paymentService = new LMBTechPaymentService(
    process.env.LMBTECH_APP_KEY,
    process.env.LMBTECH_SECRET_KEY
  );
  return paymentService;
}

function logCallback(type, payload) {
  const line = `[${new Date().toISOString()}] [${type}] ${JSON.stringify(payload)}\n`;
  try {
    fs.appendFileSync(CALLBACK_LOG_FILE, line);
  } catch (error) {
    console.log(`Callback log fallback (${type}): ${line.trim()} | write error: ${error.message}`);
  }
}

function requiredFields(body, fields) {
  return fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
}

function resolveBaseUrl(req) {
  const fromEnv = RAW_CALLBACK_BASE_URL.replace(/\/$/, '');
  const placeholder = /yourdomain\.com|example\.com|your-site\.com/i.test(fromEnv);

  if (fromEnv && !placeholder) {
    return fromEnv;
  }

  return `${req.protocol}://${req.get('host')}`;
}

function resolveCallbackUrl(req, explicitValue) {
  if (explicitValue) {
    return explicitValue;
  }
  return `${resolveBaseUrl(req)}/api/payment-callback`;
}

function resolveCardReturnUrl(req, explicitValue) {
  if (explicitValue) {
    return explicitValue;
  }
  return `${resolveBaseUrl(req)}/card-return`;
}

function toPositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return amount;
}

function extractReferenceId(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return (
    payload.reference_id
    || payload?.data?.reference_id
    || payload?.inputData?.reference_id
    || null
  );
}

function extractRedirectUrl(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload.redirect_url || payload?.data?.redirect_url || null;
}

function normalizeMessage(payload, fallback) {
  if (payload && typeof payload === 'object' && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

function apiResponse(res, result, defaultFailStatus = 400) {
  const payload = result?.data;
  const success = Boolean(result?.success);
  const message = normalizeMessage(payload, success ? 'Request successful' : 'Request failed');
  const referenceId = extractReferenceId(payload);
  const redirectUrl = extractRedirectUrl(payload);
  const status =
    payload && typeof payload === 'object' && payload.status !== undefined
      ? payload.status
      : success
        ? 'success'
        : 'fail';
  const httpStatus = success
    ? 200
    : (result?.httpStatus && result.httpStatus >= 400 ? result.httpStatus : defaultFailStatus);

  return res.status(httpStatus).json({
    success,
    status,
    message,
    referenceId,
    redirectUrl,
    data: payload || null
  });
}

function isValidationError(error) {
  const message = error?.message || '';
  return /required|must be|invalid|phone number/i.test(message);
}

function sendRouteError(res, error) {
  const statusCode = isValidationError(error) ? 400 : 500;
  return res.status(statusCode).json({
    success: false,
    message: error.message
  });
}

app.get('/api', (req, res) => {
  res.json({
    service: 'LMBTech Payment Integration',
    status: 'running',
    docs: '/LMBTech Payment System - API Documentation.md',
    endpoints: {
      'POST /api/payment/momo': 'Initiate mobile money collection',
      'POST /api/payment/card': 'Initiate card collection',
      'POST /api/payout': 'Initiate payout',
      'POST /api/sms': 'Send SMS',
      'GET /api/payment/status/:referenceId': 'Check transaction status',
      'POST /api/payment-callback': 'Callback endpoint',
      'GET /api/payment-callback': 'Callback endpoint (card redirect support)'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    callbackBaseUrl: resolveBaseUrl(req)
  });
});

app.post('/api/payment/momo', async (req, res) => {
  try {
    const svc = getPaymentService();
    const missing = requiredFields(req.body, ['email', 'name', 'amount', 'payerPhone', 'servicePaid']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const amount = toPositiveAmount(req.body.amount);
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    const result = await svc.collectPayment({
      email: req.body.email,
      name: req.body.name,
      amount,
      payerPhone: req.body.payerPhone,
      servicePaid: req.body.servicePaid,
      callbackUrl: resolveCallbackUrl(req, req.body.callbackUrl),
      referenceId: req.body.referenceId || null
    });

    return apiResponse(res, result);
  } catch (error) {
    return sendRouteError(res, error);
  }
});

app.post('/api/payment/card', async (req, res) => {
  try {
    const svc = getPaymentService();
    const missing = requiredFields(req.body, ['email', 'name', 'amount', 'servicePaid']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const amount = toPositiveAmount(req.body.amount);
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    const result = await svc.initiateCardPayment({
      email: req.body.email,
      name: req.body.name,
      amount,
      servicePaid: req.body.servicePaid,
      callbackUrl: resolveCallbackUrl(req, req.body.callbackUrl),
      cardRedirectUrl: resolveCardReturnUrl(req, req.body.cardRedirectUrl),
      referenceId: req.body.referenceId || null
    });

    return apiResponse(res, result);
  } catch (error) {
    return sendRouteError(res, error);
  }
});

app.post('/api/payout', async (req, res) => {
  try {
    const svc = getPaymentService();
    const missing = requiredFields(req.body, ['email', 'name', 'amount', 'recipientPhone']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const amount = toPositiveAmount(req.body.amount);
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    const result = await svc.sendMoney({
      email: req.body.email,
      name: req.body.name,
      amount,
      recipientPhone: req.body.recipientPhone,
      servicePaid: req.body.servicePaid || 'payout',
      callbackUrl: resolveCallbackUrl(req, req.body.callbackUrl),
      referenceId: req.body.referenceId || null
    });

    return apiResponse(res, result);
  } catch (error) {
    return sendRouteError(res, error);
  }
});

app.post('/api/sms', async (req, res) => {
  try {
    const svc = getPaymentService();
    const missing = requiredFields(req.body, ['name', 'phoneNumber', 'message']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const result = await svc.sendSMS({
      name: req.body.name,
      phoneNumber: req.body.phoneNumber,
      message: req.body.message,
      referenceId: req.body.referenceId || null
    });

    return apiResponse(res, result);
  } catch (error) {
    return sendRouteError(res, error);
  }
});

app.get('/api/payment/status/:referenceId', async (req, res) => {
  try {
    const svc = getPaymentService();
    const referenceId = req.params.referenceId;
    const result = await svc.checkStatus(referenceId);
    const payload = result.data;
    const responseText = normalizeMessage(payload, '');
    const localCallback = callbackState.get(referenceId);

    if (localCallback && payload && typeof payload === 'object') {
      payload.callback = localCallback;
    }

    if (!result.success && /not found/i.test(responseText)) {
      return apiResponse(res, result, 404);
    }

    return apiResponse(res, result);
  } catch (error) {
    return sendRouteError(res, error);
  }
});

function processCallback(rawPayload) {
  const svc = getPaymentService();
  if (rawPayload.pesapal_merchant_reference || rawPayload.pesapal_transaction_tracking_id) {
    return {
      type: 'card',
      validation: svc.validateCardCallback(rawPayload)
    };
  }

  if (rawPayload.reference_id || rawPayload.transaction_id) {
    return {
      type: 'momo',
      validation: svc.validateMoMoCallback(rawPayload)
    };
  }

  return {
    type: 'unknown',
    validation: {
      valid: false,
      error: 'Invalid callback format'
    }
  };
}

function handleCallback(req, res) {
  const payload = req.method === 'GET' ? req.query : req.body;
  const { type, validation } = processCallback(payload);
  logCallback(type.toUpperCase(), payload);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  const entry = {
    ...validation.data,
    callbackType: type,
    receivedAt: new Date().toISOString()
  };
  callbackState.set(validation.data.referenceId, entry);

  return res.status(200).json({
    success: true,
    message: 'Callback processed',
    data: entry
  });
}

app.post('/api/payment-callback', handleCallback);
app.get('/api/payment-callback', handleCallback);

app.get('/card-return', (req, res) => {
  const hasGatewayReturnParams = Boolean(
    req.query.pesapal_transaction_tracking_id
    || req.query.pesapal_response_data
    || req.query.pesapal_merchant_reference
  );
  const referenceId = req.query.reference_id;

  // Initial card redirect from LMBTech points back to this route.
  // Forward the customer to the actual hosted card checkout page.
  if (referenceId && !hasGatewayReturnParams) {
    const checkoutUrl = `https://pay.lmbtech.rw/pay/pesapal/iframe.php?reference_id=${encodeURIComponent(referenceId)}`;
    return res.redirect(checkoutUrl);
  }

  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/test-payment', (req, res) => {
  res.redirect('/');
});

function startServer(port = PORT) {
  const startupCallbackBase =
    RAW_CALLBACK_BASE_URL && !/yourdomain\.com|example\.com|your-site\.com/i.test(RAW_CALLBACK_BASE_URL)
      ? RAW_CALLBACK_BASE_URL.replace(/\/$/, '')
      : `http://localhost:${port}`;

  return app.listen(port, () => {
    console.log(`LMBTech payment server running on http://localhost:${port}`);
    console.log(`UI: http://localhost:${port}`);
    console.log(`Callback URL: ${startupCallbackBase}/api/payment-callback`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
