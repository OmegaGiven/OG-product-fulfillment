import type { ImportedOrder } from "../../domain";
import { createLocalRecordId, nowIso } from "../../utils";

const SQSP_BASE = "https://api.squarespace.com/1.0";
const USER_AGENT = "ProductFulfillment/1.0";

type SqspAddress = {
  firstName?: string;
  lastName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
};

type SqspOrder = {
  id: string;
  orderNumber: number;
  createdOn: string;
  customerEmail?: string;
  fulfillmentStatus: string;
  shippingAddress?: SqspAddress;
  billingAddress?: SqspAddress;
};

type SqspOrdersResponse = {
  result: SqspOrder[];
  pagination: {
    hasNextPage: boolean;
    nextPageCursor?: string;
  };
};

function combineName(addr?: SqspAddress) {
  return [addr?.firstName, addr?.lastName].filter(Boolean).join(" ").trim();
}

function mapOrder(
  raw: SqspOrder,
  connectionId: number,
  connectionName: string
): ImportedOrder {
  const addr = raw.shippingAddress ?? raw.billingAddress;
  const buyerName = combineName(addr) || combineName(raw.billingAddress) || "Unknown";

  return {
    id: createLocalRecordId(),
    externalOrderId: raw.id,
    integrationConnectionId: connectionId,
    integrationConnectionName: connectionName,
    integrationKey: "squarespace",
    integrationName: "Squarespace",
    orderNumber: `SQSP-${raw.orderNumber}`,
    buyerName,
    buyerEmail: raw.customerEmail,
    shippingAddress: {
      name: buyerName,
      address1: addr?.address1 ?? "",
      address2: addr?.address2 ?? "",
      city: addr?.city ?? "",
      state: addr?.state ?? "",
      postalCode: addr?.postalCode ?? "",
      phone: addr?.phone ?? ""
    },
    availableChannels: raw.customerEmail
      ? ["integration-message", "email"]
      : ["integration-message", "manual"],
    createdAt: raw.createdOn ?? nowIso()
  };
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json"
  };
}

function throwForStatus(status: number) {
  if (status === 401) throw new Error("Squarespace API key invalid or expired.");
  if (status === 403)
    throw new Error(
      "Squarespace API key lacks order permission. Ensure Commerce Advanced plan and Orders read scope."
    );
  if (status === 429)
    throw new Error("Squarespace rate limit hit. Wait 1 minute and try again.");
  if (status >= 500)
    throw new Error(`Squarespace server error (${status}). Try again later.`);
  throw new Error(`Squarespace API error (${status}).`);
}

function idempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function fetchSquarespaceOrders(
  apiKey: string,
  connectionId: number,
  connectionName: string
): Promise<ImportedOrder[]> {
  const orders: ImportedOrder[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ fulfillmentStatus: "PENDING" });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`${SQSP_BASE}/commerce/orders?${params.toString()}`, {
      headers: authHeaders(apiKey)
    });

    if (!response.ok) throwForStatus(response.status);

    const data = (await response.json()) as SqspOrdersResponse;
    orders.push(...data.result.map((raw) => mapOrder(raw, connectionId, connectionName)));
    cursor = data.pagination.hasNextPage ? data.pagination.nextPageCursor : undefined;
  } while (cursor);

  return orders;
}

export async function fulfillSquarespaceOrder(
  apiKey: string,
  externalOrderId: string,
  opts?: { trackingNumber?: string; carrierName?: string; sendNotification?: boolean }
): Promise<void> {
  const body: Record<string, unknown> = { shipDate: nowIso() };
  if (opts?.trackingNumber) body.trackingNumber = opts.trackingNumber;
  if (opts?.carrierName) body.carrierName = opts.carrierName;
  body.sendNotification = opts?.sendNotification ?? false;

  const response = await fetch(
    `${SQSP_BASE}/commerce/orders/${externalOrderId}/fulfillments`,
    {
      method: "POST",
      headers: {
        ...authHeaders(apiKey),
        "Idempotency-Key": idempotencyKey()
      },
      body: JSON.stringify(body)
    }
  );

  // 204 No Content is the success response for this endpoint
  if (!response.ok && response.status !== 204) {
    throwForStatus(response.status);
  }
}
