import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppNav } from "../../src/components/AppNav";
import { Pressable } from "../../src/components/InteractivePressable";
import { ScrollView } from "../../src/components/SafeNative";
import { useOrders } from "../../src/hooks/useOrders";
import { useAppTheme } from "../../src/providers/AppearanceProvider";
import type { AppTheme } from "../../src/theme";

function formatAddress(order: {
  shippingAddress: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
}) {
  const address = order.shippingAddress;
  return [
    address.name,
    address.address1,
    address.address2,
    `${address.city}, ${address.state} ${address.postalCode}`
  ]
    .filter(Boolean)
    .join("\n");
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId: string }>();
  const orderIdValue = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const orderId = orderIdValue ? Number(orderIdValue) : undefined;
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { orders, isLoading } = useOrders();
  const order = orders.find((entry) => entry.id === orderId);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Loading order...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Order not found</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title={`Order ${order.orderNumber}`} active="orders" />

      <View style={styles.card}>
        <Text style={styles.title}>{order.orderNumber}</Text>
        <Text style={styles.metaText}>
          {order.integrationConnectionName ?? "Unlabeled Store"} · {order.integrationName}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Buyer</Text>
        <Text style={styles.bodyText}>{order.buyerName}</Text>
        <Text style={styles.metaText}>{order.buyerEmail ?? "No email"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Shipping Address</Text>
        <Text style={styles.bodyText}>{formatAddress(order)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Channels</Text>
        <Text style={styles.bodyText}>{order.availableChannels.join(", ")}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Linked Workflow</Text>
        {order.linkedFulfillmentId ? (
          <Pressable
            onPress={() => router.push(`/runs/${order.linkedFulfillmentId}`)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Open Workflow #{order.linkedFulfillmentId}</Text>
          </Pressable>
        ) : (
          <Text style={styles.metaText}>No fulfillment workflow linked yet.</Text>
        )}
      </View>
    </ScrollView>
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
    centered: {
      alignItems: "center",
      backgroundColor: colors.backgroundWash,
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl
    },
    card: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.xl
    },
    title: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "700"
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700"
    },
    bodyText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 22
    },
    metaText: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    primaryButton: {
      alignSelf: "flex-start",
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    primaryButtonText: {
      color: colors.surfaceRaised,
      fontSize: 15,
      fontWeight: "700"
    }
  });
}
