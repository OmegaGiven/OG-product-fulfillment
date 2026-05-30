import type { ImportedOrder } from "../../domain";
import type { IntegrationAuthService, OrderSyncService } from "../interfaces";

import type { LocalStorageService } from "./localStorageService";
import { logApiEvent } from "./apiLogger";
import { getSeededOrdersForIntegration } from "./seedData";
import { fetchSquarespaceOrders } from "./squarespaceClient";
import { fetchEtsyOrders, getValidEtsyAccessToken } from "./etsyClient";
import { fetchEbayOrders, getValidEbayAccessToken } from "./ebayClient";
import { fetchAmazonOrders, getValidAmazonAccessToken } from "./amazonClient";

export class LocalOrderSyncService implements OrderSyncService {
  constructor(
    private storageService: LocalStorageService,
    private integrationAuthService: IntegrationAuthService
  ) {}

  async syncOrders(connectionId?: number) {
    logApiEvent("orders", "syncOrders", "request", {
      connectionId: connectionId ?? "all"
    });
    const connections = await this.integrationAuthService.listConnections();
    const existingOrders = await this.storageService.listOrders();

    const targetConnections = connectionId
      ? connections.filter((connection) => connection.connectionId === connectionId)
      : connections;

    const syncedByConnection = await Promise.all(
      targetConnections.map(async (connection) => {
        const orders = await this.syncConnection(connection);
        await this.integrationAuthService.recordSyncResult(connection.connectionId, orders.length);
        return {
          connectionId: connection.connectionId,
          orders
        };
      })
    );

    const replacedKeys = new Set(syncedByConnection.map((entry) => entry.connectionId));
    const preservedOrders = existingOrders.filter(
      (order) => !order.integrationConnectionId || !replacedKeys.has(order.integrationConnectionId)
    );
    const nextOrders = [
      ...preservedOrders,
      ...syncedByConnection.flatMap((entry) => entry.orders)
    ];

    await this.storageService.replaceOrders(nextOrders);
    logApiEvent("orders", "syncOrders", "response", {
      connectionId: connectionId ?? "all",
      connectionCount: targetConnections.length,
      preservedOrderCount: preservedOrders.length,
      syncedOrderCount: syncedByConnection.reduce((sum, entry) => sum + entry.orders.length, 0),
      totalOrderCount: nextOrders.length,
      connectionSummaries: syncedByConnection.map((entry) => ({
        connectionId: entry.connectionId,
        orderCount: entry.orders.length
      }))
    });
    return nextOrders;
  }

  private async syncConnection(connection: {
    connectionId: number;
    connectionName: string;
    integrationKey: string;
    integrationName: string;
    mode: "mock" | "live";
  }): Promise<ImportedOrder[]> {
    logApiEvent("orders", "syncConnection", "request", {
      connectionId: connection.connectionId,
      connectionName: connection.connectionName,
      integrationKey: connection.integrationKey,
      mode: connection.mode
    });

    if (connection.mode === "mock") {
      const orders = getSeededOrdersForIntegration(connection.integrationKey).map((order) => ({
        ...order,
        id: Number(`${connection.connectionId}${order.id}`),
        integrationConnectionId: connection.connectionId,
        integrationConnectionName: connection.connectionName,
        integrationName: connection.integrationName
      }));
      logApiEvent("orders", "syncConnection", "response", {
        connectionId: connection.connectionId,
        integrationKey: connection.integrationKey,
        mode: connection.mode,
        returnedOrderCount: orders.length,
        source: "seeded-orders"
      });
      return orders;
    }

    if (connection.integrationKey === "squarespace") {
      return this.syncSquarespaceConnection(connection);
    }

    if (connection.integrationKey === "etsy") {
      return this.syncEtsyConnection(connection);
    }

    if (connection.integrationKey === "ebay") {
      return this.syncEbayConnection(connection);
    }

    if (connection.integrationKey === "amazon") {
      return this.syncAmazonConnection(connection);
    }

    logApiEvent("orders", "syncConnection", "response", {
      connectionId: connection.connectionId,
      integrationKey: connection.integrationKey,
      mode: connection.mode,
      returnedOrderCount: 0,
      source: "live-not-implemented"
    });
    return [];
  }

  private async syncEtsyConnection(connection: {
    connectionId: number;
    connectionName: string;
  }): Promise<ImportedOrder[]> {
    logApiEvent("orders", "syncEtsyConnection", "request", {
      connectionId: connection.connectionId
    });

    const creds = await this.integrationAuthService.getCredentials(connection.connectionId);
    if (!creds?.keystring || !creds.sharedSecret) {
      logApiEvent("orders", "syncEtsyConnection", "error", {
        connectionId: connection.connectionId,
        reason: "missing-credentials"
      });
      throw new Error("Etsy keystring and shared secret not configured.");
    }

    const { accessToken, shopId } = await getValidEtsyAccessToken(
      connection.connectionId,
      creds.keystring,
      creds.sharedSecret
    );

    const orders = await fetchEtsyOrders(
      creds.keystring,
      creds.sharedSecret,
      accessToken,
      shopId,
      connection.connectionId,
      connection.connectionName
    );

    logApiEvent("orders", "syncEtsyConnection", "response", {
      connectionId: connection.connectionId,
      shopId,
      returnedOrderCount: orders.length,
      source: "etsy-api"
    });

    return orders;
  }

  private async syncSquarespaceConnection(connection: {
    connectionId: number;
    connectionName: string;
  }): Promise<ImportedOrder[]> {
    logApiEvent("orders", "syncSquarespaceConnection", "request", {
      connectionId: connection.connectionId
    });

    const creds = await this.integrationAuthService.getCredentials(connection.connectionId);
    if (!creds?.apiKey) {
      logApiEvent("orders", "syncSquarespaceConnection", "error", {
        connectionId: connection.connectionId,
        reason: "missing-api-key"
      });
      throw new Error("Squarespace API key not configured. Add your API key in Integrations.");
    }

    const orders = await fetchSquarespaceOrders(
      creds.apiKey,
      connection.connectionId,
      connection.connectionName
    );

    logApiEvent("orders", "syncSquarespaceConnection", "response", {
      connectionId: connection.connectionId,
      returnedOrderCount: orders.length,
      source: "squarespace-api"
    });

    return orders;
  }

  private async syncEbayConnection(connection: {
    connectionId: number;
    connectionName: string;
  }): Promise<ImportedOrder[]> {
    logApiEvent("orders", "syncEbayConnection", "request", {
      connectionId: connection.connectionId
    });

    const creds = await this.integrationAuthService.getCredentials(connection.connectionId);
    if (!creds?.clientId || !creds.clientSecret) {
      logApiEvent("orders", "syncEbayConnection", "error", {
        connectionId: connection.connectionId,
        reason: "missing-credentials"
      });
      throw new Error("eBay App ID and Cert ID not configured.");
    }

    const accessToken = await getValidEbayAccessToken(
      connection.connectionId,
      creds.clientId,
      creds.clientSecret
    );

    const orders = await fetchEbayOrders(accessToken, connection.connectionId, connection.connectionName);

    logApiEvent("orders", "syncEbayConnection", "response", {
      connectionId: connection.connectionId,
      returnedOrderCount: orders.length,
      source: "ebay-api"
    });

    return orders;
  }

  private async syncAmazonConnection(connection: {
    connectionId: number;
    connectionName: string;
  }): Promise<ImportedOrder[]> {
    logApiEvent("orders", "syncAmazonConnection", "request", {
      connectionId: connection.connectionId
    });

    const creds = await this.integrationAuthService.getCredentials(connection.connectionId);
    if (!creds?.clientId || !creds.clientSecret || !creds.refreshToken) {
      logApiEvent("orders", "syncAmazonConnection", "error", {
        connectionId: connection.connectionId,
        reason: "missing-credentials"
      });
      throw new Error(
        "Amazon LWA credentials and refresh token required. Complete OAuth or enter credentials in Integrations."
      );
    }

    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      throw new Error(
        "Amazon AWS access key and secret required for SP-API signing. Add them in Integrations."
      );
    }

    const accessToken = await getValidAmazonAccessToken(
      connection.connectionId,
      creds.clientId,
      creds.clientSecret,
      creds.refreshToken
    );

    const marketplace = creds.marketplace?.trim() || "US";
    const orders = await fetchAmazonOrders(
      accessToken,
      creds.awsAccessKeyId,
      creds.awsSecretAccessKey,
      marketplace,
      connection.connectionId,
      connection.connectionName
    );

    logApiEvent("orders", "syncAmazonConnection", "response", {
      connectionId: connection.connectionId,
      marketplace,
      returnedOrderCount: orders.length,
      source: "amazon-api"
    });

    return orders;
  }
}
