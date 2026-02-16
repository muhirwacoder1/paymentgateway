# 🔄 MIGRATION GUIDE: From Initial Version to Official API

## 📋 What Changed?

I created an initial implementation based on the first documentation, but now we have the **official API documentation** with some important differences.

---

## 🆚 COMPARISON TABLE

| Feature | Initial Version | ✅ Official API |
|---------|----------------|-----------------|
| **MoMo Payment Method** | `"MoMo"` | `"MTN_MOMO_RWA"` |
| **Card Payment Method** | `"Card"` | `"card"` |
| **Phone Format** | `"0788123456"` | `"+250788123456"` |
| **Payout Action** | `"disbursement"` | `"payout"` |
| **Card URL Field** | `card_url` | `card_redirect_url` |
| **API Endpoint** | `.../api` | `.../api.php` |
| **Callback Support** | JSON only | JSON + Form Data |

---

## 🚀 QUICK MIGRATION (3 Steps)

### Step 1: Use New Service File

Replace your current service file with the official version:

```bash
# Option A: Rename files
mv LMBTechPaymentService.js LMBTechPaymentService-OLD.js
mv LMBTechPaymentService-Official.js LMBTechPaymentService.js

# Option B: Update require statement in server.js
# Change: require('./LMBTechPaymentService')
# To: require('./LMBTechPaymentService-Official')
```

### Step 2: Use New Server File

```bash
# Option A: Rename files
mv server.js server-OLD.js
mv server-official.js server.js

# Option B: Just run the new server
node server-official.js
```

### Step 3: Update package.json (if needed)

```json
{
  "scripts": {
    "start": "node server-official.js",
    "dev": "nodemon server-official.js"
  }
}
```

**That's it!** Your credentials stay the same. ✅

---

## 📝 CODE CHANGES REQUIRED

### If You're Using the Service Directly:

#### OLD CODE:
```javascript
await paymentService.collectPayment({
  email: 'test@example.com',
  name: 'John Doe',
  amount: 1000,
  payerPhone: '0788123456',  // Old format
  servicePaid: 'order',
  callbackUrl: 'https://...'
});
```

#### NEW CODE (Official API):
```javascript
await paymentService.collectPayment({
  email: 'test@example.com',
  name: 'John Doe',
  amount: 1000,
  payerPhone: '0788123456',  // ✅ Auto-converts to +250 format!
  servicePaid: 'order',
  callbackUrl: 'https://...'
});
```

**Good news:** The new service **automatically converts** phone formats! 🎉
You can use `0788123456` and it will convert to `+250788123456`

---

### For Payouts:

#### OLD CODE:
```javascript
// Won't work with official API
const result = await paymentService.sendMoney({
  action: 'disbursement',  // ❌ Wrong
  // ...
});
```

#### NEW CODE:
```javascript
// Works with official API
const result = await paymentService.sendMoney({
  // action is handled automatically as 'payout' ✅
  email: 'test@example.com',
  name: 'John Doe',
  amount: 500,
  recipientPhone: '0788123456',  // Auto-converts
  servicePaid: 'refund',
  callbackUrl: 'https://...'
});
```

---

### For Card Payments:

#### OLD CODE:
```javascript
await paymentService.initiateCardPayment({
  // ...
  cardUrl: 'https://...',  // ❌ Wrong field name
});
```

#### NEW CODE:
```javascript
await paymentService.initiateCardPayment({
  // ...
  cardRedirectUrl: 'https://...',  // ✅ Correct field name
});
```

---

## 🔧 CALLBACK HANDLER UPDATES

### OLD: JSON Only

The initial version only handled JSON callbacks:

```javascript
app.post('/callback', (req, res) => {
  const { reference_id, transaction_id, status } = req.body;
  // Only JSON format supported
});
```

### NEW: JSON + Form Data

The official version handles BOTH formats:

```javascript
app.post('/callback', (req, res) => {
  // Automatically detects:
  // - JSON callbacks (Mobile Money)
  // - Form data callbacks (Card via Pesapal)
  
  if (req.body.pesapal_merchant_reference) {
    // Card payment callback (Form Data)
  } else if (req.body.reference_id) {
    // Mobile Money callback (JSON)
  }
});
```

**No changes needed if using the new server file!** ✅

---

## 📱 PHONE NUMBER AUTO-CONVERSION

### The Problem (Old Version):
```javascript
// Had to manually format phone numbers
let phone = '0788123456';
if (phone.startsWith('0')) {
  phone = '+250' + phone.substring(1);
}
```

### The Solution (New Version):
```javascript
// Automatic conversion!
payerPhone: '0788123456'     // → +250788123456
payerPhone: '788123456'      // → +250788123456  
payerPhone: '250788123456'   // → +250788123456
payerPhone: '+250788123456'  // → +250788123456 (no change)
```

All formats work! The service handles conversion automatically. 🎉

---

## ✅ WHAT STAYS THE SAME

Good news - most things don't change:

- ✅ **Environment variables** - Same credentials
- ✅ **API endpoints** - Same routes (`/api/payment/momo`, etc.)
- ✅ **Response format** - Same structure
- ✅ **Workflow** - Same payment flow
- ✅ **Frontend code** - No changes needed

---

## 🎯 TESTING AFTER MIGRATION

### Quick Test:

```bash
# 1. Start server
npm start

# 2. Check it says "Official API"
# Expected: "🚀 LMBTech Payment Server Running! (Official API)"

# 3. Visit test page
# http://localhost:3000/test-payment

# 4. Test payment with ANY phone format
# All of these work:
# - 0788123456
# - 788123456
# - +250788123456
# - 250788123456
```

---

## 🚨 COMMON MIGRATION ISSUES

### Issue 1: "Invalid payment_method"
**Cause:** Still using old service with `"MoMo"` or `"Card"`
**Fix:** Use official service - it sends `"MTN_MOMO_RWA"` and `"card"`

### Issue 2: "Invalid phone format"
**Cause:** API received wrong phone format
**Fix:** Use official service - it auto-converts all formats to `+250`

### Issue 3: "Action not recognized"
**Cause:** Using `"disbursement"` instead of `"payout"`
**Fix:** Use official service - it uses correct action names

### Issue 4: Callbacks not working
**Cause:** Only handling JSON format
**Fix:** Use official server - handles both JSON and Form Data

---

## 📊 BEFORE VS AFTER

### BEFORE (Initial Version):
```javascript
// Manual phone formatting
const phone = '+250' + payerPhone.substring(1);

// Manual payment_method selection
const method = isMomo ? 'MoMo' : 'Card';

// Manual action selection
const action = isPayout ? 'disbursement' : 'pay';

// Only JSON callbacks
if (req.body.reference_id) { /* handle */ }
```

### AFTER (Official Version):
```javascript
// Automatic phone formatting
payerPhone: '0788123456'  // Any format works!

// Correct payment_method automatically
// MTN_MOMO_RWA or card

// Correct action automatically
// payout or pay

// Both callback formats
// JSON (MoMo) + Form Data (Card)
```

**Everything is cleaner and more robust!** 🎉

---

## 🎬 MIGRATION STEPS (Detailed)

### Step 1: Backup Current Files
```bash
mkdir backup
cp *.js backup/
cp .env backup/
```

### Step 2: Download New Files
You already have:
- `LMBTechPaymentService-Official.js`
- `server-official.js`
- `OFFICIAL-API-TESTING-GUIDE.md`

### Step 3: Replace Files
```bash
# Rename or replace
mv LMBTechPaymentService.js LMBTechPaymentService-v1.js
mv LMBTechPaymentService-Official.js LMBTechPaymentService.js

mv server.js server-v1.js
mv server-official.js server.js
```

### Step 4: Keep Your .env
```bash
# Don't touch .env - it's the same!
```

### Step 5: Test
```bash
npm start
# Visit: http://localhost:3000/test-payment
# Try a test payment
```

### Step 6: Update Frontend (if needed)
**Usually no changes needed!** The API endpoints stay the same.

If you call the service directly:
```javascript
// No changes needed in most cases!
// The service handles phone conversion automatically

// Just make sure you're using the new service:
const paymentService = new LMBTechPaymentService(
  process.env.LMBTECH_APP_KEY,
  process.env.LMBTECH_SECRET_KEY
);
```

---

## ✅ POST-MIGRATION CHECKLIST

- [ ] New service file in place
- [ ] New server file running
- [ ] Server shows "Official API" in startup message
- [ ] Test page loads correctly
- [ ] Phone format info displayed
- [ ] Test payment works
- [ ] MoMo prompt received
- [ ] Callback logs show correct format
- [ ] Status check works
- [ ] All API endpoints responding

---

## 🆘 ROLLBACK PLAN

If something goes wrong:

```bash
# Restore from backup
cp backup/LMBTechPaymentService.js ./
cp backup/server.js ./

# Restart
npm start
```

---

## 🎉 BENEFITS OF MIGRATION

1. ✅ **Official API compliance** - Matches LMBTech documentation exactly
2. ✅ **Auto phone conversion** - No manual formatting needed
3. ✅ **Dual callback support** - JSON + Form Data
4. ✅ **Correct field names** - All official names used
5. ✅ **Better error handling** - More robust
6. ✅ **Future-proof** - Aligned with official docs

---

## 📞 NEED HELP?

If you encounter issues during migration:

1. Check the `OFFICIAL-API-TESTING-GUIDE.md`
2. Compare your old code with examples above
3. Test with the test page first
4. Check server logs for detailed errors
5. Verify your credentials in .env

**Migration should take < 5 minutes!** ⏱️

---

## 🚀 READY TO MIGRATE?

```bash
# Quick migration commands:
mv LMBTechPaymentService-Official.js LMBTechPaymentService.js
mv server-official.js server.js
npm start

# Test immediately:
# http://localhost:3000/test-payment
```

**You're all set!** 🎉
