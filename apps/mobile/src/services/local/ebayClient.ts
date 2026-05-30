import type { ImportedOrder } from "../../domain";
import { createLocalRecordId, nowIso } from "../../utils";
import { getEbayTokens, saveEbayTokens, type StoredEbayTokens } from "./ebayTokenStore";

const EBAY_BASE = "https://api.ebay.com";
const EBAY_TOKEN_URL = `${EBAY_BASE}/identity/v1/oauth2/token`;
const EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";

export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment"
];

type EbayTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in?: number;
};

type EbayAddress = {
  fullName?: string;
  primaryPhone?: { phoneNumber?: string };
  email?: string;
  contactAddress?: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    countryCode?: string;
  };
};

type EbayOrder = {
  orderId: string;
  legacyOrderId?: string;
  creationDate: string;
  orderFulfillmentStatus: string;
  orderPaymentStatus: string;
  buyer?: { username?: string };
  fulfillmentStartInstructions?: Array<{
    fulfillmentInstructionsType?: string;
    shippingStep?: { shipTo?: EbayAddress };
  }>;
  lineItems?: Array<{
    lineItemId: string;
    title?: string;
    sku?: string | null;
    quantity: number;
  }>;
};

type EbayOrdersResponse = {
  orders?: EbayOrder[];
  total?: number;
  next?: string;
  href?: string;
  limit?: number;
  offset?: number;
};

function basicAuthHeader(clientId: string, clientSecret: string) {
  const credentials = `${clientId}:${clientSecret}`;
  const encoded = btoa(credentials);
  return `Basic ${encoded}`;
}

function throwForStatus(status: number, prefix = "eBay API") {
  if (status === 401) throw new Error(`${prefix}: invalid or expired credentials.`);
  if (status === 403) throw new Error(`${prefix}: insufficient permissions. Re-connect via OAuth.`);
  if (status === 404) throw new Error(`${prefix}: resource not found (${status}).`);
  if (status === 429) throw new Error(`${prefix}: rate limit hit. Try again in a moment.`);
  if (status >= 500) throw new Error(`${prefix}: server error (${status}). Try again later.`);
  throw new Error(`${prefix}: request failed (${status}).`);
}

function mapOrder(raw: EbayOrder, connectionId: number, connectionName: string): ImportedOrder {
  const shipTo = raw.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
  const addr = shipTo?.contactAddress;
  const name = shipTo?.fullName ?? raw.buyer?.username ?? "Unknown";
  const email = shipTo?.email;

  return {
    id: createLocalRecordId(),
    externalOrderId: raw.orderId,
    integrationConnectionId: connectionId,
    integrationConnectionName: connectionName,
    integrationKey: "ebay",
    integrationName: "eBay",
    orderNumber: `EBAY-${raw.legacyOrderId ?? raw.orderId}`,
    buyerName: name,
    buyerEmail: email,
    shippingAddress: {
      name,
      address1: addr?.addressLine1 ?? "",
      address2: addr?.addressLine2 ?? "",
      city: addr?.city ?? "",
      state: addr?.stateOrProvince ?? "",
      postalCode: addr?.postalCode ?? "",
      phone: shipTo?.primaryPhone?.phoneNumber ?? ""
    },
    availableChannels: ["integration-message", ...(email ? (["email"] as const) : [])],
    createdAt: raw.creationDate ?? nowIso()
  };
}

export function buildEbayAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: EBAY_SCOPES.join(" "),
    state
  });
  return `${EBAY_AUTH_URL}?${query.toString()}`;
}

export async function exchangeEbayCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(clientId, clientSecret)
    },
    body: body.toString()
  });

  if (!response.ok) throwForStatus(response.status, "eBay token exchange");

  const data = (await response.json()) as EbayTokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt
  };
}

async function refreshEbayTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: EBAY_SCOPES.join(" ")
  });

  const response = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(clientId, clientSecret)
    },
    body: body.toString()
  });

  if (!response.ok) throwForStatus(response.status, "eBay token refresh");

  const data = (await response.json()) as EbayTokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt
  };
}

export async function getValidEbayAccessToken(
  connectionId: number,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const stored = await getEbayTokens(connectionId);
  if (!stored) {
    throw new Error("eBay is not connected. Open Integrations and complete the OAuth flow.");
  }

  const expiresAt = new Date(stored.expiresAt);
  const fiveMinBuffer = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt <= fiveMinBuffer) {
    const refreshed = await refreshEbayTokens(clientId, clientSecret, stored.refreshToken);
    const updated: StoredEbayTokens = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt
    };
    await saveEbayTokens(connectionId, updated);
    return updated.accessToken;
  }

  return stored.accessToken;
}

export async function fetchEbayOrders(
  accessToken: string,
  connectionId: number,
  connectionName: string
): Promise<ImportedOrder[]> {
  const orders: ImportedOrder[] = [];
  let offset = 0;
  const limit = 200;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      filter: "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}",
      limit: String(limit),
      offset: String(offset)
    });

    const response = await fetch(
      `${EBAY_BASE}/sell/fulfillment/v1/order?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.ok) throwForStatus(response.status, "eBay orders");

    const data = (await response.json()) as EbayOrdersResponse;
    const batch = data.orders ?? [];
    orders.push(...batch.map((raw) => mapOrder(raw, connectionId, connectionName)));

    const total = data.total ?? 0;
    offset += limit;
    hasMore = batch.length === limit && offset < total;
  }

  return orders;
}

export async function markEbayOrderShipped(
  accessToken: string,
  orderId: string,
  lineItems: Array<{ lineItemId: string; quantity: number }>,
  trackingNumber?: string,
  carrierCode?: string
): Promise<void> {
  const body: Record<string, unknown> = {
    lineItems,
    shippedDate: nowIso()
  };
  if (trackingNumber) body.trackingNumber = trackingNumber;
  if (carrierCode) body.shippingCarrierCode = carrierCode;

  const response = await fetch(
    `${EBAY_BASE}/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok && response.status !== 201) {
    throwForStatus(response.status, "eBay mark shipped");
  }
}
