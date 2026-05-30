import type { ImportedOrder } from "../../domain";
import { createLocalRecordId, nowIso } from "../../utils";
import { getEtsyTokens, saveEtsyTokens, type StoredEtsyTokens } from "./etsyTokenStore";

const ETSY_BASE = "https://api.etsy.com/v3";
const ETSY_TOKEN_URL = `${ETSY_BASE}/public/oauth/token`;

type EtsyMoney = { amount: number; divisor: number; currency_code: string };

type EtsyTransaction = {
  transaction_id: number;
  title: string;
  quantity: number;
  sku: string | null;
};

type EtsyReceipt = {
  receipt_id: number;
  is_paid: boolean;
  is_shipped: boolean;
  buyer_email: string | null;
  name: string | null;
  first_line: string | null;
  second_line: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country_iso: string | null;
  created_timestamp: number;
  transactions: EtsyTransaction[];
};

type EtsyReceiptsResponse = {
  count: number;
  results: EtsyReceipt[];
};

type EtsyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
};

type EtsyMeResponse = {
  user_id: number;
  shop_id: number;
};

function apiKey(keystring: string, sharedSecret: string) {
  return `${keystring}:${sharedSecret}`;
}

function authHeaders(keystring: string, sharedSecret: string, accessToken: string) {
  return {
    "x-api-key": apiKey(keystring, sharedSecret),
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

function throwForStatus(status: number, prefix = "Etsy API") {
  if (status === 401) throw new Error(`${prefix}: invalid or expired credentials.`);
  if (status === 403)
    throw new Error(`${prefix}: insufficient permissions. Re-connect with Etsy OAuth.`);
  if (status === 429) {
    throw new Error(`${prefix}: rate limit hit. Try again in a moment.`);
  }
  if (status >= 500) throw new Error(`${prefix}: server error (${status}). Try again later.`);
  throw new Error(`${prefix}: request failed (${status}).`);
}

function toIsoFromEpoch(epochSeconds: number) {
  return new Date(epochSeconds * 1000).toISOString();
}

function mapReceipt(
  receipt: EtsyReceipt,
  connectionId: number,
  connectionName: string
): ImportedOrder {
  const name = receipt.name ?? "Unknown";

  return {
    id: createLocalRecordId(),
    externalOrderId: String(receipt.receipt_id),
    integrationConnectionId: connectionId,
    integrationConnectionName: connectionName,
    integrationKey: "etsy",
    integrationName: "Etsy",
    orderNumber: `ETSY-${receipt.receipt_id}`,
    buyerName: name,
    buyerEmail: receipt.buyer_email ?? undefined,
    shippingAddress: {
      name,
      address1: receipt.first_line ?? "",
      address2: receipt.second_line ?? "",
      city: receipt.city ?? "",
      state: receipt.state ?? "",
      postalCode: receipt.zip ?? "",
      phone: ""
    },
    // Etsy has no messaging API; email only when available, otherwise manual
    availableChannels: receipt.buyer_email ? ["email", "manual"] : ["manual"],
    createdAt: toIsoFromEpoch(receipt.created_timestamp)
  };
}

export async function exchangeEtsyCode(
  keystring: string,
  sharedSecret: string,
  redirectUri: string,
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: keystring,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier
  });

  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-api-key": apiKey(keystring, sharedSecret)
    },
    body: body.toString()
  });

  if (!response.ok) throwForStatus(response.status, "Etsy token exchange");

  const data = (await response.json()) as EtsyTokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt
  };
}

export async function refreshEtsyTokens(
  keystring: string,
  sharedSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: keystring,
    refresh_token: refreshToken
  });

  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-api-key": apiKey(keystring, sharedSecret)
    },
    body: body.toString()
  });

  if (!response.ok) throwForStatus(response.status, "Etsy token refresh");

  const data = (await response.json()) as EtsyTokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt
  };
}

export async function getEtsyMe(
  keystring: string,
  sharedSecret: string,
  accessToken: string
): Promise<{ userId: number; shopId: number }> {
  const response = await fetch(`${ETSY_BASE}/application/users/me`, {
    headers: authHeaders(keystring, sharedSecret, accessToken)
  });

  if (!response.ok) throwForStatus(response.status, "Etsy getMe");

  const data = (await response.json()) as EtsyMeResponse;
  return { userId: data.user_id, shopId: data.shop_id };
}

// Returns a valid (refreshed if needed) access token, persisting new tokens to storage.
export async function getValidEtsyAccessToken(
  connectionId: number,
  keystring: string,
  sharedSecret: string
): Promise<{ accessToken: string; shopId: number }> {
  const stored = await getEtsyTokens(connectionId);
  if (!stored) {
    throw new Error("Etsy is not connected. Open Integrations and complete the OAuth flow.");
  }

  const expiresAt = new Date(stored.expiresAt);
  const fiveMinBuffer = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt <= fiveMinBuffer) {
    const refreshed = await refreshEtsyTokens(keystring, sharedSecret, stored.refreshToken);
    const updated: StoredEtsyTokens = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      shopId: stored.shopId
    };
    await saveEtsyTokens(connectionId, updated);
    return { accessToken: updated.accessToken, shopId: updated.shopId };
  }

  return { accessToken: stored.accessToken, shopId: stored.shopId };
}

export async function fetchEtsyOrders(
  keystring: string,
  sharedSecret: string,
  accessToken: string,
  shopId: number,
  connectionId: number,
  connectionName: string
): Promise<ImportedOrder[]> {
  const orders: ImportedOrder[] = [];
  const limit = 100;
  let offset = 0;
  let total: number | null = null;

  do {
    const params = new URLSearchParams({
      was_paid: "true",
      was_shipped: "false",
      was_canceled: "false",
      limit: String(limit),
      offset: String(offset)
    });

    const response = await fetch(
      `${ETSY_BASE}/application/shops/${shopId}/receipts?${params.toString()}`,
      { headers: authHeaders(keystring, sharedSecret, accessToken) }
    );

    if (!response.ok) throwForStatus(response.status, "Etsy orders");

    const data = (await response.json()) as EtsyReceiptsResponse;
    if (total === null) total = data.count;

    orders.push(
      ...data.results.map((receipt) => mapReceipt(receipt, connectionId, connectionName))
    );

    offset += limit;
  } while (offset < (total ?? 0));

  return orders;
}

export async function markEtsyOrderShipped(
  keystring: string,
  sharedSecret: string,
  accessToken: string,
  shopId: number,
  receiptId: string,
  trackingCode: string,
  carrierName: string
): Promise<void> {
  const response = await fetch(
    `${ETSY_BASE}/application/shops/${shopId}/receipts/${receiptId}/tracking`,
    {
      method: "POST",
      headers: authHeaders(keystring, sharedSecret, accessToken),
      body: JSON.stringify({
        tracking_code: trackingCode,
        carrier_name: carrierName,
        send_bcc: false
      })
    }
  );

  if (!response.ok && response.status !== 201) {
    throwForStatus(response.status, "Etsy mark shipped");
  }
}
