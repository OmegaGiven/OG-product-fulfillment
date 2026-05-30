import type { ImportedOrder, MessageTemplate } from "../../domain";

export const seededOrders: ImportedOrder[] = [
  {
    id: 1001,
    externalOrderId: "order_etsy_1001",
    integrationKey: "etsy",
    integrationName: "Etsy",
    orderNumber: "ETSY-1001",
    buyerName: "Avery Stone",
    buyerEmail: "avery@example.com",
    shippingAddress: {
      name: "Avery Stone",
      address1: "145 Market Street",
      address2: "Suite 9",
      city: "Savannah",
      state: "GA",
      postalCode: "31401",
      phone: "9125550133"
    },
    availableChannels: ["integration-message", "email"],
    createdAt: "2026-04-17T10:00:00.000Z"
  },
  {
    id: 2001,
    externalOrderId: "order_squarespace_2001",
    integrationKey: "squarespace",
    integrationName: "Squarespace",
    orderNumber: "SQSP-2001",
    buyerName: "Mara Lopez",
    buyerEmail: "mara@example.com",
    shippingAddress: {
      name: "Mara Lopez",
      address1: "88 River Road",
      address2: "",
      city: "Austin",
      state: "TX",
      postalCode: "78702",
      phone: "5125550178"
    },
    availableChannels: ["email"],
    createdAt: "2026-04-17T10:00:00.000Z"
  },
  {
    id: 3001,
    externalOrderId: "12-98765-54321",
    integrationKey: "ebay",
    integrationName: "eBay",
    orderNumber: "EBAY-123456789012",
    buyerName: "Jordan Park",
    buyerEmail: "jordan@example.com",
    shippingAddress: {
      name: "Jordan Park",
      address1: "220 Oak Lane",
      address2: "Apt 4B",
      city: "Portland",
      state: "OR",
      postalCode: "97201",
      phone: "5035550194"
    },
    availableChannels: ["integration-message", "email"],
    createdAt: "2026-04-17T10:00:00.000Z"
  },
  {
    id: 4001,
    externalOrderId: "114-5678901-2345678",
    integrationKey: "amazon",
    integrationName: "Amazon",
    orderNumber: "AMZ-114-5678901-2345678",
    buyerName: "Casey Williams",
    shippingAddress: {
      name: "Casey Williams",
      address1: "50 Pine Street",
      address2: "",
      city: "Denver",
      state: "CO",
      postalCode: "80203",
      phone: ""
    },
    availableChannels: ["integration-message"],
    createdAt: "2026-04-17T10:00:00.000Z"
  }
];

export function getSeededOrdersForIntegration(integrationKey: string) {
  return seededOrders.filter((order) => order.integrationKey === integrationKey);
}

export const seededTemplates: MessageTemplate[] = [
  {
    id: 1,
    name: "Default Shipment Confirmation",
    subject: "Your order {{orderNumber}} is packed",
    body:
      "Hi {{buyerName}},\n\nYour order {{orderNumber}} has been packed. We attached product and label photos for confirmation.\n\nThanks for shopping with us."
  }
];
