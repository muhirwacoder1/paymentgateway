const methodTabs = Array.from(document.querySelectorAll('.tab'));
const paymentForm = document.getElementById('payment-form');
const submitBtn = document.getElementById('submit-btn');
const phoneField = document.getElementById('phone-field');
const phoneLabel = document.getElementById('phone-label');
const phoneInput = document.getElementById('phone');
const serviceInput = document.getElementById('service');
const referenceInput = document.getElementById('referenceId');

const resultCard = document.getElementById('result-card');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const resultReference = document.getElementById('result-reference');
const resultStatus = document.getElementById('result-status');
const resultHttp = document.getElementById('result-http');
const rawJson = document.getElementById('raw-json');
const openRedirectBtn = document.getElementById('open-redirect');
const copyReferenceBtn = document.getElementById('copy-reference');

const statusForm = document.getElementById('status-form');
const statusReferenceInput = document.getElementById('status-reference');
const statusResult = document.getElementById('status-result');
const historyList = document.getElementById('history-list');
const returnBanner = document.getElementById('return-banner');

const methodConfig = {
  momo: {
    endpoint: '/api/payment/momo',
    submitLabel: 'Initiate MoMo Payment',
    needsPhone: true,
    phoneLabel: 'Payer Phone',
    defaultService: 'order_123'
  },
  card: {
    endpoint: '/api/payment/card',
    submitLabel: 'Create Card Checkout',
    needsPhone: false,
    phoneLabel: 'Payer Phone',
    defaultService: 'order_123'
  },
  payout: {
    endpoint: '/api/payout',
    submitLabel: 'Initiate Payout',
    needsPhone: true,
    phoneLabel: 'Recipient Phone',
    defaultService: 'payout'
  }
};

const history = [];
let activeMethod = 'momo';
let latestRedirectUrl = null;

function setActiveMethod(method) {
  if (!methodConfig[method]) return;
  activeMethod = method;

  methodTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.method === method);
  });

  const config = methodConfig[method];
  submitBtn.textContent = config.submitLabel;
  phoneLabel.textContent = config.phoneLabel;
  serviceInput.value = config.defaultService;
  phoneField.classList.toggle('hidden', !config.needsPhone);

  if (!config.needsPhone) {
    phoneInput.value = '';
  } else if (!phoneInput.value) {
    phoneInput.value = '0785085214';
  }
}

function extractStatusLabel(status) {
  if (typeof status === 'boolean') return status ? 'success' : 'fail';
  if (typeof status === 'number') return status === 1 ? 'success' : 'fail';
  if (typeof status === 'string' && status.trim()) return status.trim().toLowerCase();
  return 'unknown';
}

function statusClass(statusLabel) {
  if (statusLabel === 'success') return 'success';
  if (statusLabel === 'pending') return 'pending';
  if (statusLabel === 'fail' || statusLabel === 'failed' || statusLabel === 'error') return 'failed';
  return 'neutral';
}

function renderResult(httpStatus, body) {
  const statusLabel = extractStatusLabel(body?.status);
  const referenceId = body?.referenceId || body?.data?.reference_id || body?.data?.data?.reference_id || '-';
  const message = body?.message || 'No message from API';
  const success = Boolean(body?.success);

  resultCard.className = `result-card ${statusClass(statusLabel)}`;
  resultTitle.textContent = success ? 'Request accepted' : 'Request not accepted';
  resultMessage.textContent = message;
  resultReference.textContent = referenceId;
  resultStatus.textContent = statusLabel;
  resultHttp.textContent = String(httpStatus);
  rawJson.textContent = JSON.stringify(body, null, 2);

  latestRedirectUrl = body?.redirectUrl || body?.data?.redirect_url || body?.data?.data?.redirect_url || null;
  openRedirectBtn.classList.toggle('hidden', !latestRedirectUrl);
  copyReferenceBtn.disabled = !referenceId || referenceId === '-';

  if (referenceId && referenceId !== '-') {
    statusReferenceInput.value = referenceId;
  }

  history.unshift({
    when: new Date().toLocaleTimeString(),
    method: activeMethod,
    status: statusLabel,
    referenceId,
    amount: document.getElementById('amount').value
  });

  if (history.length > 8) {
    history.pop();
  }
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-item">No requests yet.</li>';
    return;
  }

  historyList.innerHTML = history
    .map((item) => {
      return `
        <li class="history-item">
          <p class="history-line"><span class="history-key">Time</span><span class="history-value">${item.when}</span></p>
          <p class="history-line"><span class="history-key">Method</span><span class="history-value">${item.method}</span></p>
          <p class="history-line"><span class="history-key">Status</span><span class="history-value">${item.status}</span></p>
          <p class="history-line"><span class="history-key">Reference</span><span class="history-value">${item.referenceId}</span></p>
          <p class="history-line"><span class="history-key">Amount</span><span class="history-value">${item.amount} RWF</span></p>
        </li>
      `;
    })
    .join('');
}

function buildPayload() {
  const payload = {
    email: document.getElementById('email').value.trim(),
    name: document.getElementById('name').value.trim(),
    amount: document.getElementById('amount').value.trim(),
    servicePaid: serviceInput.value.trim()
  };

  const referenceId = referenceInput.value.trim();
  if (referenceId) {
    payload.referenceId = referenceId;
  }

  if (activeMethod === 'momo') {
    payload.payerPhone = phoneInput.value.trim();
  }

  if (activeMethod === 'card') {
    payload.cardRedirectUrl = `${window.location.origin}/card-return`;
  }

  if (activeMethod === 'payout') {
    payload.recipientPhone = phoneInput.value.trim();
  }

  return payload;
}

async function submitPayment(event) {
  event.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    const config = methodConfig[activeMethod];
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload())
    });

    const body = await response.json();
    renderResult(response.status, body);
  } catch (error) {
    renderResult(500, {
      success: false,
      status: 'fail',
      message: error.message || 'Network error'
    });
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = methodConfig[activeMethod].submitLabel;
  }
}

async function lookupStatus(event) {
  event.preventDefault();
  const reference = statusReferenceInput.value.trim();
  if (!reference) return;

  statusResult.textContent = 'Checking status...';

  try {
    const response = await fetch(`/api/payment/status/${encodeURIComponent(reference)}`);
    const body = await response.json();
    const statusLabel = extractStatusLabel(body?.status);
    statusResult.textContent = `HTTP ${response.status} | ${statusLabel.toUpperCase()} | ${body.message || 'No message'}${body.referenceId ? ` | Ref: ${body.referenceId}` : ''}`;
  } catch (error) {
    statusResult.textContent = `Lookup failed: ${error.message}`;
  }
}

function handleCardReturnBanner() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('reference_id');
  const tx = params.get('pesapal_transaction_tracking_id');
  const responseData = params.get('pesapal_response_data');

  if (!ref && !tx && !responseData) return;

  returnBanner.classList.remove('hidden');
  returnBanner.textContent = `Card return received${ref ? ` | Reference: ${ref}` : ''}${responseData ? ` | State: ${responseData}` : ''}${tx ? ` | Tx: ${tx}` : ''}`;

  if (ref) {
    referenceInput.value = ref;
    statusReferenceInput.value = ref;
  }
}

methodTabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveMethod(tab.dataset.method));
});

paymentForm.addEventListener('submit', submitPayment);
statusForm.addEventListener('submit', lookupStatus);

openRedirectBtn.addEventListener('click', () => {
  if (!latestRedirectUrl) return;
  window.open(latestRedirectUrl, '_blank', 'noopener,noreferrer');
});

copyReferenceBtn.addEventListener('click', async () => {
  const ref = resultReference.textContent;
  if (!ref || ref === '-') return;
  await navigator.clipboard.writeText(ref);
  copyReferenceBtn.textContent = 'Copied';
  setTimeout(() => {
    copyReferenceBtn.textContent = 'Copy Reference';
  }, 1200);
});

setActiveMethod(activeMethod);
renderHistory();
handleCardReturnBanner();
