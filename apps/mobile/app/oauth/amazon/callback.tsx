import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useServices } from "../../../src/providers/AppProviders";
import { useAppTheme } from "../../../src/providers/AppearanceProvider";

export default function AmazonOAuthCallbackScreen() {
  // Amazon sends spapi_oauth_code instead of code
  const { spapi_oauth_code, code, state, error, error_description } = useLocalSearchParams<{
    spapi_oauth_code?: string;
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
  const [message, setMessage] = useState("Completing Amazon connection...");

  useEffect(() => {
    if (error) {
      setStatus("error");
      setMessage(error_description ?? error ?? "Amazon authorization was denied.");
      return;
    }

    const authCode = spapi_oauth_code ?? code;
    if (!authCode || !state) {
      setStatus("error");
      setMessage("Missing authorization code or state. Try connecting again from Integrations.");
      return;
    }

    void completeOAuth(authCode, state);
  }, []);

  async function completeOAuth(authCode: string, oauthState: string) {
    try {
      await integrationAuthService.completeOAuthConnectionByState(authCode, oauthState);
      setStatus("success");
      setMessage("Amazon connected! Redirecting...");
      setTimeout(() => {
        router.replace("/integrations");
      }, 1200);
    } catch (err) {
      setStatus("error");
      setMessage((err as Error).message ?? "Failed to complete Amazon OAuth.");
    }
  }

  const statusColor =
    status === "success" ? colors.success ?? "#22c55e"
    : status === "error" ? colors.danger
    : colors.text;

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundWash }]}>
      <Text style={[styles.title, { color: colors.text }]}>Amazon OAuth</Text>
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
