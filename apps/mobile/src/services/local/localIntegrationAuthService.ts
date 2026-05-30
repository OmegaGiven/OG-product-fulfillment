import type {
  IntegrationAuthService,
  IntegrationDefinition,
  IntegrationConnection,
  IntegrationCredentialInput,
  PreparedIntegrationOAuth
} from "../interfaces";
import { nowIso } from "../../utils";
import { createLocalRecordId } from "../../utils";

import {
  deleteSecureItem,
  getSecureJson,
  isSecureStoreBacked,
  setSecureJson
} from "./localSecureStore";
import { logApiEvent } from "./apiLogger";
import { exchangeEtsyCode, getEtsyMe } from "./etsyClient";
import { clearEtsyTokens, getEtsyTokens, saveEtsyTokens } from "./etsyTokenStore";
import { buildEbayAuthUrl, exchangeEbayCode, EBAY_SCOPES } from "./ebayClient";
import { clearEbayTokens, getEbayTokens, saveEbayTokens } from "./ebayTokenStore";
import { exchangeAmazonCode } from "./amazonClient";
import { clearAmazonTokens, getAmazonTokens } from "./amazonTokenStore";

type StoredConnectionRecord = {
  connectionId: number;
  connectionName: string;
  integrationKey: string;
  mode: "mock" | "live";
  values: Record<string, string>;
  connectedAt: string;
  lastSyncedAt: string | null;
  syncedOrderCount: number;
};

const CONNECTION_INDEX_KEY = "integration:index";
const OAUTH_STATE_PREFIX = "integration:oauth-state:";
const ETSY_SCOPES = ["transactions_r", "transactions_w", "shops_r", "shops_w"];
const AMAZON_AUTH_BASE = "https://sellercentral.amazon.com/apps/authorize/consent";

const SUPPORTED_INTEGRATIONS: IntegrationDefinition[] = [
  {
    integrationKey: "etsy",
    integrationName: "Etsy",
    description:
      "Primary V1 integration. Supports mock mode now and live OAuth preparation for seller authorization.",
    fields: [
      {
        key: "keystring",
        label: "Keystring",
        placeholder: "Enter Etsy app keystring",
        secret: true
      },
      {
        key: "sharedSecret",
        label: "Shared Secret",
        placeholder: "Enter Etsy shared secret",
        secret: true
      },
      {
        key: "redirectUri",
        label: "Redirect URI",
        placeholder: "Enter the exact HTTPS redirect URI registered in Etsy",
        secret: false
      }
    ],
    supportsOAuth: true,
    liveSetupNotes: [
      "Register an app at https://www.etsy.com/developers/register to get your keystring and shared secret.",
      "Set the redirect URI in your Etsy app settings to match exactly what you enter here.",
      "For native: use productfulfillment://oauth/etsy/callback as the redirect URI.",
      "For web: use your hosted origin + /oauth/etsy/callback.",
      "After saving credentials, hit 'Prepare OAuth' then 'Authorize with Etsy' to complete the connection.",
      "OAuth tokens expire after 1 hour and auto-refresh. Refresh tokens last 90 days."
    ]
  },
  {
    integrationKey: "squarespace",
    integrationName: "Squarespace",
    description: "Follow-up integration for pulling order data into the same local workflow.",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "Enter Squarespace API key",
        secret: true
      },
      {
        key: "siteId",
        label: "Site ID",
        placeholder: "Enter Squarespace site ID",
        secret: false
      }
    ],
    supportsOAuth: false,
    liveSetupNotes: [
      "Requires Commerce Advanced plan on Squarespace.",
      "Generate your API key at Settings → Advanced → Developer API Keys.",
      "The key is shown only once — copy it before closing.",
      "Grant 'Orders' read (and write for fulfillment write-back) when creating the key.",
      "Leave Site ID blank if unsure — it is used for display only."
    ]
  },
  {
    integrationKey: "ebay",
    integrationName: "eBay",
    description: "Pull unfulfilled eBay orders via the Selling API and confirm shipment.",
    fields: [
      {
        key: "clientId",
        label: "App ID (Client ID)",
        placeholder: "Enter eBay App ID",
        secret: false
      },
      {
        key: "clientSecret",
        label: "Cert ID (Client Secret)",
        placeholder: "Enter eBay Cert ID",
        secret: true
      },
      {
        key: "redirectUri",
        label: "RuName (Redirect URI Name)",
        placeholder: "Enter eBay RuName (the registered name, not the URL)",
        secret: false
      }
    ],
    supportsOAuth: true,
    liveSetupNotes: [
      "Register at https://developer.ebay.com/my/keys — create a production keyset.",
      "App ID = Client ID, Cert ID = Client Secret.",
      "Add a user token (RuName) in Account → User Tokens → Get a Token from eBay via Your Application.",
      "Set the accept URI to productfulfillment://oauth/ebay/callback (native) or your web origin + /oauth/ebay/callback.",
      "RuName is the registered name shown in the developer portal (not the actual redirect URL).",
      "After saving credentials, tap 'Prepare OAuth' then 'Authorize with eBay'."
    ]
  },
  {
    integrationKey: "amazon",
    integrationName: "Amazon",
    description: "Pull unshipped Amazon orders via the Selling Partner API (SP-API).",
    fields: [
      {
        key: "clientId",
        label: "LWA Client ID",
        placeholder: "amzn1.application-oa2-client.xxx",
        secret: false
      },
      {
        key: "clientSecret",
        label: "LWA Client Secret",
        placeholder: "Enter LWA client secret",
        secret: true
      },
      {
        key: "refreshToken",
        label: "Refresh Token",
        placeholder: "Aamz:LWA|...",
        secret: true
      },
      {
        key: "awsAccessKeyId",
        label: "AWS Access Key ID",
        placeholder: "AKIAIOSFODNN7EXAMPLE",
        secret: false
      },
      {
        key: "awsSecretAccessKey",
        label: "AWS Secret Access Key",
        placeholder: "Enter AWS secret access key",
        secret: true
      },
      {
        key: "marketplace",
        label: "Marketplace",
        placeholder: "US, UK, DE, CA, MX, JP, AU (default: US)",
        secret: false
      }
    ],
    supportsOAuth: true,
    liveSetupNotes: [
      "Register at https://developer.amazonservices.com — create a Selling Partner API app.",
      "Create an IAM user in AWS Console and attach the AmazonSPAPISellerFullAccess managed policy.",
      "Enter IAM user's access key ID and secret access key.",
      "In Amazon Seller Central → Apps & Services → Develop Apps, set redirect URL to productfulfillment://oauth/amazon/callback.",
      "Tap 'Prepare OAuth' then 'Authorize with Amazon' to get a refresh token stored automatically.",
      "Alternatively, paste a refresh token directly if you already have one from Seller Central.",
      "Marketplace field: US (default), UK, DE, CA, MX, JP, AU."
    ]
  }
];

function getStorageKey(connectionId: number) {
  return `integration:${connectionId}`;
}

async function checkHasOAuthTokens(integrationKey: string, connectionId: number): Promise<boolean> {
  if (integrationKey === "etsy") return !!(await getEtsyTokens(connectionId));
  if (integrationKey === "ebay") return !!(await getEbayTokens(connectionId));
  if (integrationKey === "amazon") return !!(await getAmazonTokens(connectionId));
  return false;
}

function toConnection(
  base: IntegrationDefinition,
  stored: StoredConnectionRecord,
  usesSecureStorage: boolean,
  hasOAuthTokens: boolean
): IntegrationConnection {
  return {
    ...base,
    connectionId: stored.connectionId,
    connectionName: stored.connectionName,
    mode: stored.mode,
    connectedAt: stored.connectedAt,
    lastSyncedAt: stored.lastSyncedAt,
    syncedOrderCount: stored.syncedOrderCount,
    hasStoredCredentials: Object.keys(stored.values).length > 0,
    hasOAuthTokens,
    usesSecureStorage,
    supportsOAuth: base.supportsOAuth ?? false,
    liveSetupNotes: base.liveSetupNotes ?? []
  };
}

function createPkceVerifier() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let verifier = "";
  for (let index = 0; index < 64; index += 1) {
    verifier += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return verifier;
}

function createStateToken() {
  return `etsy_state_${createLocalRecordId()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function sha256Base64Url(input: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("OAuth preparation needs Web Crypto support on this device.");
  }

  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = Array.from(new Uint8Array(digest));
  const binary = bytes.map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export class LocalIntegrationAuthService implements IntegrationAuthService {
  async listIntegrationCatalog(): Promise<IntegrationDefinition[]> {
    return SUPPORTED_INTEGRATIONS;
  }

  private async getConnectionIndex() {
    return (await getSecureJson<number[]>(CONNECTION_INDEX_KEY)) ?? [];
  }

  private async saveConnectionIndex(connectionIds: number[]) {
    await setSecureJson(CONNECTION_INDEX_KEY, connectionIds);
  }

  async listConnections(): Promise<IntegrationConnection[]> {
    const usesSecureStorage = await isSecureStoreBacked();
    const connectionIds = await this.getConnectionIndex();
    const connections = await Promise.all(
      connectionIds.map(async (connectionId) => {
        const stored = await getSecureJson<StoredConnectionRecord>(getStorageKey(connectionId));
        if (!stored) {
          return null;
        }
        const integration = SUPPORTED_INTEGRATIONS.find(
          (entry) => entry.integrationKey === stored.integrationKey
        );
        if (!integration) {
          return null;
        }
        const hasOAuthTokens = await checkHasOAuthTokens(stored.integrationKey, connectionId);
        return toConnection(integration, stored, usesSecureStorage, hasOAuthTokens);
      })
    );

    return connections.filter((connection): connection is IntegrationConnection => !!connection);
  }

  async saveCredentials(input: IntegrationCredentialInput): Promise<IntegrationConnection> {
    logApiEvent("integration", "saveCredentials", "request", {
      connectionId: input.connectionId ?? "new",
      connectionName: input.connectionName,
      integrationKey: input.integrationKey,
      mode: input.mode,
      valueKeys: Object.keys(input.values)
    });

    const integration = SUPPORTED_INTEGRATIONS.find(
      (entry) => entry.integrationKey === input.integrationKey
    );
    if (!integration) {
      throw new Error("Unsupported integration.");
    }

    const cleanedValues = Object.fromEntries(
      Object.entries(input.values)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0)
    );

    if (input.mode === "live" && Object.keys(cleanedValues).length === 0) {
      throw new Error("Enter at least one credential value for live mode.");
    }

    const record: StoredConnectionRecord = {
      connectionId: input.connectionId ?? createLocalRecordId(),
      connectionName: input.connectionName.trim() || `${integration.integrationName} Store`,
      integrationKey: input.integrationKey,
      mode: input.mode,
      values: cleanedValues,
      connectedAt: nowIso(),
      lastSyncedAt: null,
      syncedOrderCount: 0
    };

    const existing = input.connectionId
      ? await getSecureJson<StoredConnectionRecord>(getStorageKey(input.connectionId))
      : null;
    if (existing) {
      record.lastSyncedAt = existing.lastSyncedAt;
      record.syncedOrderCount = existing.syncedOrderCount;
    }

    await setSecureJson(getStorageKey(record.connectionId), record);
    const connectionIndex = await this.getConnectionIndex();
    if (!connectionIndex.includes(record.connectionId)) {
      await this.saveConnectionIndex([...connectionIndex, record.connectionId]);
    }

    const hasOAuthTokens = await checkHasOAuthTokens(record.integrationKey, record.connectionId);
    const connection = toConnection(integration, record, await isSecureStoreBacked(), hasOAuthTokens);
    logApiEvent("integration", "saveCredentials", "response", {
      connectionId: connection.connectionId,
      connectionName: connection.connectionName,
      integrationKey: connection.integrationKey,
      mode: connection.mode,
      hasStoredCredentials: connection.hasStoredCredentials
    });
    return connection;
  }

  async prepareOAuthConnection(connectionId: number): Promise<PreparedIntegrationOAuth | null> {
    logApiEvent("integration", "prepareOAuthConnection", "request", {
      connectionId
    });
    const connections = await this.listConnections();
    const connection = connections.find((entry) => entry.connectionId === connectionId);
    const oauthIntegrations = ["etsy", "ebay", "amazon"];
    if (!connection || !oauthIntegrations.includes(connection.integrationKey)) {
      logApiEvent("integration", "prepareOAuthConnection", "response", {
        connectionId,
        prepared: false,
        reason: "connection-not-found-or-unsupported"
      });
      return null;
    }

    const stored = await getSecureJson<StoredConnectionRecord>(getStorageKey(connectionId));
    if (!stored) {
      throw new Error("Integration connection not found.");
    }

    const integrationKey = stored.integrationKey;
    const state = createStateToken();
    const requestedAt = nowIso();

    if (integrationKey === "etsy") {
      const keystring = stored.values.keystring?.trim();
      const redirectUri = stored.values.redirectUri?.trim();
      if (!keystring || !redirectUri) {
        throw new Error("Etsy live setup requires both keystring and redirect URI.");
      }
      const codeVerifier = createPkceVerifier();
      const codeChallenge = await sha256Base64Url(codeVerifier);
      await setSecureJson(`${OAUTH_STATE_PREFIX}${connectionId}`, {
        state,
        codeVerifier,
        redirectUri,
        scopes: ETSY_SCOPES,
        requestedAt
      });
      const query = new URLSearchParams({
        response_type: "code",
        client_id: keystring,
        redirect_uri: redirectUri,
        scope: ETSY_SCOPES.join(" "),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
      });
      const prepared = {
        connectionId,
        integrationKey,
        authorizationUrl: `https://www.etsy.com/oauth/connect?${query.toString()}`,
        redirectUri,
        scopes: ETSY_SCOPES,
        state,
        requestedAt
      };
      logApiEvent("integration", "prepareOAuthConnection", "response", {
        connectionId,
        integrationKey,
        redirectUri,
        scopes: ETSY_SCOPES,
        authorizationUrl: prepared.authorizationUrl
      });
      return prepared;
    }

    if (integrationKey === "ebay") {
      const clientId = stored.values.clientId?.trim();
      const redirectUri = stored.values.redirectUri?.trim();
      if (!clientId || !redirectUri) {
        throw new Error("eBay live setup requires both App ID (Client ID) and RuName.");
      }
      await setSecureJson(`${OAUTH_STATE_PREFIX}${connectionId}`, {
        state,
        redirectUri,
        scopes: EBAY_SCOPES,
        requestedAt
      });
      const authorizationUrl = buildEbayAuthUrl(clientId, redirectUri, state);
      const prepared = {
        connectionId,
        integrationKey,
        authorizationUrl,
        redirectUri,
        scopes: EBAY_SCOPES,
        state,
        requestedAt
      };
      logApiEvent("integration", "prepareOAuthConnection", "response", {
        connectionId,
        integrationKey,
        redirectUri,
        scopes: EBAY_SCOPES,
        authorizationUrl
      });
      return prepared;
    }

    if (integrationKey === "amazon") {
      const clientId = stored.values.clientId?.trim();
      if (!clientId) {
        throw new Error("Amazon live setup requires LWA Client ID.");
      }
      const redirectUri = "productfulfillment://oauth/amazon/callback";
      await setSecureJson(`${OAUTH_STATE_PREFIX}${connectionId}`, {
        state,
        redirectUri,
        scopes: [],
        requestedAt
      });
      const query = new URLSearchParams({ application_id: clientId, state });
      const authorizationUrl = `${AMAZON_AUTH_BASE}?${query.toString()}`;
      const prepared = {
        connectionId,
        integrationKey,
        authorizationUrl,
        redirectUri,
        scopes: [],
        state,
        requestedAt
      };
      logApiEvent("integration", "prepareOAuthConnection", "response", {
        connectionId,
        integrationKey,
        authorizationUrl
      });
      return prepared;
    }

    logApiEvent("integration", "prepareOAuthConnection", "response", {
      connectionId,
      prepared: false,
      reason: "integration-does-not-support-oauth"
    });
    return null;
  }

  async removeCredentials(connectionId: number) {
    logApiEvent("integration", "removeCredentials", "request", { connectionId });
    const stored = await getSecureJson<StoredConnectionRecord>(getStorageKey(connectionId));
    await deleteSecureItem(getStorageKey(connectionId));
    await deleteSecureItem(`${OAUTH_STATE_PREFIX}${connectionId}`);
    if (stored?.integrationKey === "etsy") await clearEtsyTokens(connectionId);
    if (stored?.integrationKey === "ebay") await clearEbayTokens(connectionId);
    if (stored?.integrationKey === "amazon") await clearAmazonTokens(connectionId);
    const connectionIndex = await this.getConnectionIndex();
    await this.saveConnectionIndex(connectionIndex.filter((entry) => entry !== connectionId));
    logApiEvent("integration", "removeCredentials", "response", { connectionId, removed: true });
  }

  async completeOAuthConnectionByState(code: string, state: string): Promise<IntegrationConnection> {
    logApiEvent("integration", "completeOAuthConnectionByState", "request", { state });

    // Find which connection has this pending OAuth state
    const connectionIds = await this.getConnectionIndex();
    let matchedConnectionId: number | null = null;
    let matchedOAuthState: { codeVerifier: string; redirectUri: string; state: string } | null = null;

    for (const connectionId of connectionIds) {
      const oauthState = await getSecureJson<{
        state: string;
        codeVerifier: string;
        redirectUri: string;
      }>(`${OAUTH_STATE_PREFIX}${connectionId}`);
      if (oauthState?.state === state) {
        matchedConnectionId = connectionId;
        matchedOAuthState = oauthState;
        break;
      }
    }

    if (!matchedConnectionId || !matchedOAuthState) {
      throw new Error("OAuth state not found or expired. Restart the connection from Integrations.");
    }

    const stored = await getSecureJson<StoredConnectionRecord>(getStorageKey(matchedConnectionId));
    if (!stored) {
      throw new Error("Integration connection not found.");
    }

    const integrationKey = stored.integrationKey;

    if (integrationKey === "etsy") {
      const keystring = stored.values.keystring?.trim();
      const sharedSecret = stored.values.sharedSecret?.trim();
      if (!keystring || !sharedSecret) {
        throw new Error("Etsy credentials not found. Save your keystring and shared secret first.");
      }
      const tokens = await exchangeEtsyCode(
        keystring,
        sharedSecret,
        matchedOAuthState.redirectUri,
        code,
        matchedOAuthState.codeVerifier ?? ""
      );
      const { shopId } = await getEtsyMe(keystring, sharedSecret, tokens.accessToken);
      await saveEtsyTokens(matchedConnectionId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        shopId
      });
      logApiEvent("integration", "completeOAuthConnectionByState", "response", {
        connectionId: matchedConnectionId,
        integrationKey,
        shopId,
        expiresAt: tokens.expiresAt
      });
    } else if (integrationKey === "ebay") {
      const clientId = stored.values.clientId?.trim();
      const clientSecret = stored.values.clientSecret?.trim();
      if (!clientId || !clientSecret) {
        throw new Error("eBay credentials not found. Save your App ID and Cert ID first.");
      }
      const tokens = await exchangeEbayCode(
        clientId,
        clientSecret,
        matchedOAuthState.redirectUri,
        code
      );
      await saveEbayTokens(matchedConnectionId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      });
      logApiEvent("integration", "completeOAuthConnectionByState", "response", {
        connectionId: matchedConnectionId,
        integrationKey,
        expiresAt: tokens.expiresAt
      });
    } else if (integrationKey === "amazon") {
      const clientId = stored.values.clientId?.trim();
      const clientSecret = stored.values.clientSecret?.trim();
      if (!clientId || !clientSecret) {
        throw new Error("Amazon credentials not found. Save your LWA Client ID and Secret first.");
      }
      // Amazon callback passes spapi_oauth_code as code
      const tokens = await exchangeAmazonCode(clientId, clientSecret, code);
      // Store refresh token in credentials so getCredentials returns it for sync
      const updatedValues = { ...stored.values, refreshToken: tokens.refreshToken };
      const updatedRecord: StoredConnectionRecord = { ...stored, values: updatedValues };
      await setSecureJson(getStorageKey(matchedConnectionId), updatedRecord);
      logApiEvent("integration", "completeOAuthConnectionByState", "response", {
        connectionId: matchedConnectionId,
        integrationKey,
        expiresAt: tokens.expiresAt
      });
    } else {
      throw new Error(`OAuth completion not supported for integration: ${integrationKey}`);
    }

    await deleteSecureItem(`${OAUTH_STATE_PREFIX}${matchedConnectionId}`);

    const integration = SUPPORTED_INTEGRATIONS.find(
      (entry) => entry.integrationKey === stored.integrationKey
    )!;
    return toConnection(integration, stored, await isSecureStoreBacked(), true);
  }

  async getCredentials(connectionId: number): Promise<Record<string, string> | null> {
    const stored = await getSecureJson<StoredConnectionRecord>(getStorageKey(connectionId));
    return stored?.values ?? null;
  }

  async recordSyncResult(connectionId: number, syncedOrderCount: number) {
    logApiEvent("integration", "recordSyncResult", "request", {
      connectionId,
      syncedOrderCount
    });
    const existing = await getSecureJson<StoredConnectionRecord>(getStorageKey(connectionId));
    if (!existing) {
      throw new Error("Integration connection not found.");
    }
    const nextRecord: StoredConnectionRecord = {
      connectionId,
      connectionName: existing.connectionName,
      integrationKey: existing.integrationKey,
      mode: existing.mode,
      values: existing.values,
      connectedAt: existing.connectedAt ?? nowIso(),
      lastSyncedAt: nowIso(),
      syncedOrderCount
    };

    await setSecureJson(getStorageKey(connectionId), nextRecord);
    logApiEvent("integration", "recordSyncResult", "response", {
      connectionId,
      lastSyncedAt: nextRecord.lastSyncedAt,
      syncedOrderCount: nextRecord.syncedOrderCount
    });
  }
}
