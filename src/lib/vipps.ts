/**
 * Vipps ePayment API client for MVP ticket payments.
 * Uses Standard Authentication: POST /accesstoken/get with headers.
 */

const VIPPS_API_BASE = process.env.VIPPS_API_BASE || 'https://apitest.vipps.no';
const VIPPS_CLIENT_ID = process.env.VIPPS_CLIENT_ID || '';
const VIPPS_CLIENT_SECRET = process.env.VIPPS_CLIENT_SECRET || '';
const VIPPS_SUBSCRIPTION_KEY = process.env.VIPPS_SUBSCRIPTION_KEY || '';
const VIPPS_MSN = process.env.VIPPS_MSN || '';

// Token cache
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get an access token from Vipps. Caches until expiry.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${VIPPS_API_BASE}/accesstoken/get`, {
    method: 'POST',
    headers: {
      'client_id': VIPPS_CLIENT_ID,
      'client_secret': VIPPS_CLIENT_SECRET,
      'Ocp-Apim-Subscription-Key': VIPPS_SUBSCRIPTION_KEY,
      'Merchant-Serial-Number': VIPPS_MSN,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[vipps] Access token failed:', res.status, body);
    throw new Error(`Vipps access token request failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Expire 5 minutes before actual expiry for safety
  const expiresIn = (data.expires_in || 3600) - 300;
  tokenExpiresAt = Date.now() + expiresIn * 1000;

  return cachedToken!;
}

/**
 * Common headers for Vipps API calls.
 */
async function vippsHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Ocp-Apim-Subscription-Key': VIPPS_SUBSCRIPTION_KEY,
    'Merchant-Serial-Number': VIPPS_MSN,
    'Content-Type': 'application/json',
    'Vipps-System-Name': 'Singularity',
    'Vipps-System-Version': '1.0.0',
  };
}

/**
 * Create a Vipps ePayment.
 * Returns the redirect URL for the customer.
 */
export async function createPayment(
  reference: string,
  amountOre: number,
  returnUrl: string,
  idempotencyKey: string,
  paymentMethodType: 'WALLET' | 'CARD' = 'WALLET'
): Promise<string> {
  const headers = await vippsHeaders();
  headers['Idempotency-Key'] = idempotencyKey;

  const body = {
    amount: {
      value: amountOre,
      currency: 'NOK',
    },
    paymentMethod: { type: paymentMethodType },
    reference,
    returnUrl,
    userFlow: 'WEB_REDIRECT',
  };

  const res = await fetch(`${VIPPS_API_BASE}/epayment/v1/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[vipps] Create payment failed:', res.status, errorBody);
    throw new Error(`Vipps create payment failed: ${res.status}`);
  }

  const data = await res.json();
  return data.redirectUrl;
}

/**
 * Get payment status from Vipps.
 * Returns the raw Vipps payment state.
 */
export async function getPaymentStatus(reference: string): Promise<{ state: string; aggregate: any }> {
  const headers = await vippsHeaders();

  const res = await fetch(`${VIPPS_API_BASE}/epayment/v1/payments/${reference}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[vipps] Get payment status failed:', res.status, errorBody);
    throw new Error(`Vipps get payment status failed: ${res.status}`);
  }

  const data = await res.json();
  return { state: data.state, aggregate: data.aggregate };
}

/**
 * Capture an authorized Vipps ePayment.
 * Must be called after payment reaches AUTHORIZED state.
 * Uses Idempotency-Key so duplicate calls are safe.
 */
export async function capturePayment(
  reference: string,
  amountOre: number,
  idempotencyKey: string,
): Promise<void> {
  const headers = await vippsHeaders();
  headers['Idempotency-Key'] = idempotencyKey;

  const body = {
    modificationAmount: {
      value: amountOre,
      currency: 'NOK',
    },
  };

  const res = await fetch(`${VIPPS_API_BASE}/epayment/v1/payments/${reference}/capture`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[vipps] Capture payment failed:', res.status, errorBody);
    throw new Error(`Vipps capture payment failed: ${res.status}`);
  }

  console.log(`[vipps] Capture initiated for ${reference}, amount ${amountOre} øre`);
}
