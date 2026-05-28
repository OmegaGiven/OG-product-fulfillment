import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppNav } from "../src/components/AppNav";
import { Pressable } from "../src/components/InteractivePressable";
import { ScrollView } from "../src/components/SafeNative";
import { useBootstrapApp } from "../src/hooks/useBootstrapApp";
import { useFulfillmentRuns } from "../src/hooks/useFulfillmentRuns";
import { useWorkflowTemplates } from "../src/hooks/useWorkflowTemplates";
import { useAppTheme } from "../src/providers/AppearanceProvider";
import type { AppTheme } from "../src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { colors } = theme;
  const styles = createStyles(theme);
  const { isReady, error } = useBootstrapApp();
  const { runs, createRun } = useFulfillmentRuns();
  const { templates } = useWorkflowTemplates();
  const activeRuns = runs.filter((run) => run.status !== "completed").length;
  const completedRuns = runs.filter((run) => run.status === "completed").length;

  if (!isReady) {
    return (
      <View style={styles.centered}>
        <View style={styles.loadingCard}>
          <Text style={styles.loadingTitle}>Preparing local fulfillment tools...</Text>
        </View>
      </View>
    );
  }

  if (error && !isReady) {
    return (
      <View style={styles.centered}>
        <View style={styles.errorCard}>
          <Text style={styles.loadingTitle}>App bootstrap failed</Text>
          <Text style={styles.body}>{error.message}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title="Home" active="home" />

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.loadingTitle}>Background sync failed</Text>
          <Text style={styles.body}>{error.message}</Text>
        </View>
      ) : null}

      <View style={styles.heroCard}>
        <View style={styles.heroActions}>
          {templates.map((template) => (
            <Pressable
              key={template.id}
              onPress={async () => {
                const run = await createRun(template.id);
                router.push(`/runs/${run.id}`);
              }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Start {template.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Fulfillments</Text>
          <Text style={styles.statValue}>{runs.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Active</Text>
          <Text style={styles.statValue}>{activeRuns}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Completed</Text>
          <Text style={styles.statValue}>{completedRuns}</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Incomplete Fulfillments</Text>
      </View>

      {runs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No fulfillment runs yet</Text>
          <Text style={styles.body}>Create the first run to test the capture, OCR, and confirmation flow.</Text>
        </View>
      ) : (
        runs.map((run) => {
          const template = templates.find((entry) => entry.id === run.workflowTemplateId);
          const runTitle = `${template?.name ?? run.name}: #${run.id}`;

          return (
            <Pressable
              key={run.id}
              onPress={() => router.push(`/runs/${run.id}`)}
              style={styles.runCard}
            >
              <View style={styles.runCardTop}>
                <Text style={styles.cardTitle}>{runTitle}</Text>
                <View
                  style={[
                    styles.statusPill,
                    run.status === "completed" ? styles.statusPillCompleted : styles.statusPillActive
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      run.status === "completed" ? styles.statusDotCompleted : styles.statusDotActive
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusPillText,
                      run.status === "completed" ? styles.statusPillTextCompleted : styles.statusPillTextActive
                    ]}
                  >
                    {run.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                Step {run.currentStepIndex + 1} of {run.stepOrder.length}
              </Text>
              <Text style={styles.cardMeta}>Execution mode: {run.executionMode}</Text>
            </Pressable>
          );
        })
      )}
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
  loadingCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.xxl,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: 420,
    padding: spacing.xl
  },
  errorCard: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: radius.xxl,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: 420,
    padding: spacing.xl
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34
  },
  heroCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xxl,
    gap: spacing.md,
    overflow: "hidden",
    padding: spacing.xl
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  title: {
    color: colors.surfaceRaised,
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 38
  },
  body: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24
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
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  statsRow: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md
  },
  statCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: 132,
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 88,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    lineHeight: 13,
    textAlign: "center",
    textTransform: "uppercase"
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center"
  },
  sectionHeader: {
    gap: spacing.xs
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700"
  },
  emptyCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700"
  },
  runCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg
  },
  runCardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  cardTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: "700"
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 14
  },
  statusPill: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  statusPillActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  statusPillCompleted: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.success
  },
  statusDot: {
    borderRadius: radius.pill,
    height: 8,
    width: 8
  },
  statusDotActive: {
    backgroundColor: colors.accent
  },
  statusDotCompleted: {
    backgroundColor: colors.success
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  statusPillTextActive: {
    color: colors.primaryDark
  },
  statusPillTextCompleted: {
    color: colors.success
  }
});
}
