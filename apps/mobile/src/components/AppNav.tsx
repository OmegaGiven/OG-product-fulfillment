import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { NAV_PAGE_LABELS, type NavKey } from "../accessControl/accessControl";
import { Pressable } from "./InteractivePressable";
import { useAccessControl } from "../providers/AccessControlProvider";
import { useAppTheme } from "../providers/AppearanceProvider";
import type { AppTheme } from "../theme";

type Props = {
  title: string;
  active?: NavKey | null;
};

const NAV_ITEMS: {
  key: NavKey;
  label: string;
  href: "/" | "/orders" | "/history" | "/workflows" | "/templates" | "/integrations" | "/settings";
}[] = [
  { key: "home", label: NAV_PAGE_LABELS.home, href: "/" },
  { key: "orders", label: NAV_PAGE_LABELS.orders, href: "/orders" },
  { key: "history", label: NAV_PAGE_LABELS.history, href: "/history" },
  { key: "workflows", label: NAV_PAGE_LABELS.workflows, href: "/workflows" },
  { key: "templates", label: NAV_PAGE_LABELS.templates, href: "/templates" },
  { key: "integrations", label: NAV_PAGE_LABELS.integrations, href: "/integrations" },
  { key: "user", label: NAV_PAGE_LABELS.user, href: "/settings" }
];

export function AppNav({ title, active = null }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { theme } = useAppTheme();
  const { canAccessPage } = useAccessControl();
  const styles = createStyles(theme);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const visibleItems = NAV_ITEMS.filter((item) => canAccessPage(item.key, "read") || item.key === active);
  const isWeb = Platform.OS === "web";
  const inlineCount = isWeb
    ? width >= 760
      ? visibleItems.length
      : width >= 660
        ? 6
        : width >= 560
          ? 5
          : 4
    : width >= 720
      ? 5
      : width >= 520
        ? 4
        : 3;

  const { primaryItems, overflowItems } = useMemo(() => {
    if (visibleItems.length <= inlineCount) {
      return {
        primaryItems: visibleItems,
        overflowItems: [] as typeof visibleItems
      };
    }

    const nextPrimaryItems = visibleItems.slice(0, inlineCount);
    const primaryKeys = new Set(nextPrimaryItems.map((item) => item.key));
    return {
      primaryItems: nextPrimaryItems,
      overflowItems: visibleItems.filter((item) => !primaryKeys.has(item.key))
    };
  }, [inlineCount, visibleItems]);

  function handleNavigate(href: (typeof NAV_ITEMS)[number]["href"]) {
    setIsOverflowOpen(false);
    router.push(href);
  }

  return (
    <View style={[styles.topRow, styles.topRowCompact]}>
      <View style={[styles.actionsRow, width < 900 ? styles.actionsRowCompact : null]}>
        <View style={[styles.primaryNavRow, overflowItems.length === 0 ? styles.primaryNavRowExpanded : null]}>
          <View style={styles.primaryItemsRow}>
            {primaryItems.map((item) => {
              const isActive = item.key === active;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => handleNavigate(item.href)}
                  style={[styles.navButton, isActive ? styles.navButtonActive : null]}
                >
                  <Text style={[styles.navButtonText, isActive ? styles.navButtonTextActive : null]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {overflowItems.length > 0 ? (
            <View style={styles.overflowWrap}>
              <Pressable
                onPress={() => setIsOverflowOpen((current) => !current)}
                style={[styles.moreButton, isOverflowOpen ? styles.moreButtonActive : null]}
                accessibilityLabel="Open navigation menu"
              >
                <View style={styles.moreIcon}>
                  <View style={styles.moreIconBar} />
                  <View style={styles.moreIconBar} />
                  <View style={styles.moreIconBar} />
                </View>
              </Pressable>
              {isOverflowOpen ? (
                <View
                  style={[
                    styles.overflowMenu,
                    width < 900
                      ? {
                          maxWidth: Math.max(190, Math.min(width - 32, 280))
                        }
                      : null
                  ]}
                >
                  {overflowItems.map((item) => {
                    const isActive = item.key === active;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => handleNavigate(item.href)}
                        style={[styles.overflowItem, isActive ? styles.overflowItemActive : null]}
                      >
                        <Text
                          style={[
                            styles.overflowItemText,
                            isActive ? styles.overflowItemTextActive : null
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const { colors, radius, spacing } = theme;
  return StyleSheet.create({
    topRow: {
      alignItems: "stretch",
      flexDirection: "column",
      position: "relative",
      zIndex: 200
    },
    topRowCompact: {
      alignItems: "stretch",
      flexDirection: "column"
    },
    actionsRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "flex-start",
      position: "relative",
      width: "100%",
      zIndex: 210
    },
    actionsRowCompact: {
      justifyContent: "flex-start"
    },
    primaryNavRow: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      flexDirection: "row",
      flexShrink: 1,
      gap: spacing.xs,
      padding: spacing.xs,
      position: "relative",
      width: "100%",
      zIndex: 220
    },
    primaryNavRowExpanded: {
      justifyContent: "space-between"
    },
    primaryItemsRow: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 1,
      gap: spacing.xs,
      minWidth: 0
    },
    navButton: {
      backgroundColor: "transparent",
      borderRadius: radius.pill,
      minHeight: 36,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    navButtonActive: {
      backgroundColor: colors.accentSoft
    },
    navButtonText: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "700"
    },
    navButtonTextActive: {
      color: colors.text
    },
    overflowWrap: {
      position: "relative",
      zIndex: 230
    },
    moreButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderRadius: radius.pill,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      minWidth: 36,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm
    },
    moreButtonActive: {
      backgroundColor: colors.surfaceRaised
    },
    moreIcon: {
      gap: 3
    },
    moreIconBar: {
      backgroundColor: colors.text,
      borderRadius: 999,
      height: 2,
      width: 14
    },
    overflowMenu: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.lg,
      borderWidth: 1,
      elevation: 12,
      gap: spacing.xs,
      minWidth: 190,
      maxWidth: 280,
      padding: spacing.sm,
      position: "absolute",
      right: 0,
      top: 44,
      zIndex: 240
    },
    overflowItem: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    overflowItemActive: {
      backgroundColor: colors.accentSoft
    },
    overflowItemText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    overflowItemTextActive: {
      color: colors.text
    }
  });
}
