import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppNav } from "../src/components/AppNav";
import { Pressable } from "../src/components/InteractivePressable";
import { Modal, ScrollView, TextInput } from "../src/components/SafeNative";
import { useToast } from "../src/providers/ToastProvider";
import type {
  IntegrationConnection,
  IntegrationDefinition,
  PreparedIntegrationOAuth
} from "../src/services/interfaces";
import { useAppTheme } from "../src/providers/AppearanceProvider";
import { useServices } from "../src/providers/AppProviders";
import { useEntitlements } from "../src/providers/EntitlementProvider";
import type { AppTheme } from "../src/theme";

type DraftModes = Record<string, "mock" | "live">;
type DraftValues = Record<string, Record<string, string>>;
type DraftNames = Record<string, string>;
const ETSY_CALLBACK_PATH = "/oauth/etsy/callback";

const FALLBACK_INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    integrationKey: "etsy",
    integrationName: "Etsy",
    description: "",
    fields: [
      { key: "keystring", label: "Keystring", placeholder: "Enter Etsy app keystring", secret: true },
      { key: "sharedSecret", label: "Shared Secret", placeholder: "Enter Etsy shared secret", secret: true },
      { key: "redirectUri", label: "Redirect URI", placeholder: "Enter registered HTTPS redirect URI", secret: false }
    ],
    supportsOAuth: true,
    liveSetupNotes: [
      "Use the Etsy keystring as OAuth client_id.",
      "Redirect URI must exactly match the Etsy app configuration."
    ]
  },
  {
    integrationKey: "squarespace",
    integrationName: "Squarespace",
    description: "",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "Enter Squarespace API key",
        secret: true
      },
      { key: "siteId", label: "Site ID", placeholder: "Enter Squarespace site ID", secret: false }
    ]
  },
  {
    integrationKey: "ebay",
    integrationName: "eBay",
    description: "Pull unfulfilled eBay orders via the Selling API.",
    fields: [
      { key: "clientId", label: "App ID (Client ID)", placeholder: "Enter eBay App ID", secret: false },
      { key: "clientSecret", label: "Cert ID (Client Secret)", placeholder: "Enter eBay Cert ID", secret: true },
      { key: "redirectUri", label: "RuName (Redirect URI Name)", placeholder: "Enter eBay RuName", secret: false }
    ],
    supportsOAuth: true,
    liveSetupNotes: [
      "Register at https://developer.ebay.com/my/keys — create a production keyset.",
      "App ID = Client ID, Cert ID = Client Secret.",
      "Add a user token (RuName) under Account → User Tokens.",
      "Set accept URI to ogfulfillment://oauth/ebay/callback (native) or your web origin + /oauth/ebay/callback."
    ]
  },
  {
    integrationKey: "amazon",
    integrationName: "Amazon",
    description: "Pull unshipped Amazon orders via SP-API.",
    fields: [
      { key: "clientId", label: "LWA Client ID", placeholder: "amzn1.application-oa2-client.xxx", secret: false },
      { key: "clientSecret", label: "LWA Client Secret", placeholder: "Enter LWA client secret", secret: true },
      { key: "refreshToken", label: "Refresh Token", placeholder: "Aamz:LWA|...", secret: true },
      { key: "awsAccessKeyId", label: "AWS Access Key ID", placeholder: "AKIAIOSFODNN7EXAMPLE", secret: false },
      { key: "awsSecretAccessKey", label: "AWS Secret Access Key", placeholder: "Enter AWS secret access key", secret: true },
      { key: "marketplace", label: "Marketplace", placeholder: "US, UK, DE, CA, MX, JP, AU (default: US)", secret: false }
    ],
    supportsOAuth: true,
    liveSetupNotes: [
      "Register at https://developer.amazonservices.com and create a Selling Partner API app.",
      "Create an IAM user in AWS Console with AmazonSPAPISellerFullAccess policy.",
      "Tap 'Prepare OAuth' then 'Authorize with Amazon' to get a refresh token automatically.",
      "Or paste a refresh token directly if you already have one from Seller Central."
    ]
  }
];

function buildDraftValues(connections: IntegrationConnection[]) {
  return Object.fromEntries(
    connections.map((connection) => [
      connection.connectionId,
      Object.fromEntries(connection.fields.map((field) => [field.key, ""]))
    ])
  ) as DraftValues;
}

function getSuggestedEtsyRedirectUri() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return "";
  }

  const origin = window.location.origin?.trim();
  return origin ? `${origin}${ETSY_CALLBACK_PATH}` : "";
}

function isLikelyHttpsRedirectUri(value: string) {
  return value.startsWith("https://");
}

function isLocalhostRedirectUri(value: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(value);
}

export default function IntegrationsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { colors } = theme;
  const styles = createStyles(theme);
  const { showToast } = useToast();
  const { integrationAuthService, orderSyncService } = useServices();
  const { entitlements } = useEntitlements();
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [catalog, setCatalog] = useState<IntegrationDefinition[]>([]);
  const [draftModes, setDraftModes] = useState<DraftModes>({});
  const [draftNames, setDraftNames] = useState<DraftNames>({});
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddIntegrationModalOpen, setIsAddIntegrationModalOpen] = useState(false);
  const [selectedIntegrationKey, setSelectedIntegrationKey] = useState<string | null>(null);
  const [preparedOAuth, setPreparedOAuth] = useState<PreparedIntegrationOAuth | null>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);
  const suggestedEtsyRedirectUri = getSuggestedEtsyRedirectUri();

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!suggestedEtsyRedirectUri) {
      return;
    }

    setDraftValues((current) => {
      let changed = false;
      const nextValues = { ...current };

      connections.forEach((connection) => {
        if (connection.integrationKey !== "etsy") {
          return;
        }

        const existingValues = nextValues[connection.connectionId] ?? {};
        if (!existingValues.redirectUri?.trim()) {
          nextValues[connection.connectionId] = {
            ...existingValues,
            redirectUri: suggestedEtsyRedirectUri
          };
          changed = true;
        }
      });

      if (selectedIntegrationKey === "etsy") {
        const existingValues = nextValues["new:etsy"] ?? {};
        if (!existingValues.redirectUri?.trim()) {
          nextValues["new:etsy"] = {
            ...existingValues,
            redirectUri: suggestedEtsyRedirectUri
          };
          changed = true;
        }
      }

      return changed ? nextValues : current;
    });
  }, [connections, selectedIntegrationKey, suggestedEtsyRedirectUri]);

  async function refresh() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextConnections = await integrationAuthService.listConnections();
      const nextCatalog =
        typeof integrationAuthService.listIntegrationCatalog === "function"
          ? await integrationAuthService.listIntegrationCatalog()
          : FALLBACK_INTEGRATION_CATALOG;
      setCatalog(nextCatalog);
      setConnections(nextConnections);
      setDraftModes(
        Object.fromEntries(
          nextConnections.map((connection) => [connection.connectionId, connection.mode])
        ) as DraftModes
      );
      setDraftNames(
        Object.fromEntries(
          nextConnections.map((connection) => [connection.connectionId, connection.connectionName])
        ) as DraftNames
      );
      setDraftValues(buildDraftValues(nextConnections));
    } catch (nextError) {
      setLoadError((nextError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateField(integrationKey: string | number, fieldKey: string, value: string) {
    setDraftValues((current) => ({
      ...current,
      [integrationKey]: {
        ...current[integrationKey],
        [fieldKey]: value
      }
    }));
  }

  function updateConnectionName(connectionId: number, value: string) {
    setDraftNames((current) => ({
      ...current,
      [connectionId]: value
    }));
  }

  async function saveConnection(connectionId: number) {
    const connection = connections.find((entry) => entry.connectionId === connectionId);
    if (!connection) {
      return;
    }

    setBusyKey(connectionId);

    try {
      await integrationAuthService.saveCredentials({
        connectionId: connection.connectionId,
        connectionName: draftNames[connection.connectionId] ?? connection.connectionName,
        integrationKey: connection.integrationKey,
        mode: draftModes[connection.connectionId] ?? "mock",
        values: draftValues[connection.connectionId] ?? {}
      });
      await orderSyncService.syncOrders(connection.connectionId);
      await refresh();
      showToast("Saved configuration", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setBusyKey(null);
    }
  }

  async function completeIntegrationSetup() {
    if (!selectedIntegrationKey) {
      return;
    }

    const setupKey = `new:${selectedIntegrationKey}`;
    setBusyKey(setupKey);

    try {
      const connection = await integrationAuthService.saveCredentials({
        connectionName: draftNames[setupKey] ?? "",
        integrationKey: selectedIntegrationKey,
        mode: draftModes[setupKey] ?? "mock",
        values: draftValues[setupKey] ?? {}
      });
      await orderSyncService.syncOrders(connection.connectionId);
      await refresh();
      showToast("Saved configuration", { variant: "success" });
      setIsAddIntegrationModalOpen(false);
      setSelectedIntegrationKey(null);
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setBusyKey(null);
    }
  }

  async function removeConnection(connectionId: number) {
    setBusyKey(connectionId);

    try {
      await integrationAuthService.removeCredentials(connectionId);
      await orderSyncService.syncOrders();
      await refresh();
      showToast("Removed integration", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setBusyKey(null);
    }
  }

  async function syncConnection(connectionId: number) {
    setBusyKey(connectionId);

    try {
      await orderSyncService.syncOrders(connectionId);
      await refresh();
      showToast("Integration synced", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setBusyKey(null);
    }
  }

  async function prepareOAuth(connectionId: number) {
    setBusyKey(`oauth:${connectionId}`);

    try {
      const prepared = await integrationAuthService.prepareOAuthConnection(connectionId);
      if (!prepared) {
        throw new Error("OAuth preparation is not available for this integration.");
      }
      setOauthCode("");
      setPreparedOAuth(prepared);
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setBusyKey(null);
    }
  }

  async function openOAuthUrl() {
    if (!preparedOAuth) return;

    if (Platform.OS !== "web") {
      setOauthBusy(true);
      try {
        const WebBrowser = await import("expo-web-browser");
        const result = await WebBrowser.openAuthSessionAsync(
          preparedOAuth.authorizationUrl,
          "ogfulfillment://"
        );
        if (result.type === "success") {
          const url = new URL(result.url);
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          if (code && state) {
            await completeOAuth(code, state);
            return;
          }
        }
        if (result.type === "cancel") {
          showToast("Etsy authorization cancelled.", { variant: "error" });
        }
      } catch (err) {
        showToast((err as Error).message, { variant: "error", durationMs: 4200 });
      } finally {
        setOauthBusy(false);
      }
    } else {
      await Linking.openURL(preparedOAuth.authorizationUrl);
    }
  }

  async function completeOAuth(code: string, state: string) {
    setOauthBusy(true);
    try {
      await integrationAuthService.completeOAuthConnectionByState(code, state);
      await refresh();
      setPreparedOAuth(null);
      setOauthCode("");
      showToast("Etsy connected!", { variant: "success" });
    } catch (err) {
      showToast((err as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setOauthBusy(false);
    }
  }

  const selectedIntegration =
    catalog.find((connection) => connection.integrationKey === selectedIntegrationKey) ?? null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <AppNav title="Integrations" active="integrations" />

        {loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeaderRow}>
          <View />
          <Pressable onPress={() => setIsAddIntegrationModalOpen(true)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Add Integration</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.card}>
            <Text style={styles.cardBody}>Loading integrations...</Text>
          </View>
        ) : connections.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No integrations added yet</Text>
            <Text style={styles.cardBody}>
              Add a mock or live integration connection to start syncing orders into the app.
            </Text>
          </View>
        ) : (
          connections.map((connection) => {
            const activeMode = draftModes[connection.connectionId] ?? connection.mode;
            const isBusy = busyKey === connection.connectionId;

            return (
              <View key={connection.connectionId} style={styles.card}>
                <Text style={styles.integrationTypeText}>
                  Integration Type: {connection.integrationName}
                </Text>
                {connection.liveSetupNotes?.length ? (
                  <View style={styles.noteCard}>
                    {connection.liveSetupNotes.map((note) => (
                      <Text key={`${connection.connectionId}:${note}`} style={styles.noteText}>
                        {`\u2022 ${note}`}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Connection Name</Text>
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={(value) => updateConnectionName(connection.connectionId, value)}
                    placeholder={`${connection.integrationName} Store`}
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    value={draftNames[connection.connectionId] ?? connection.connectionName}
                  />
                </View>

                <View style={styles.metricsGrid}>
                  <View style={styles.metricTile}>
                    <Text style={styles.metricLabel}>Mode</Text>
                    <Text style={styles.metricValue}>{activeMode}</Text>
                  </View>
                  <View style={styles.metricTile}>
                    <Text style={styles.metricLabel}>Orders</Text>
                    <Text style={styles.metricValue}>{connection.syncedOrderCount}</Text>
                  </View>
                  <View style={styles.metricTile}>
                    <Text style={styles.metricLabel}>Stored</Text>
                    <Text style={styles.metricValue}>
                      {connection.hasStoredCredentials ? "Yes" : "No"}
                    </Text>
                  </View>
                  {connection.supportsOAuth ? (
                    <View style={styles.metricTile}>
                      <Text style={styles.metricLabel}>OAuth</Text>
                      <Text style={styles.metricValue}>
                        {connection.hasOAuthTokens ? "Connected" : "None"}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.metaText}>
                  Last saved: {connection.connectedAt ?? "No saved configuration"}
                </Text>
                <Text style={styles.metaText}>
                  Last sync: {connection.lastSyncedAt ?? "No sync yet"}
                </Text>

                <View style={styles.modeRow}>
                  <Pressable
                    onPress={() =>
                      setDraftModes((current) => ({
                        ...current,
                        [connection.connectionId]: "mock"
                      }))
                    }
                    style={[
                      styles.modeButton,
                      activeMode === "mock" ? styles.modeButtonActive : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeButtonText,
                        activeMode === "mock" ? styles.modeButtonTextActive : null
                      ]}
                    >
                      Mock Mode
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!entitlements.canUseSingleIntegration) {
                        router.push("/paywall");
                        return;
                      }
                      setDraftModes((current) => ({
                        ...current,
                        [connection.connectionId]: "live"
                      }));
                    }}
                    style={[
                      styles.modeButton,
                      activeMode === "live" ? styles.modeButtonActive : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeButtonText,
                        activeMode === "live" ? styles.modeButtonTextActive : null
                      ]}
                    >
                      Live Mode
                    </Text>
                  </Pressable>
                </View>

                {connection.fields.map((field) => (
                  <View key={field.key} style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) =>
                        updateField(connection.connectionId, field.key, value)
                      }
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.muted}
                      secureTextEntry={field.secret}
                      style={styles.input}
                      value={draftValues[connection.connectionId]?.[field.key] ?? ""}
                    />
                    {connection.integrationKey === "etsy" && field.key === "redirectUri" ? (
                      <>
                        {suggestedEtsyRedirectUri ? (
                          <Text style={styles.metaText}>
                            Suggested from current host: {suggestedEtsyRedirectUri}
                          </Text>
                        ) : (
                          <Text style={styles.metaText}>
                            Enter the exact callback URL you registered with Etsy. No hosted origin was detected to prefill it here.
                          </Text>
                        )}
                        {(draftValues[connection.connectionId]?.redirectUri ?? "").trim() ? (
                          isLikelyHttpsRedirectUri(
                            (draftValues[connection.connectionId]?.redirectUri ?? "").trim()
                          ) || isLocalhostRedirectUri(
                            (draftValues[connection.connectionId]?.redirectUri ?? "").trim()
                          ) ? (
                            <Text style={styles.metaText}>
                              Etsy requires this redirect URI to exactly match the value registered for your app.
                            </Text>
                          ) : (
                            <Text style={styles.warningText}>
                              This redirect URI is not HTTPS or localhost and may be rejected by Etsy.
                            </Text>
                          )
                        ) : null}
                      </>
                    ) : null}
                  </View>
                ))}

                <View style={styles.actionRow}>
                  {connection.supportsOAuth ? (
                    <Pressable
                      disabled={isBusy || busyKey === `oauth:${connection.connectionId}`}
                      onPress={() => void prepareOAuth(connection.connectionId)}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {busyKey === `oauth:${connection.connectionId}` ? "Preparing..." : "Prepare OAuth"}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    disabled={isBusy}
                    onPress={() => syncConnection(connection.connectionId)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {isBusy ? "Working..." : "Sync Orders"}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={isBusy}
                    onPress={() => void saveConnection(connection.connectionId)}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isBusy ? "Saving..." : "Save Configuration"}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={isBusy}
                    onPress={() => void removeConnection(connection.connectionId)}
                    style={styles.ghostButton}
                  >
                    <Text style={styles.ghostButtonText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isAddIntegrationModalOpen}
        onRequestClose={() => {
          setIsAddIntegrationModalOpen(false);
          setSelectedIntegrationKey(null);
        }}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.cardTitle}>
                {selectedIntegration ? selectedIntegration.integrationName : "Add Integration"}
              </Text>
              <Pressable
                onPress={() => {
                  setIsAddIntegrationModalOpen(false);
                  setSelectedIntegrationKey(null);
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>

            {!selectedIntegration ? (
              catalog.map((connection) => (
                <Pressable
                  key={connection.integrationKey}
                  onPress={() => setSelectedIntegrationKey(connection.integrationKey)}
                  style={styles.integrationChoiceCard}
                >
                  <Text style={styles.integrationChoiceTitle}>{connection.integrationName}</Text>
                </Pressable>
              ))
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Connection Name</Text>
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={(value) =>
                      setDraftNames((current) => ({
                        ...current,
                        [`new:${selectedIntegration.integrationKey}`]: value
                      }))
                    }
                    placeholder={`${selectedIntegration.integrationName} Store`}
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    value={draftNames[`new:${selectedIntegration.integrationKey}`] ?? ""}
                  />
                </View>

                <View style={styles.modeRow}>
                  <Pressable
                    onPress={() =>
                      setDraftModes((current) => ({
                        ...current,
                        [`new:${selectedIntegration.integrationKey}`]: "mock"
                      }))
                    }
                    style={[
                      styles.modeButton,
                      (draftModes[`new:${selectedIntegration.integrationKey}`] ?? "mock") === "mock"
                        ? styles.modeButtonActive
                        : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeButtonText,
                        (draftModes[`new:${selectedIntegration.integrationKey}`] ?? "mock") === "mock"
                          ? styles.modeButtonTextActive
                          : null
                      ]}
                    >
                      Mock Mode
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!entitlements.canUseSingleIntegration) {
                        router.push("/paywall");
                        return;
                      }
                      setDraftModes((current) => ({
                        ...current,
                        [`new:${selectedIntegration.integrationKey}`]: "live"
                      }));
                    }}
                    style={[
                      styles.modeButton,
                      (draftModes[`new:${selectedIntegration.integrationKey}`] ?? "mock") === "live"
                        ? styles.modeButtonActive
                        : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeButtonText,
                        (draftModes[`new:${selectedIntegration.integrationKey}`] ?? "mock") === "live"
                          ? styles.modeButtonTextActive
                          : null
                      ]}
                    >
                      Live Mode
                    </Text>
                  </Pressable>
                </View>

                {selectedIntegration.fields.map((field) => (
                  <View key={field.key} style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) =>
                        updateField(`new:${selectedIntegration.integrationKey}`, field.key, value)
                      }
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.muted}
                      secureTextEntry={field.secret}
                      style={styles.input}
                      value={draftValues[`new:${selectedIntegration.integrationKey}`]?.[field.key] ?? ""}
                    />
                    {selectedIntegration.integrationKey === "etsy" && field.key === "redirectUri" ? (
                      <>
                        {suggestedEtsyRedirectUri ? (
                          <Text style={styles.metaText}>
                            Suggested from current host: {suggestedEtsyRedirectUri}
                          </Text>
                        ) : (
                          <Text style={styles.metaText}>
                            Enter the exact callback URL you registered with Etsy. No hosted origin was detected to prefill it here.
                          </Text>
                        )}
                        {(draftValues[`new:${selectedIntegration.integrationKey}`]?.redirectUri ?? "").trim() ? (
                          isLikelyHttpsRedirectUri(
                            (draftValues[`new:${selectedIntegration.integrationKey}`]?.redirectUri ?? "").trim()
                          ) || isLocalhostRedirectUri(
                            (draftValues[`new:${selectedIntegration.integrationKey}`]?.redirectUri ?? "").trim()
                          ) ? (
                            <Text style={styles.metaText}>
                              Etsy requires this redirect URI to exactly match the value registered for your app.
                            </Text>
                          ) : (
                            <Text style={styles.warningText}>
                              This redirect URI is not HTTPS or localhost and may be rejected by Etsy.
                            </Text>
                          )
                        ) : null}
                      </>
                    ) : null}
                  </View>
                ))}

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => setSelectedIntegrationKey(null)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Back</Text>
                  </Pressable>
                  <Pressable
                    disabled={busyKey === `new:${selectedIntegration.integrationKey}`}
                    onPress={() => void completeIntegrationSetup()}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>
                      {busyKey === `new:${selectedIntegration.integrationKey}`
                        ? "Saving..."
                        : "Add Integration"}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={preparedOAuth !== null}
        onRequestClose={() => setPreparedOAuth(null)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.cardTitle}>Connect Etsy</Text>
              <Pressable onPress={() => setPreparedOAuth(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Redirect URI</Text>
              <Text style={styles.oauthValue}>{preparedOAuth?.redirectUri}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Scopes</Text>
              <Text style={styles.oauthValue}>{preparedOAuth?.scopes.join(", ")}</Text>
            </View>

            <Pressable
              disabled={oauthBusy}
              onPress={() => void openOAuthUrl()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {oauthBusy
                  ? "Working..."
                  : Platform.OS === "web"
                    ? "Open Authorization URL"
                    : `Authorize with ${preparedOAuth?.integrationKey === "ebay" ? "eBay" : preparedOAuth?.integrationKey === "amazon" ? "Amazon" : "Etsy"}`
                }
              </Text>
            </Pressable>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Enter Code Manually</Text>
              <Text style={styles.metaText}>
                If redirected back with a code in the URL, paste it here.
              </Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setOauthCode}
                placeholder="Paste authorization code"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={oauthCode}
              />
            </View>

            {oauthCode.trim() ? (
              <Pressable
                disabled={oauthBusy}
                onPress={() =>
                  void completeOAuth(oauthCode.trim(), preparedOAuth?.state ?? "")
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>
                  {oauthBusy ? "Completing..." : "Complete OAuth"}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Authorization URL</Text>
              <Text style={styles.oauthUrl}>{preparedOAuth?.authorizationUrl}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(theme: AppTheme) {
  const { colors, radius, spacing } = theme;

  return StyleSheet.create({
    container: {
      backgroundColor: colors.backgroundWash,
      flexGrow: 1,
      gap: spacing.lg,
      padding: spacing.xl
    },
    sectionHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      justifyContent: "space-between"
    },
    card: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg
    },
    cardTitle: {
      color: colors.text,
      fontSize: 21,
      fontWeight: "700"
    },
    cardBody: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 22
    },
    errorCard: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.md
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20
    },
    noteCard: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.md
    },
    noteText: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18
    },
    integrationTypeText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700"
    },
    fieldGroup: {
      gap: spacing.xs
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    oauthValue: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20
    },
    oauthUrl: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 18
    },
    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    metricTile: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      flexGrow: 1,
      gap: spacing.xs,
      minWidth: 90,
      padding: spacing.md
    },
    metricLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase"
    },
    metricValue: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "700",
      textTransform: "capitalize"
    },
    metaText: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    warningText: {
      color: colors.warning,
      fontSize: 14,
      lineHeight: 20
    },
    modeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    modeButton: {
      alignItems: "center",
      borderColor: colors.borderStrong,
      borderRadius: radius.pill,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minWidth: 116,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    modeButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary
    },
    modeButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
      textAlign: "center"
    },
    modeButtonTextActive: {
      color: colors.surfaceRaised
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    primaryButtonText: {
      color: colors.surfaceRaised,
      fontSize: 15,
      fontWeight: "700",
      textAlign: "center"
    },
    secondaryButton: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
      textAlign: "center"
    },
    ghostButton: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    ghostButtonText: {
      color: colors.danger,
      fontSize: 15,
      fontWeight: "700"
    },
    modalScrim: {
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.42)",
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg
    },
    modalCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.xxl,
      borderWidth: 1,
      gap: spacing.md,
      maxWidth: 420,
      padding: spacing.xl,
      width: "100%"
    },
    modalHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    closeButton: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    closeButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    integrationChoiceCard: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.md
    },
    integrationChoiceTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700"
    }
  });
}
