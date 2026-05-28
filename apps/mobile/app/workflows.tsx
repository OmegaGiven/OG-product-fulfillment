import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppNav } from "../src/components/AppNav";
import { Pressable } from "../src/components/InteractivePressable";
import { Modal, ScrollView } from "../src/components/SafeNative";
import { useBootstrapApp } from "../src/hooks/useBootstrapApp";
import { useWorkflowTemplates } from "../src/hooks/useWorkflowTemplates";
import { useAppTheme } from "../src/providers/AppearanceProvider";
import { useToast } from "../src/providers/ToastProvider";
import type { AppTheme } from "../src/theme";
import {
  createBlankWorkflow,
  createWorkflowFromTemplate
} from "../src/workflow/workflowBuilder";

export default function WorkflowsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showToast } = useToast();
  const styles = createStyles(theme);
  const { isReady, error: bootstrapError } = useBootstrapApp();
  const { templates, saveTemplate, deleteTemplate } = useWorkflowTemplates();
  const [busyAction, setBusyAction] = useState<"template" | "blank" | null>(null);
  const [workflowPendingDelete, setWorkflowPendingDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function createAndOpen(kind: "template" | "blank") {
    setBusyAction(kind);

    try {
      const workflow =
        kind === "template"
          ? createWorkflowFromTemplate(templates.length)
          : createBlankWorkflow(templates.length);
      const saved = await saveTemplate(workflow);
      showToast("Saved workflow", { variant: "success" });
      router.push(`/workflows/${saved.id}`);
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmDelete() {
    if (!workflowPendingDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteTemplate(workflowPendingDelete.id);
      showToast("Deleted workflow", { variant: "success" });
      setWorkflowPendingDelete(null);
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsDeleting(false);
    }
  }

  if (!isReady) {
    return (
      <View style={styles.centered}>
        <Text style={styles.pageTitle}>Preparing workflows...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title="Workflows" active="workflows" />

      {bootstrapError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{bootstrapError.message}</Text>
        </View>
      ) : null}

      <View style={styles.headerCard}>
        <Text style={styles.pageTitle}>Configure Workflows</Text>
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => void createAndOpen("template")}
            style={styles.primaryButton}
            disabled={busyAction !== null}
          >
            <Text style={styles.primaryButtonText}>
              {busyAction === "template" ? "Creating..." : "Create From Template"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void createAndOpen("blank")}
            style={styles.secondaryButton}
            disabled={busyAction !== null}
          >
            <Text style={styles.secondaryButtonText}>
              {busyAction === "blank" ? "Creating..." : "Create Blank Workflow"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>Existing Workflows</Text>
        {templates.map((template) => (
          <View key={template.id} style={styles.workflowCard}>
            <View style={styles.workflowHeader}>
              <Text style={styles.workflowName}>{template.name}</Text>
              <View style={styles.workflowHeaderActions}>
                <View style={styles.stepPill}>
                  <Text style={styles.stepPillText}>{template.steps.length} steps</Text>
                </View>
                <Pressable
                  onPress={() => router.push(`/workflows/${template.id}`)}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setWorkflowPendingDelete({
                      id: template.id,
                      name: template.name
                    })
                  }
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.workflowMeta}>Execution mode: {template.executionMode}</Text>
            <Text style={styles.workflowMeta}>Workflow ID: {template.id}</Text>
            <Text style={styles.workflowMeta}>
              Modules: {template.steps.map((step) => step.type).join(", ") || "None yet"}
            </Text>
          </View>
        ))}
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={workflowPendingDelete !== null}
        onRequestClose={() => {
          if (!isDeleting) {
            setWorkflowPendingDelete(null);
          }
        }}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.pageTitle}>Confirm Delete</Text>
            <Text style={styles.pageBody}>
              Delete workflow `{workflowPendingDelete?.name}`? This cannot be undone.
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setWorkflowPendingDelete(null)}
                style={styles.secondaryButton}
                disabled={isDeleting}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmDelete()}
                style={styles.deleteButton}
                disabled={isDeleting}
              >
                <Text style={styles.deleteButtonText}>
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    headerCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.lg
    },
    pageTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "700"
    },
    pageBody: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 22
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm
    },
    primaryButtonText: {
      color: colors.surfaceRaised,
      fontSize: 15,
      fontWeight: "700"
    },
    secondaryButton: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    listSection: {
      gap: spacing.sm
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700"
    },
    workflowCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.lg
    },
    workflowHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between"
    },
    workflowHeaderActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    workflowName: {
      color: colors.text,
      flex: 1,
      fontSize: 18,
      fontWeight: "700"
    },
    stepPill: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs
    },
    stepPillText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "700"
    },
    deleteButton: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    deleteButtonText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "700"
    },
    editButton: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    editButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    workflowMeta: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20
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
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.md,
      maxWidth: 420,
      padding: spacing.xl,
      width: "100%"
    }
  });
}
