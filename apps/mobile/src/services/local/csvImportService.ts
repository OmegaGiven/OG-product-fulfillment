import type { ImportedOrder } from "../../domain";
import { createLocalRecordId, nowIso } from "../../utils";

export type CsvPlatform = "etsy" | "squarespace" | "ebay" | "amazon" | "unknown";

export type CsvImportResult = {
  platform: CsvPlatform;
  orders: ImportedOrder[];
  skipped: number;
  errors: string[];
};

// ── CSV tokenizer ────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "_"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const key of candidates) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "_");
    if (row[normalized] !== undefined && row[normalized] !== "") {
      return row[normalized].trim();
    }
  }
  return "";
}

// ── Platform detection ───────────────────────────────────────────────────────

function detectPlatform(headers: string[]): CsvPlatform {
  const h = headers.join(",");
  if (h.includes("order_id") && h.includes("buyer") && h.includes("ship_name")) return "etsy";
  if (h.includes("order__") || (h.includes("order_number") && h.includes("customer_email"))) return "squarespace";
  if (h.includes("sales_record_number") || h.includes("buyer_username")) return "ebay";
  if (h.includes("amazon_order_id") || h.includes("amazon-order-id")) return "amazon";
  return "unknown";
}

// ── Platform mappers ─────────────────────────────────────────────────────────

function mapEtsyRow(row: Record<string, string>): ImportedOrder | null {
  const orderId = col(row, "Order ID", "order_id");
  if (!orderId) return null;

  const name = col(row, "Ship Name", "ship_name", "Buyer", "buyer");
  const address1 = col(row, "Ship Address1", "ship_address1", "Ship Address 1");
  const city = col(row, "Ship City", "ship_city");
  const state = col(row, "Ship State", "ship_state");
  const zip = col(row, "Ship Zipcode", "ship_zipcode", "Ship Zip");
  const email = col(row, "Buyer Email", "buyer_email", "Email");
  const date = col(row, "Order Date", "order_date", "Sale Date", "sale_date");

  return {
    id: createLocalRecordId(),
    externalOrderId: orderId,
    integrationKey: "etsy",
    integrationName: "Etsy",
    orderNumber: `ETSY-${orderId}`,
    buyerName: name || "Unknown",
    buyerEmail: email || undefined,
    shippingAddress: {
      name: name || "Unknown",
      address1,
      address2: col(row, "Ship Address2", "ship_address2"),
      city,
      state,
      postalCode: zip,
      phone: ""
    },
    availableChannels: email ? ["email", "manual"] : ["manual"],
    createdAt: date ? new Date(date).toISOString() : nowIso()
  };
}

function mapSquarespaceRow(row: Record<string, string>): ImportedOrder | null {
  const orderId = col(row, "Order #", "order_number", "Order Number", "order__");
  if (!orderId) return null;

  const firstName = col(row, "Shipping First Name", "First Name", "first_name");
  const lastName = col(row, "Shipping Last Name", "Last Name", "last_name");
  const name = col(row, "Customer Name", "customer_name", "Name") || `${firstName} ${lastName}`.trim();
  const email = col(row, "Email", "Customer Email", "customer_email");
  const date = col(row, "Created On", "created_on", "Date", "Order Date");

  return {
    id: createLocalRecordId(),
    externalOrderId: orderId,
    integrationKey: "squarespace",
    integrationName: "Squarespace",
    orderNumber: `SQSP-${orderId}`,
    buyerName: name || "Unknown",
    buyerEmail: email || undefined,
    shippingAddress: {
      name: name || "Unknown",
      address1: col(row, "Shipping Address", "shipping_address", "Shipping Address 1", "Address 1"),
      address2: col(row, "Shipping Address 2", "shipping_address_2", "Address 2"),
      city: col(row, "Shipping City", "shipping_city", "City"),
      state: col(row, "Shipping State", "shipping_state", "State"),
      postalCode: col(row, "Shipping Zip", "shipping_zip", "Postal Code", "Zip"),
      phone: col(row, "Phone", "phone")
    },
    availableChannels: email ? ["email", "manual"] : ["manual"],
    createdAt: date ? new Date(date).toISOString() : nowIso()
  };
}

function mapEbayRow(row: Record<string, string>): ImportedOrder | null {
  const recordNum = col(row, "Sales Record Number", "sales_record_number", "Order Number", "order_number");
  const txId = col(row, "Transaction ID", "transaction_id");
  const orderId = recordNum || txId;
  if (!orderId) return null;

  const name = col(row, "Ship to Name", "ship_to_name", "Buyer Name", "buyer_name");
  const email = col(row, "Buyer Email", "buyer_email", "Email");
  const date = col(row, "Sale Date", "sale_date", "Paid on Date", "paid_on_date", "Date");

  return {
    id: createLocalRecordId(),
    externalOrderId: orderId,
    integrationKey: "ebay",
    integrationName: "eBay",
    orderNumber: `EBAY-${orderId}`,
    buyerName: name || col(row, "Buyer Username", "buyer_username") || "Unknown",
    buyerEmail: email || undefined,
    shippingAddress: {
      name: name || "Unknown",
      address1: col(row, "Ship to Address 1", "ship_to_address_1", "Ship to Street 1"),
      address2: col(row, "Ship to Address 2", "ship_to_address_2"),
      city: col(row, "Ship to City", "ship_to_city"),
      state: col(row, "Ship to State", "ship_to_state"),
      postalCode: col(row, "Ship to Zip", "ship_to_zip", "Zip Code"),
      phone: ""
    },
    availableChannels: email ? ["email", "manual"] : ["manual"],
    createdAt: date ? new Date(date).toISOString() : nowIso()
  };
}

function mapAmazonRow(row: Record<string, string>): ImportedOrder | null {
  const orderId =
    col(row, "amazon-order-id", "amazon_order_id", "Amazon Order ID", "order_id");
  if (!orderId) return null;

  const name = col(row, "buyer-name", "buyer_name", "Buyer Name", "recipient-name", "recipient_name");
  const email = col(row, "buyer-email", "buyer_email", "Buyer Email");
  const date = col(row, "purchase-date", "purchase_date", "Purchase Date", "Order Date");

  return {
    id: createLocalRecordId(),
    externalOrderId: orderId,
    integrationKey: "amazon",
    integrationName: "Amazon",
    orderNumber: `AMZ-${orderId}`,
    buyerName: name || "Unknown",
    buyerEmail: email || undefined,
    shippingAddress: {
      name: col(row, "recipient-name", "recipient_name", "ship-address-name") || name || "Unknown",
      address1: col(row, "ship-address-1", "ship_address_1", "Shipping Address 1"),
      address2: col(row, "ship-address-2", "ship_address_2", "Shipping Address 2"),
      city: col(row, "ship-city", "ship_city", "City"),
      state: col(row, "ship-state", "ship_state", "State"),
      postalCode: col(row, "ship-postal-code", "ship_postal_code", "Postal Code"),
      phone: ""
    },
    availableChannels: ["manual"],
    createdAt: date ? new Date(date).toISOString() : nowIso()
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function importCsvText(csvText: string): CsvImportResult {
  const { headers, rows } = parseCsv(csvText);
  const platform = detectPlatform(headers);
  const orders: ImportedOrder[] = [];
  const errors: string[] = [];
  let skipped = 0;

  const mapper =
    platform === "etsy" ? mapEtsyRow
    : platform === "squarespace" ? mapSquarespaceRow
    : platform === "ebay" ? mapEbayRow
    : platform === "amazon" ? mapAmazonRow
    : null;

  if (!mapper) {
    return {
      platform: "unknown",
      orders: [],
      skipped: rows.length,
      errors: [
        "Could not detect the platform from this CSV. Supported: Etsy, Squarespace, eBay, Amazon. Make sure you export the full orders CSV from your platform."
      ]
    };
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const order = mapper(rows[i]);
      if (order) {
        orders.push(order);
      } else {
        skipped++;
      }
    } catch {
      errors.push(`Row ${i + 2}: skipped (could not parse)`);
      skipped++;
    }
  }

  return { platform, orders, skipped, errors };
}

export async function readCsvFile(): Promise<string> {
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
    copyToCacheDirectory: true
  });

  if (result.canceled || !result.assets?.[0]) {
    throw new Error("cancelled");
  }

  const FileSystem = await import("expo-file-system/legacy");
  const uri = result.assets[0].uri;
  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8
  });

  return content;
}
