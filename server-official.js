require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const LMBTechPaymentService = require('./LMBTechPaymentService-Official');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Support both JSON and form-urlencoded (for card callbacks)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Payment Service
const paymentService = new LMBTechPaymentService(
  process.env.LMBTECH_APP_KEY,
  process.env.LMBTECH_SECRET_KEY
);

// Create logs directory
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

/**
 * Log callback to file
 */
function logCallback(data, type = 'callback') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type}] ${JSON.stringify(data)}\n`;
  const logFile = path.join(logsDir, 'callback_log.txt');
  
  fs.appendFileSync(logFile, logEntry);
  console.log(logEntry);
}

/**
 * ROOT ROUTE
 */
app.get('/', (req, res) => {
  res.json({
    service: 'LMBTech Payment Integration - Official API',
    status: 'running',
    version: 'Official API Documentation',
    endpoints: {
      'POST /api/payment/momo': 'Initiate MoMo payment (MTN_MOMO_RWA)',
      'POST /api/payment/card': 'Initiate Card payment',
      'POST /api/payout': 'Send money (payout)',
      'POST /api/sms': 'Send SMS',
      'GET /api/payment/status/:referenceId': 'Check payment status',
      'POST /api/payment-callback': 'Payment callback endpoint (JSON + Form Data)'
    },
    documentation: {
      phone_format: '+250788123456',
      payment_method_momo: 'MTN_MOMO_RWA',
      payment_method_card: 'card',
      test_phone: '+250785085214'
    }
  });
});

/**
 * INITIATE MOMO PAYMENT
 */
app.post('/api/payment/momo', async (req, res) => {
  try {
    const {
      email,
      name,
      amount,
      payerPhone,
      servicePaid
    } = req.body;

    // Validate required fields
    if (!email || !name || !amount || !payerPhone || !servicePaid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, name, amount, payerPhone, servicePaid'
      });
    }

    // Build callback URL
    const callbackUrl = `${process.env.CALLBACK_BASE_URL || 'http://localhost:3000'}/api/payment-callback`;

    // Initiate payment (phone number will be auto-formatted)
    const result = await paymentService.collectPayment({
      email,
      name,
      amount,
      payerPhone,
      servicePaid,
      callbackUrl
    });

    res.json(result);
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * INITIATE CARD PAYMENT
 */
app.post('/api/payment/card', async (req, res) => {
  try {
    const {
      email,
      name,
      amount,
      servicePaid,
      cardRedirectUrl
    } = req.body;

    // Validate required fields
    if (!email || !name || !amount || !servicePaid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const callbackUrl = `${process.env.CALLBACK_BASE_URL || 'http://localhost:3000'}/api/payment-callback`;
    const redirectUrl = cardRedirectUrl || callbackUrl;

    const result = await paymentService.initiateCardPayment({
      email,
      name,
      amount,
      servicePaid,
      callbackUrl,
      cardRedirectUrl: redirectUrl
    });

    res.json(result);
  } catch (error) {
    console.error('Card payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * SEND MONEY (PAYOUT)
 */
app.post('/api/payout', async (req, res) => {
  try {
    const {
      email,
      name,
      amount,
      recipientPhone,
      servicePaid
    } = req.body;

    if (!email || !name || !amount || !recipientPhone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const callbackUrl = `${process.env.CALLBACK_BASE_URL || 'http://localhost:3000'}/api/payment-callback`;

    const result = await paymentService.sendMoney({
      email,
      name,
      amount,
      recipientPhone,
      servicePaid: servicePaid || 'payout',
      callbackUrl
    });

    res.json(result);
  } catch (error) {
    console.error('Payout error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * SEND SMS
 */
app.post('/api/sms', async (req, res) => {
  try {
    const { name, phoneNumber, message } = req.body;

    if (!name || !phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, phoneNumber, message'
      });
    }

    const result = await paymentService.sendSMS({
      name,
      phoneNumber,
      message
    });

    res.json(result);
  } catch (error) {
    console.error('SMS error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * CHECK PAYMENT STATUS
 */
app.get('/api/payment/status/:referenceId', async (req, res) => {
  try {
    const { referenceId } = req.params;

    const result = await paymentService.checkStatus(referenceId);
    res.json(result);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PAYMENT CALLBACK HANDLER
 * Handles BOTH:
 * - Mobile Money callbacks (JSON)
 * - Card payment callbacks (Form Data)
 */
app.post('/api/payment-callback', async (req, res) => {
  try {
    console.log('📥 Callback received');
    console.log('Headers:', req.headers['content-type']);
    console.log('Body:', req.body);
    
    let validation;
    let callbackType;

    // Determine callback type and validate
    if (req.body.pesapal_merchant_reference) {
      // CARD PAYMENT CALLBACK (Form Data from Pesapal)
      callbackType = 'CARD';
      console.log('💳 Card payment callback detected');
      
      logCallback(req.body, 'CARD_CALLBACK');
      validation = paymentService.validateCardCallback(req.body);
      
    } else if (req.body.reference_id && req.body.transaction_id) {
      // MOBILE MONEY CALLBACK (JSON)
      callbackType = 'MOMO';
      console.log('📱 MoMo callback detected');
      
      logCallback(req.body, 'MOMO_CALLBACK');
      validation = paymentService.validateMoMoCallback(req.body);
      
    } else {
      console.error('❌ Unknown callback format');
      return res.status(400).json({
        success: false,
        error: 'Invalid callback format'
      });
    }

    // Validate callback data
    if (!validation.valid) {
      console.error('❌ Invalid callback:', validation.error);
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const { referenceId, transactionId, status } = validation.data;

    console.log(`✅ ${callbackType} callback valid:`, {
      referenceId,
      transactionId,
      status
    });

    // ========================================
    // YOUR BUSINESS LOGIC HERE
    // ========================================
    
    if (status === 'success') {
      // ✅ Payment successful
      
      console.log(`💚 ${callbackType} payment successful!`);
      
      // 1. Update your database
      // await updatePaymentInDatabase(referenceId, {
      //   status: 'paid',
      //   transactionId: transactionId,
      //   paymentMethod: callbackType,
      //   paidAt: new Date()
      // });

      // 2. Mark order as paid
      // await updateOrderStatus(referenceId, 'paid');

      // 3. Send confirmation email/SMS to customer
      // await sendPaymentConfirmation(referenceId);

      // 4. Activate service or trigger fulfillment
      // await activateService(referenceId);
      
    } else if (status === 'failed') {
      // ❌ Payment failed
      
      console.log(`❌ ${callbackType} payment failed`);
      
      // 1. Update database
      // await updatePaymentInDatabase(referenceId, {
      //   status: 'failed',
      //   failedAt: new Date()
      // });

      // 2. Notify customer
      // await sendPaymentFailedNotification(referenceId);
      
    } else if (status === 'pending') {
      // ⏳ Payment pending
      console.log(`⏳ ${callbackType} payment pending`);
    }

    // Respond to LMBTech/Pesapal
    res.json({
      success: true,
      message: 'Callback processed',
      reference_id: referenceId
    });

  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * TEST PAYMENT PAGE
 */
app.get('/test-payment', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>LMBTech Payment Test - Official API</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
        }
        .banner {
          background: #4CAF50;
          color: white;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        button {
          background: #007bff;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          width: 100%;
        }
        button:hover {
          background: #0056b3;
        }
        #result {
          margin-top: 20px;
          padding: 15px;
          border-radius: 4px;
          display: none;
        }
        .success {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
        }
        .error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }
        .info-box {
          background: #e7f3ff;
          border-left: 4px solid #2196F3;
          padding: 15px;
          margin-bottom: 20px;
        }
        .info-box ul {
          margin: 10px 0;
          padding-left: 20px;
        }
      </style>
    </head>
    <body>
      <div class="banner">
        <h1>🔐 LMBTech Payment Test</h1>
        <p>Official API Version</p>
      </div>

      <div class="info-box">
        <strong>📝 Test Information:</strong>
        <ul>
          <li><strong>Phone Format:</strong> +250788123456 or 0788123456 (auto-converted)</li>
          <li><strong>Test Phone:</strong> +250785085214</li>
          <li><strong>Test Amount:</strong> 100 RWF minimum</li>
        </ul>
      </div>
      
      <form id="paymentForm">
        <div class="form-group">
          <label>Email:</label>
          <input type="email" id="email" value="test@example.com" required>
        </div>
        
        <div class="form-group">
          <label>Name:</label>
          <input type="text" id="name" value="John Doe" required>
        </div>
        
        <div class="form-group">
          <label>Phone (0788123456 or +250788123456):</label>
          <input type="tel" id="phone" value="0788123456" required>
          <small>Will be auto-converted to +250 format</small>
        </div>
        
        <div class="form-group">
          <label>Amount (RWF):</label>
          <input type="number" id="amount" value="100" required>
        </div>
        
        <div class="form-group">
          <label>Service Description:</label>
          <input type="text" id="service" value="Test Payment" required>
        </div>
        
        <button type="submit">💳 Initiate Payment</button>
      </form>
      
      <div id="result"></div>
      
      <script>
        document.getElementById('paymentForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const resultDiv = document.getElementById('result');
          resultDiv.style.display = 'block';
          resultDiv.className = '';
          resultDiv.innerHTML = '⏳ Processing payment...';
          
          try {
            const response = await fetch('/api/payment/momo', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email: document.getElementById('email').value,
                name: document.getElementById('name').value,
                payerPhone: document.getElementById('phone').value,
                amount: document.getElementById('amount').value,
                servicePaid: document.getElementById('service').value
              })
            });
            
            const data = await response.json();
            
            if (data.success) {
              resultDiv.className = 'success';
              resultDiv.innerHTML = 
                '✅ Payment initiated successfully!<br>' +
                'Reference ID: ' + (data.data?.data?.reference_id || data.data?.reference_id || 'N/A') + '<br>' +
                'Status: ' + (data.data?.data?.status || data.data?.status || 'pending') + '<br>' +
                '<strong>Check your phone for MoMo prompt!</strong>';
            } else {
              resultDiv.className = 'error';
              resultDiv.innerHTML = '❌ Payment failed:<br>' + JSON.stringify(data.error || data.data);
            }
          } catch (error) {
            resultDiv.className = 'error';
            resultDiv.innerHTML = '❌ Error: ' + error.message;
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 LMBTech Payment Server Running! (Official API)');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`🧪 Test Page: http://localhost:${PORT}/test-payment`);
  console.log(`📥 Callback URL: http://localhost:${PORT}/api/payment-callback`);
  console.log('');
  console.log('📌 API Specifications:');
  console.log('   Payment Method (MoMo): MTN_MOMO_RWA');
  console.log('   Payment Method (Card): card');
  console.log('   Phone Format: +250788123456');
  console.log('   Test Phone: +250785085214');
  console.log('');
  console.log('📌 Your Credentials:');
  console.log(`   App Key: ${process.env.LMBTECH_APP_KEY || 'NOT SET'}`);
  console.log(`   Secret Key: ${process.env.LMBTECH_SECRET_KEY ? '***' + process.env.LMBTECH_SECRET_KEY.slice(-4) : 'NOT SET'}`);
  console.log('');
});

module.exports = app;
