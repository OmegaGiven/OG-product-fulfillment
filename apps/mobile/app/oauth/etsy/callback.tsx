import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useServices } from "../../../src/providers/AppProviders";
import { useAppTheme } from "../../../src/providers/AppearanceProvider";

export default function EtsyOAuthCallbackScreen() {
  const { code, state, error, error_description } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  }>();
  const router = useRouter();
  const { integrationAuthService } = useServices();
  const { theme } = useAppTheme();
  const { colors } = theme;
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Completing Etsy connection...");

  useEffect(() => {
    if (error) {
      setStatus("error");
      setMessage(error_description ?? error ?? "Etsy authorization was denied.");
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Missing OAuth code or state. Try connecting again from Integrations.");
      return;
    }

    void completeOAuth(code, state);
  }, []);

  async function completeOAuth(oauthCode: string, oauthState: string) {
    try {
      await integrationAuthService.completeOAuthConnectionByState(oauthCode, oauthState);
      setStatus("success");
      setMessage("Etsy connected! Redirecting...");
      setTimeout(() => {
        router.replace("/integrations");
      }, 1200);
    } catch (err) {
      setStatus("error");
      setMessage((err as Error).message ?? "Failed to complete Etsy OAuth.");
    }
  }

  const statusColor =
    status === "success" ? colors.success ?? "#22c55e"
    : status === "error" ? colors.danger
    : colors.text;

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundWash }]}>
      <Text style={[styles.title, { color: colors.text }]}>Etsy OAuth</Text>
      <Text style={[styles.message, { color: statusColor }]}>{message}</Text>
      {status === "error" ? (
        <Text
          style={[styles.link, { color: colors.primary }]}
          onPress={() => router.replace("/integrations")}
        >
          Back to Integrations
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    padding: 32
  },
  title: {
    fontSize: 24,
    fontWeight: "700"
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center"
  },
  link: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
    textDecorationLine: "underline"
  }
});
