import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AppNav } from "../../src/components/AppNav";
import { ScrollView } from "../../src/components/SafeNative";
import type { FulfillmentId } from "../../src/domain";
import { useAppTheme } from "../../src/providers/AppearanceProvider";
import { useFulfillmentRun } from "../../src/hooks/useFulfillmentRun";
import type { AppTheme } from "../../src/theme";
import { WorkflowScreen } from "../../src/workflow/WorkflowScreen";

function normalizeFulfillmentId(value?: string | string[]): FulfillmentId | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }

  return Number(raw);
}

export default function FulfillmentRunScreen() {
  const { theme } = useAppTheme();
  const { colors } = theme;
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ fulfillmentId: string }>();
  const fulfillmentId = normalizeFulfillmentId(params.fulfillmentId);
  const { run, workflow, isLoading, refresh } = useFulfillmentRun(fulfillmentId);

  if (isLoading || !run || !workflow) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading fulfillment run...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title={String(run.id)} />

      <View style={styles.heroCard}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{`${workflow.name}: #${run.id}`}</Text>
          <View style={[styles.badge, styles.badgeAccent]}>
            <Text style={styles.badgeText}>{run.status}</Text>
          </View>
        </View>
        <Text style={styles.metaText}>{new Date(run.createdAt).toLocaleString()}</Text>
      </View>

      <WorkflowScreen run={run} workflow={workflow} onRunUpdated={refresh} />
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
  loading: {
    alignItems: "center",
    backgroundColor: colors.backgroundWash,
    flex: 1,
    gap: spacing.md,
    justifyContent: "center"
  },
  loadingText: {
    color: colors.text
  },
  heroCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.xxl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30
  },
  metaText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  badge: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  badgeAccent: {
    backgroundColor: colors.accentSoft
  },
  badgeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize"
  }
});
}
