const methodTabs = Array.from(document.querySelectorAll('.tab'));
const paymentForm = document.getElementById('payment-form');
const submitBtn = document.getElementById('submit-btn');
const phoneField = document.getElementById('phone-field');
const phoneLabel = document.getElementById('phone-label');
const phoneInput = document.getElementById('phone');
const amountInput = document.getElementById('amount');
const serviceInput = document.getElementById('service');
const productSelect = document.getElementById('product');
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

const DEFAULT_PRODUCTS = [
  {
    id: 'momo-test-100-rwf',
    name: 'MoMo Test Product',
    amount: 100,
    currency: 'RWF',
    servicePaid: 'test_product_100_rwf'
  }
];

const history = [];
let availableProducts = [...DEFAULT_PRODUCTS];
let activeMethod = 'momo';
let latestRedirectUrl = null;

function setActiveMethod(method) {
  if (!methodConfig[method]) return;
  const previousMethod = activeMethod;
  activeMethod = method;

  methodTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.method === method);
  });

  const config = methodConfig[method];
  submitBtn.textContent = config.submitLabel;
  phoneLabel.textContent = config.phoneLabel;
  phoneField.classList.toggle('hidden', !config.needsPhone);

  const usesProducts = method !== 'payout';
  productSelect.disabled = !usesProducts;
  if (usesProducts) {
    applySelectedProduct();
    if (!getSelectedProduct() && (previousMethod === 'payout' || !serviceInput.value.trim())) {
      serviceInput.value = config.defaultService;
    }
  } else {
    serviceInput.value = config.defaultService;
  }

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

function normalizePaymentOutcome(status) {
  const normalized = extractStatusLabel(status);
  if (['success', 'completed', 'ok', 'paid', 'true'].includes(normalized)) return 'success';
  if (['pending', 'processing', 'in_progress', 'initiated'].includes(normalized)) return 'pending';
  if (['fail', 'failed', 'error', 'cancelled', 'canceled', 'declined', 'false'].includes(normalized)) return 'failed';
  return 'unknown';
}

function normalizeProducts(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => {
      const amount = Number(item?.amount);
      const servicePaid =
        (typeof item?.servicePaid === 'string' && item.servicePaid.trim())
        || (typeof item?.service_paid === 'string' && item.service_paid.trim())
        || '';
      if (!Number.isFinite(amount) || amount <= 0 || !servicePaid) {
        return null;
      }

      return {
        id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `product-${index + 1}`,
        name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Product ${index + 1}`,
        amount,
        currency: typeof item?.currency === 'string' && item.currency.trim() ? item.currency.trim().toUpperCase() : 'RWF',
        servicePaid
      };
    })
    .filter(Boolean);
}

function renderProductOptions(products) {
  const previousValue = productSelect.value;
  productSelect.innerHTML = '';

  products.forEach((product) => {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = `${product.name} - ${product.amount} ${product.currency}`;
    productSelect.appendChild(option);
  });

  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = 'Custom amount/service';
  productSelect.appendChild(customOption);

  const canKeepSelection = products.some((product) => product.id === previousValue) || previousValue === '__custom__';
  productSelect.value = canKeepSelection ? previousValue : (products[0]?.id || '__custom__');
}

function getSelectedProduct() {
  const selectedId = productSelect.value;
  if (!selectedId || selectedId === '__custom__') {
    return null;
  }

  return availableProducts.find((product) => product.id === selectedId) || null;
}

function applySelectedProduct() {
  const selected = getSelectedProduct();
  if (!selected) {
    return;
  }

  amountInput.value = String(selected.amount);
  serviceInput.value = selected.servicePaid;
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const body = await response.json();
    const serverProducts = normalizeProducts(body?.data);
    if (response.ok && serverProducts.length > 0) {
      availableProducts = serverProducts;
    }
  } catch (error) {
    // Fallback to local defaults when product endpoint is unavailable.
    availableProducts = [...DEFAULT_PRODUCTS];
  }

  renderProductOptions(availableProducts);
  if (activeMethod !== 'payout') {
    applySelectedProduct();
  }
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
    amount: amountInput.value
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
    amount: amountInput.value.trim(),
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
    const paymentOutcome = (body?.paymentOutcome || normalizePaymentOutcome(body?.status)).toUpperCase();
    const successfulText = body?.isSuccessful === true ? 'YES' : body?.isSuccessful === false ? 'NO' : 'UNKNOWN';
    const callbackText = body?.hasCallback === true ? 'YES' : body?.hasCallback === false ? 'NO' : 'UNKNOWN';
    statusResult.textContent = `HTTP ${response.status} | API ${statusLabel.toUpperCase()} | OUTCOME ${paymentOutcome} | SUCCESSFUL ${successfulText} | CALLBACK ${callbackText}${body.referenceId ? ` | Ref: ${body.referenceId}` : ''}${body.message ? ` | ${body.message}` : ''}`;
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

productSelect.addEventListener('change', () => {
  applySelectedProduct();
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
loadProducts();
renderHistory();
handleCardReturnBanner();
