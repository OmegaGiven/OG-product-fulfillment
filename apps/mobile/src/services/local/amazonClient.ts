import type { ImportedOrder } from "../../domain";
import { createLocalRecordId, nowIso } from "../../utils";
import { getAmazonTokens, saveAmazonTokens } from "./amazonTokenStore";

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

// SP-API endpoint + AWS region by marketplace zone
const MARKETPLACE_CONFIG: Record<
  string,
  { endpoint: string; region: string; marketplaceId: string }
> = {
  US: {
    endpoint: "https://sellingpartnerapi-na.amazon.com",
    region: "us-east-1",
    marketplaceId: "ATVPDKIKX0DER"
  },
  CA: {
    endpoint: "https://sellingpartnerapi-na.amazon.com",
    region: "us-east-1",
    marketplaceId: "A2EUQ1WTGCTBG2"
  },
  MX: {
    endpoint: "https://sellingpartnerapi-na.amazon.com",
    region: "us-east-1",
    marketplaceId: "A1AM78C64UM0Y8"
  },
  UK: {
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
    region: "eu-west-1",
    marketplaceId: "A1F83G8C2ARO7P"
  },
  DE: {
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
    region: "eu-west-1",
    marketplaceId: "A1PA6795UKMFR9"
  },
  JP: {
    endpoint: "https://sellingpartnerapi-fe.amazon.com",
    region: "us-west-2",
    marketplaceId: "A1VC38T7YXB528"
  },
  AU: {
    endpoint: "https://sellingpartnerapi-fe.amazon.com",
    region: "us-west-2",
    marketplaceId: "A39IBJ37TRP1C6"
  }
};

const DEFAULT_MARKETPLACE = "US";

type LwaTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
};

type AmazonOrderAddress = {
  Name?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  AddressLine3?: string;
  City?: string;
  StateOrRegion?: string;
  PostalCode?: string;
  CountryCode?: string;
  Phone?: string;
};

type AmazonOrder = {
  AmazonOrderId: string;
  SellerOrderId?: string;
  PurchaseDate: string;
  OrderStatus: string;
  BuyerEmail?: string;
  BuyerName?: string;
  ShippingAddress?: AmazonOrderAddress;
  BillingAddress?: AmazonOrderAddress;
};

type AmazonOrdersPayload = {
  Orders: AmazonOrder[];
  NextToken?: string;
};

type AmazonApiResponse<T> = {
  payload?: T;
  errors?: Array<{ code: string; message: string; details?: string }>;
};

// --- LWA token management ---

export async function getLwaAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Amazon LWA token refresh failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as LwaTokenResponse;
  return data.access_token;
}

export async function exchangeAmazonCode(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Amazon auth code exchange failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as LwaTokenResponse;
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt
  };
}

export async function getValidAmazonAccessToken(
  connectionId: number,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const stored = await getAmazonTokens(connectionId);
  const fiveMinBuffer = new Date(Date.now() + 5 * 60 * 1000);

  if (stored && new Date(stored.expiresAt) > fiveMinBuffer) {
    return stored.accessToken;
  }

  const accessToken = await getLwaAccessToken(clientId, clientSecret, refreshToken);
  const expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString(); // 55 min (tokens expire in 60)
  await saveAmazonTokens(connectionId, { accessToken, expiresAt });
  return accessToken;
}

// --- AWS Signature V4 ---

async function sha256Hex(data: string): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto.subtle;
  const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(
  secretKey: string,
  date: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(`AWS4${secretKey}`, date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

type SignedHeaders = Record<string, string>;

async function signRequest(opts: {
  method: string;
  url: string;
  accessToken: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  region: string;
  service: string;
  body?: string;
}): Promise<SignedHeaders> {
  const { method, url, accessToken, awsAccessKeyId, awsSecretAccessKey, region, service } = opts;
  const body = opts.body ?? "";

  const parsed = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    host: parsed.host,
    "x-amz-date": amzDate,
    "x-amz-access-token": accessToken
  };

  const signedHeaderNames = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}`)
    .join("\n");

  const canonicalQueryString = Array.from(parsed.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalRequest = [
    method,
    parsed.pathname,
    canonicalQueryString,
    `${canonicalHeaders}\n`,
    signedHeaderNames,
    payloadHash
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join("\n");

  const signingKey = await getSigningKey(awsSecretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${awsAccessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaderNames}`,
    `Signature=${signature}`
  ].join(", ");

  return {
    ...headers,
    Authorization: authorization,
    "Content-Type": "application/json"
  };
}

// --- SP-API calls ---

function resolveMarketplaceConfig(marketplaceCode: string) {
  const key = marketplaceCode.toUpperCase();
  return MARKETPLACE_CONFIG[key] ?? MARKETPLACE_CONFIG[DEFAULT_MARKETPLACE];
}

function throwForStatus(status: number, prefix = "Amazon SP-API") {
  if (status === 401) throw new Error(`${prefix}: invalid credentials or expired token.`);
  if (status === 403)
    throw new Error(`${prefix}: insufficient permissions. Check IAM policy and SP-API scopes.`);
  if (status === 429) throw new Error(`${prefix}: rate limit hit. Try again in a moment.`);
  if (status >= 500) throw new Error(`${prefix}: server error (${status}). Try again later.`);
  throw new Error(`${prefix}: request failed (${status}).`);
}

function mapOrder(raw: AmazonOrder, connectionId: number, connectionName: string): ImportedOrder {
  const addr = raw.ShippingAddress ?? raw.BillingAddress;
  const name = addr?.Name ?? raw.BuyerName ?? "Unknown";

  return {
    id: createLocalRecordId(),
    externalOrderId: raw.AmazonOrderId,
    integrationConnectionId: connectionId,
    integrationConnectionName: connectionName,
    integrationKey: "amazon",
    integrationName: "Amazon",
    orderNumber: `AMZ-${raw.SellerOrderId ?? raw.AmazonOrderId}`,
    buyerName: name,
    buyerEmail: raw.BuyerEmail,
    shippingAddress: {
      name,
      address1: addr?.AddressLine1 ?? "",
      address2: [addr?.AddressLine2, addr?.AddressLine3].filter(Boolean).join(", "),
      city: addr?.City ?? "",
      state: addr?.StateOrRegion ?? "",
      postalCode: addr?.PostalCode ?? "",
      phone: addr?.Phone ?? ""
    },
    availableChannels: ["integration-message"],
    createdAt: raw.PurchaseDate ?? nowIso()
  };
}

export async function fetchAmazonOrders(
  accessToken: string,
  awsAccessKeyId: string,
  awsSecretAccessKey: string,
  marketplaceCode: string,
  connectionId: number,
  connectionName: string
): Promise<ImportedOrder[]> {
  const { endpoint, region, marketplaceId } = resolveMarketplaceConfig(marketplaceCode);
  const service = "execute-api";
  const orders: ImportedOrder[] = [];
  let nextToken: string | undefined;

  do {
    const params = new URLSearchParams({
      MarketplaceIds: marketplaceId,
      OrderStatuses: "Unshipped,PartiallyShipped"
    });
    if (nextToken) params.set("NextToken", nextToken);

    const url = `${endpoint}/orders/v0/orders?${params.toString()}`;
    const signedHeaders = await signRequest({
      method: "GET",
      url,
      accessToken,
      awsAccessKeyId,
      awsSecretAccessKey,
      region,
      service
    });

    const response = await fetch(url, { headers: signedHeaders });

    if (!response.ok) throwForStatus(response.status);

    const data = (await response.json()) as AmazonApiResponse<AmazonOrdersPayload>;

    if (data.errors?.length) {
      throw new Error(`Amazon API error: ${data.errors[0].message}`);
    }

    const payload = data.payload;
    if (!payload) break;

    orders.push(...payload.Orders.map((raw) => mapOrder(raw, connectionId, connectionName)));
    nextToken = payload.NextToken;
  } while (nextToken);

  return orders;
}

export async function confirmAmazonShipment(
  accessToken: string,
  awsAccessKeyId: string,
  awsSecretAccessKey: string,
  marketplaceCode: string,
  orderId: string,
  trackingNumber?: string,
  carrierCode?: string
): Promise<void> {
  const { endpoint, region, marketplaceId } = resolveMarketplaceConfig(marketplaceCode);
  const service = "execute-api";

  const body = JSON.stringify({
    marketplaceId,
    ...(trackingNumber
      ? {
          packageDetail: {
            packageReferenceId: "1",
            carrierCode: carrierCode ?? "Other",
            trackingNumber
          }
        }
      : {})
  });

  const url = `${endpoint}/orders/v0/orders/${orderId}/shipment`;
  const signedHeaders = await signRequest({
    method: "POST",
    url,
    accessToken,
    awsAccessKeyId,
    awsSecretAccessKey,
    region,
    service,
    body
  });

  const response = await fetch(url, {
    method: "POST",
    headers: signedHeaders,
    body
  });

  // 200 or 204 is success
  if (!response.ok && response.status !== 204) {
    throwForStatus(response.status, "Amazon confirm shipment");
  }
}
