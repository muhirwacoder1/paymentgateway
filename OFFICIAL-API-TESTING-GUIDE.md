# 🧪 OFFICIAL API TESTING GUIDE

## ⚠️ IMPORTANT CHANGES FROM EARLIER VERSION

The official LMBTech documentation has some key differences:

### 🔄 What Changed:

| Field | Old Value | ✅ Official Value |
|-------|-----------|------------------|
| **payment_method (MoMo)** | "MoMo" | "MTN_MOMO_RWA" |
| **payment_method (Card)** | "Card" | "card" |
| **Phone format** | "0788123456" | "+250788123456" |
| **Action (Payout)** | "disbursement" | "payout" |
| **Card URL field** | "card_url" | "card_redirect_url" |
| **API Endpoint** | /api | /api.php |

**Good news:** I've updated everything to match the official API! 🎉

---

## ✅ UPDATED FILES

You need to use these NEW files:

1. **LMBTechPaymentService-Official.js** ← Use this instead of the old one
2. **server-official.js** ← Use this instead of the old server.js
3. Your **credentials stay the same** ✅

---

## 🚀 STEP-BY-STEP TESTING (Official API)

### STEP 1: Replace Files

```bash
# Backup old files (optional)
mv LMBTechPaymentService.js LMBTechPaymentService-OLD.js
mv server.js server-OLD.js

# Rename new files
mv LMBTechPaymentService-Official.js LMBTechPaymentService.js
mv server-official.js server.js
```

**OR** just update the require statement in server.js:
```javascript
// Change this line:
const LMBTechPaymentService = require('./LMBTechPaymentService-Official');
```

---

### STEP 2: Your .env File Stays the Same

```env
LMBTECH_APP_KEY=app_699056feeb5a417710671342303
LMBTECH_SECRET_KEY=scrt_699056feeb5af1771067134
PORT=3000
CALLBACK_BASE_URL=http://localhost:3000
```

✅ **No changes needed!**

---

### STEP 3: Start Server

```bash
npm start
```

**Expected output:**
```
🚀 LMBTech Payment Server Running! (Official API)
📍 Server: http://localhost:3000
🧪 Test Page: http://localhost:3000/test-payment

📌 API Specifications:
   Payment Method (MoMo): MTN_MOMO_RWA
   Payment Method (Card): card
   Phone Format: +250788123456
   Test Phone: +250785085214
```

---

### STEP 4: Phone Number Format - VERY IMPORTANT! 📱

The official API requires **+250 format**, but the code now handles this automatically!

**You can use ANY of these formats:**

```
✅ 0788123456   → Auto-converts to +250788123456
✅ 788123456    → Auto-converts to +250788123456
✅ 250788123456 → Auto-converts to +250788123456
✅ +250788123456 → Used as-is
```

**The code automatically converts all formats to +250 format!** 🎉

---

### STEP 5: Test with Official Test Credentials

The documentation provides test credentials:

```
Test Phone: +250785085214
Test App Key: app_68b06fca2067717563934188958
Test Secret Key: scrt_68b06fca206911756393418

Test URLs:
- MoMo: https://pay.lmbtech.rw/test_lmbtech_pay/test_momo_api.php
- Card: https://pay.lmbtech.rw/test_lmbtech_pay/test_card_api.php
```

**You can test with either:**
- ✅ Your production credentials (your actual keys)
- ✅ Test credentials (for testing only)

---

### STEP 6: Open Test Page

```
http://localhost:3000/test-payment
```

**Fill the form:**
```
Email:    test@example.com
Name:     John Doe
Phone:    0788123456  (will auto-convert to +250788123456)
Amount:   100
Service:  Test Payment
```

---

### STEP 7: What to Expect

#### For Mobile Money (MoMo):

**1. Initial Response (2-5 seconds):**
```json
{
  "status": "success",
  "data": {
    "id": 8067,
    "reference_id": "ORDER-20260215-1234",
    "amount": "100.00",
    "status": "pending"
  },
  "message": "Payment initiated successfully"
}
```

**2. Phone Notification (5-10 seconds):**
```
MTN Mobile Money
Pay 100 RWF
Press 1 to confirm
Enter PIN: ****
```

**3. Callback (30-45 seconds after PIN):**
```json
{
  "reference_id": "ORDER-20260215-1234",
  "transaction_id": "TXN-987654321",
  "status": "success",
  "amount": "100.00",
  "payment_method": "MTN_MOMO_RWA",
  "payer_phone": "+250788123456"
}
```

#### For Card Payments:

**1. Initial Response:**
```json
{
  "status": "success",
  "data": {
    "reference_id": "ORDER-20260215-1234",
    "redirect_url": "https://pay.lmbtech.rw/pay/pesapal/iframe.php?reference_id=..."
  },
  "message": "Redirect to card payment gateway"
}
```

**2. User is redirected to Pesapal iframe**

**3. Callback (Form Data):**
```
pesapal_merchant_reference: ORDER-20260215-1234
pesapal_transaction_tracking_id: TXN-987654321
pesapal_response_data: COMPLETED
```

---

### STEP 8: Check Server Logs

**MoMo Payment:**
```bash
🔄 Initiating MoMo payment: {
  reference_id: 'ORDER-20260215-1234',
  amount: 100,
  phone: '+250788123456'  ← Note the +250 format
}

📥 Callback received
📱 MoMo callback detected
✅ MOMO callback valid: {
  referenceId: 'ORDER-20260215-1234',
  transactionId: 'TXN-987654321',
  status: 'success'
}
💚 MOMO payment successful!
```

---

### STEP 9: Test Payment Status

```bash
curl http://localhost:3000/api/payment/status/ORDER-20260215-1234
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": 8067,
    "reference_id": "ORDER-20260215-1234",
    "transaction_id": "TXN-987654321",
    "amount": "100.00",
    "status": "success",
    "payment_method": "MTN_MOMO_RWA",
    "payment_date": "2026-02-15 12:35:22"
  }
}
```

---

### STEP 10: Test SMS (Optional)

```bash
curl -X POST http://localhost:3000/api/sms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phoneNumber": "0788123456",
    "message": "Test SMS from LMBTech"
  }'
```

Phone number will auto-convert to +250 format.

---

### STEP 11: Test Payout (Optional)

```bash
curl -X POST http://localhost:3000/api/payout \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "John Doe",
    "amount": "500",
    "recipientPhone": "0788123456",
    "servicePaid": "refund"
  }'
```

**Note:** Payouts require:
- Sufficient balance in your account
- Payout permissions enabled

---

## 🎯 KEY DIFFERENCES TO REMEMBER

### Phone Numbers:
```javascript
// OLD WAY (won't work):
payerPhone: "0788123456"

// NEW WAY (automatic):
payerPhone: "0788123456"  // Auto-converts to +250788123456 ✅
payerPhone: "+250788123456"  // Also works ✅
```

### Payment Methods:
```javascript
// OLD WAY:
payment_method: "MoMo"  // ❌ Wrong

// NEW WAY:
payment_method: "MTN_MOMO_RWA"  // ✅ Correct
```

### Actions:
```javascript
// OLD WAY:
action: "disbursement"  // ❌ Wrong

// NEW WAY:
action: "payout"  // ✅ Correct
```

---

## ✅ SUCCESS CHECKLIST

- [ ] Using LMBTechPaymentService-Official.js
- [ ] Using server-official.js
- [ ] Server starts with "Official API" message
- [ ] Test page shows phone format info
- [ ] Phone numbers auto-convert to +250 format
- [ ] MoMo payment initiated successfully
- [ ] MoMo prompt received
- [ ] Callback shows "MOMO callback detected"
- [ ] Payment status check works

---

## 🆚 CALLBACK DIFFERENCES

### OLD (Simple):
Only handled JSON callbacks

### NEW (Dual Support):
Handles BOTH:
1. **JSON callbacks** (Mobile Money)
2. **Form data callbacks** (Card payments from Pesapal)

The server automatically detects which type and processes accordingly! 🎉

---

## 🚨 TROUBLESHOOTING

### Issue: "Invalid payment_method"
**Solution:** Make sure you're using `MTN_MOMO_RWA` not `MoMo`

### Issue: "Invalid phone format"
**Solution:** Use the new service - it auto-converts phone formats!

### Issue: "Callback not working"
**Solution:** The new callback handler supports both JSON and form data

### Issue: "Payout action not recognized"
**Solution:** Use `action: "payout"` not `action: "disbursement"`

---

## 🎉 YOU'RE READY!

The updated integration is now:
✅ Fully compliant with official API
✅ Auto-converts phone numbers
✅ Handles both MoMo and Card callbacks
✅ Uses correct payment methods
✅ Uses correct action names

**Test it now!** 🚀

```bash
npm start
# Open: http://localhost:3000/test-payment
```

---

## 📚 NEXT STEPS

1. ✅ Test with your credentials
2. ✅ Test with official test credentials
3. ✅ Verify callbacks work
4. ✅ Test card payments (optional)
5. ✅ Deploy to production

**All files are updated and ready to use!** 💪
