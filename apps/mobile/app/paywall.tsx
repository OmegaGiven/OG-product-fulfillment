import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppNav } from "../src/components/AppNav";
import { Pressable } from "../src/components/InteractivePressable";
import { ScrollView, TextInput } from "../src/components/SafeNative";
import { useAppTheme } from "../src/providers/AppearanceProvider";
import { useToast } from "../src/providers/ToastProvider";
import { useEntitlements } from "../src/providers/EntitlementProvider";
import { useCloudSync } from "../src/providers/CloudSyncProvider";
import { purchasePackage, restorePurchases, PRODUCT_IDS } from "../src/services/cloud/revenueCatService";
import { redeemPromoCode } from "../src/services/cloud/promoCodeService";
import type { AppTheme } from "../src/theme";

const TIERS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    productId: null,
    highlight: false,
    features: [
      "Unlimited fulfillment runs",
      "Photo capture + OCR label scanning",
      "Order matching from photos",
      "Message templates",
      "Mock integrations (test data)",
      "Local storage only"
    ],
    missing: ["Live e-commerce connections", "Cloud sync across devices", "Photo cloud backup"]
  },
  {
    id: "single",
    name: "Integrations",
    price: "$5",
    period: "/month",
    productId: PRODUCT_IDS.singleIntegration,
    highlight: false,
    features: [
      "Everything in Free",
      "1 live e-commerce integration",
      "Etsy, Squarespace, eBay, or Amazon",
      "Auto mark orders fulfilled",
      "Cloud sync across devices"
    ],
    missing: ["Multiple integrations"]
  },
  {
    id: "pro",
    name: "Pro",
    price: "$10",
    period: "/month",
    productId: PRODUCT_IDS.proIntegrations,
    highlight: true,
    features: [
      "Everything in Integrations",
      "All e-commerce integrations",
      "Etsy + Squarespace + eBay + Amazon",
      "Future integrations included",
      "Priority support"
    ],
    missing: []
  }
];

const PHOTO_BACKUP_TIER = {
  name: "Photo Backup",
  price: "$3",
  period: "/month add-on",
  productId: PRODUCT_IDS.photoBackup,
  features: [
    "5 GB cloud photo storage",
    "Photos synced across devices",
    "Photos backed up automatically",
    "Restore photos on new device"
  ]
};

export default function PaywallScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { colors, spacing, radius } = theme;
  const styles = createStyles(theme);
  const { showToast } = useToast();
  const { entitlements, refresh } = useEntitlements();
  const { user } = useCloudSync();

  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [showPromoInput, setShowPromoInput] = useState(false);

  async function handlePurchase(productId: string) {
    setBusyProductId(productId);
    try {
      // fetchOffering is async — build a minimal package reference
      const Purchases = (await import("react-native-purchases")).default;
      const offerings = await Purchases.getOfferings();
      let targetPkg = null;

      for (const offering of Object.values(offerings.all)) {
        targetPkg = offering.availablePackages.find(
          (pkg) => pkg.product.identifier === productId
        );
        if (targetPkg) break;
      }

      if (!targetPkg) {
        throw new Error("Product not found. Make sure the app is configured with live products.");
      }

      const { customerInfo } = await Purchases.purchasePackage(targetPkg);
      if (Object.keys(customerInfo.entitlements.active).length > 0) {
        await refresh();
        showToast("Subscription activated!", { variant: "success" });
        router.back();
      }
    } catch (error: unknown) {
      const msg = (error as { message?: string })?.message ?? "";
      if (!msg.toLowerCase().includes("cancel")) {
        showToast(msg || "Purchase failed. Try again.", { variant: "error", durationMs: 5000 });
      }
    } finally {
      setBusyProductId(null);
    }
  }

  async function handleRestore() {
    setBusyProductId("restore");
    try {
      await restorePurchases();
      await refresh();
      showToast("Purchases restored.", { variant: "success" });
    } catch (error) {
      showToast((error as Error).message, { variant: "error" });
    } finally {
      setBusyProductId(null);
    }
  }

  async function handleRedeemPromo() {
    if (!user) {
      showToast("Sign in first to redeem a promo code.", { variant: "error" });
      return;
    }
    if (!promoCode.trim()) return;
    setPromoBusy(true);
    try {
      const redeemed = await redeemPromoCode(user.uid, promoCode.trim());
      await refresh();
      const days = Math.ceil(
        (new Date(redeemed.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      showToast(`Promo applied! ${days} days of ${redeemed.entitlement.replace("_", " ")} access.`, {
        variant: "success"
      });
      setPromoCode("");
      setShowPromoInput(false);
      router.back();
    } catch (error) {
      showToast((error as Error).message, { variant: "error", durationMs: 5000 });
    } finally {
      setPromoBusy(false);
    }
  }

  const currentTierId = entitlements.canUseAllIntegrations
    ? "pro"
    : entitlements.canUseSingleIntegration
      ? "single"
      : "free";

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title="Upgrade" />

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>OG Fulfillment</Text>
        <Text style={styles.heroSubtitle}>
          Scan labels, match orders, notify customers — from your phone.
        </Text>
      </View>

      {/* Tier cards */}
      {TIERS.map((tier) => {
        const isActive = currentTierId === tier.id;
        return (
          <View
            key={tier.id}
            style={[styles.tierCard, tier.highlight ? styles.tierCardHighlight : null, isActive ? styles.tierCardActive : null]}
          >
            {tier.highlight ? (
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
              </View>
            ) : null}
            {isActive ? (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>CURRENT PLAN</Text>
              </View>
            ) : null}

            <View style={styles.tierHeader}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.tierPrice}>{tier.price}</Text>
                <Text style={styles.tierPeriod}>{tier.period}</Text>
              </View>
            </View>

            <View style={styles.featureList}>
              {tier.features.map((feat) => (
                <View key={feat} style={styles.featureRow}>
                  <Text style={[styles.featureIcon, { color: colors.success ?? "#22c55e" }]}>✓</Text>
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
              {tier.missing.map((feat) => (
                <View key={feat} style={styles.featureRow}>
                  <Text style={[styles.featureIcon, { color: colors.muted }]}>–</Text>
                  <Text style={[styles.featureText, { color: colors.muted }]}>{feat}</Text>
                </View>
              ))}
            </View>

            {tier.productId && !isActive ? (
              <Pressable
                onPress={() => void handlePurchase(tier.productId!)}
                style={[styles.purchaseButton, tier.highlight ? styles.purchaseButtonPrimary : null]}
                disabled={busyProductId !== null}
              >
                <Text style={[styles.purchaseButtonText, tier.highlight ? styles.purchaseButtonTextPrimary : null]}>
                  {busyProductId === tier.productId ? "Processing..." : `Subscribe ${tier.price}/mo`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {/* Photo backup add-on */}
      <View style={styles.addonCard}>
        <View style={styles.tierHeader}>
          <Text style={styles.tierName}>{PHOTO_BACKUP_TIER.name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.tierPrice}>{PHOTO_BACKUP_TIER.price}</Text>
            <Text style={styles.tierPeriod}>{PHOTO_BACKUP_TIER.period}</Text>
          </View>
        </View>
        <View style={styles.featureList}>
          {PHOTO_BACKUP_TIER.features.map((feat) => (
            <View key={feat} style={styles.featureRow}>
              <Text style={[styles.featureIcon, { color: colors.success ?? "#22c55e" }]}>✓</Text>
              <Text style={styles.featureText}>{feat}</Text>
            </View>
          ))}
        </View>
        {!entitlements.canUsePhotoBackup ? (
          <Pressable
            onPress={() => void handlePurchase(PHOTO_BACKUP_TIER.productId)}
            style={styles.purchaseButton}
            disabled={busyProductId !== null}
          >
            <Text style={styles.purchaseButtonText}>
              {busyProductId === PHOTO_BACKUP_TIER.productId ? "Processing..." : "Add Photo Backup $3/mo"}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>ACTIVE</Text>
          </View>
        )}
      </View>

      {/* Promo code */}
      <View style={styles.promoSection}>
        {showPromoInput ? (
          <View style={styles.promoInputRow}>
            <TextInput
              autoCapitalize="characters"
              onChangeText={setPromoCode}
              placeholder="Enter promo code"
              placeholderTextColor={colors.muted}
              style={styles.promoInput}
              value={promoCode}
            />
            <Pressable
              onPress={() => void handleRedeemPromo()}
              style={styles.promoButton}
              disabled={promoBusy || !promoCode.trim()}
            >
              <Text style={styles.promoButtonText}>
                {promoBusy ? "..." : "Apply"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setShowPromoInput(true)}>
            <Text style={styles.promoToggleText}>Have a promo code?</Text>
          </Pressable>
        )}
      </View>

      {/* Restore purchases */}
      <Pressable
        onPress={() => void handleRestore()}
        disabled={busyProductId === "restore"}
        style={styles.restoreButton}
      >
        <Text style={styles.restoreText}>
          {busyProductId === "restore" ? "Restoring..." : "Restore Purchases"}
        </Text>
      </Pressable>

      <Text style={styles.legalText}>
        Subscriptions renew automatically. Cancel anytime in{" "}
        {Platform.OS === "ios" ? "App Store → Subscriptions" : "Play Store → Subscriptions"}.
        {"\n"}By subscribing you agree to our Terms of Service.
      </Text>
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
    heroCard: {
      backgroundColor: colors.primaryDark ?? colors.primary,
      borderRadius: radius.xxl,
      gap: spacing.sm,
      padding: spacing.xl
    },
    heroTitle: {
      color: "#ffffff",
      fontSize: 24,
      fontWeight: "700"
    },
    heroSubtitle: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 15,
      lineHeight: 22
    },
    tierCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xxl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.xl
    },
    tierCardHighlight: {
      borderColor: colors.primary,
      borderWidth: 2
    },
    tierCardActive: {
      borderColor: colors.success ?? "#22c55e",
      borderWidth: 2
    },
    addonCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xxl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.xl
    },
    popularBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs ?? 4
    },
    popularBadgeText: {
      color: "#ffffff",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5
    },
    activeBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.success ? `${colors.success}22` : "#22c55e22",
      borderColor: colors.success ?? "#22c55e",
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs ?? 4
    },
    activeBadgeText: {
      color: colors.success ?? "#22c55e",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5
    },
    tierHeader: {
      gap: spacing.xs ?? 4
    },
    tierName: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "700"
    },
    priceRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: spacing.xs ?? 4
    },
    tierPrice: {
      color: colors.text,
      fontSize: 32,
      fontWeight: "800"
    },
    tierPeriod: {
      color: colors.muted,
      fontSize: 15
    },
    featureList: {
      gap: spacing.sm
    },
    featureRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.sm
    },
    featureIcon: {
      fontSize: 15,
      fontWeight: "700",
      width: 18
    },
    featureText: {
      color: colors.text,
      flex: 1,
      fontSize: 15,
      lineHeight: 21
    },
    purchaseButton: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    purchaseButtonPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary
    },
    purchaseButtonText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center"
    },
    purchaseButtonTextPrimary: {
      color: "#ffffff"
    },
    promoSection: {
      alignItems: "center",
      paddingVertical: spacing.sm
    },
    promoInputRow: {
      flexDirection: "row",
      gap: spacing.sm,
      width: "100%"
    },
    promoInput: {
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.text,
      flex: 1,
      fontSize: 16,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    promoButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    promoButtonText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "700"
    },
    promoToggleText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "600",
      textDecorationLine: "underline"
    },
    restoreButton: {
      alignItems: "center",
      paddingVertical: spacing.sm
    },
    restoreText: {
      color: colors.muted,
      fontSize: 14,
      textDecorationLine: "underline"
    },
    legalText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center"
    }
  });
}
