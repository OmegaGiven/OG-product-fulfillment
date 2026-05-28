import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { MessageTemplate } from "../src/domain";
import { Pressable } from "../src/components/InteractivePressable";
import { Modal, ScrollView, TextInput } from "../src/components/SafeNative";
import { useBootstrapApp } from "../src/hooks/useBootstrapApp";
import { useMessageTemplates } from "../src/hooks/useMessageTemplates";
import { AppNav } from "../src/components/AppNav";
import { useAppTheme } from "../src/providers/AppearanceProvider";
import { useToast } from "../src/providers/ToastProvider";
import type { AppTheme } from "../src/theme";
import { createLocalRecordId } from "../src/utils";

type DraftTemplate = MessageTemplate;

function buildBlankTemplate(count: number): DraftTemplate {
  return {
    id: createLocalRecordId(),
    name: `Message Template ${count + 1}`,
    subject: "",
    body: ""
  };
}

export default function TemplatesScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { showToast } = useToast();
  const { isReady, error: bootstrapError } = useBootstrapApp();
  const { templates, saveTemplate, deleteTemplate } = useMessageTemplates();
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [templatePendingDelete, setTemplatePendingDelete] = useState<MessageTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => a.name.localeCompare(b.name)),
    [templates]
  );

  async function handleSave() {
    if (!draft) {
      return;
    }
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      showToast("Name, subject, and body are required.", { variant: "error", durationMs: 4200 });
      return;
    }

    setIsSaving(true);
    try {
      await saveTemplate({
        ...draft,
        name: draft.name.trim(),
        subject: draft.subject.trim(),
        body: draft.body.trim()
      });
      showToast("Saved template", { variant: "success" });
      setDraft(null);
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!templatePendingDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteTemplate(templatePendingDelete.id);
      showToast("Deleted template", { variant: "success" });
      setTemplatePendingDelete(null);
      if (draft?.id === templatePendingDelete.id) {
        setDraft(null);
      }
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsDeleting(false);
    }
  }

  if (!isReady) {
    return (
      <View style={styles.centered}>
        <Text style={styles.pageTitle}>Preparing templates...</Text>
      </View>
    );
  }

  if (bootstrapError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.pageTitle}>Templates unavailable</Text>
        <Text style={styles.pageBody}>{bootstrapError.message}</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <AppNav title="Templates" active="templates" />

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Message Templates</Text>
            <Pressable
              onPress={() => {
                setDraft(buildBlankTemplate(sortedTemplates.length));
              }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Create Template</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionNote}>
            These templates feed the message modules in workflow steps.
          </Text>

          {sortedTemplates.map((template) => (
            <View key={template.id} style={styles.templateCard}>
              <View style={styles.templateHeader}>
                <View style={styles.templateHeaderContent}>
                  <Text style={styles.templateName}>{template.name}</Text>
                  <Text style={styles.templateMeta}>ID: {template.id}</Text>
                </View>
                <View style={styles.templateActions}>
                  <Pressable
                    onPress={() => setDraft({ ...template })}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTemplatePendingDelete(template)}
                    style={styles.ghostButton}
                  >
                    <Text style={styles.ghostButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.templateFieldLabel}>Subject</Text>
              <Text style={styles.templatePreview}>{template.subject}</Text>
              <Text style={styles.templateFieldLabel}>Body</Text>
              <Text style={styles.templatePreview} numberOfLines={4}>
                {template.body}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={draft !== null}
        onRequestClose={() => setDraft(null)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {draft && templates.some((template) => template.id === draft.id)
                ? "Edit Message Template"
                : "Create Message Template"}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Template Name</Text>
              <TextInput
                value={draft?.name ?? ""}
                onChangeText={(value) =>
                  setDraft((current) => (current ? { ...current, name: value } : current))
                }
                placeholder="Template name"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Subject</Text>
              <TextInput
                value={draft?.subject ?? ""}
                onChangeText={(value) =>
                  setDraft((current) => (current ? { ...current, subject: value } : current))
                }
                placeholder="Subject line"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Body</Text>
              <TextInput
                multiline
                value={draft?.body ?? ""}
                onChangeText={(value) =>
                  setDraft((current) => (current ? { ...current, body: value } : current))
                }
                placeholder="Message body. Use placeholders like {{buyerName}} or {{orderNumber}}."
                style={[styles.input, styles.textArea]}
              />
            </View>

            <View style={styles.templateHintCard}>
              <Text style={styles.templateHintTitle}>Supported placeholders</Text>
              <Text style={styles.templateHintBody}>
                {`{{buyerName}}, {{orderNumber}}`}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setDraft(null)} style={styles.ghostButton}>
                <Text style={styles.ghostButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void handleSave()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>
                  {isSaving ? "Saving..." : "Save Template"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={templatePendingDelete !== null}
        onRequestClose={() => setTemplatePendingDelete(null)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Delete Template</Text>
            <Text style={styles.pageBody}>
              Delete template `{templatePendingDelete?.name}`? Workflows that referenced it will fall
              back to the default message template.
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setTemplatePendingDelete(null)} style={styles.ghostButton}>
                <Text style={styles.ghostButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void confirmDelete()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
                </Text>
              </Pressable>
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
    centered: {
      alignItems: "center",
      backgroundColor: colors.backgroundWash,
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl
    },
    pageTitle: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "800"
    },
    pageBody: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 22
    },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap: spacing.lg,
      padding: spacing.lg
    },
    cardTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800"
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    sectionNote: {
      color: colors.muted,
      fontSize: 14
    },
    templateCard: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md
    },
    templateHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    templateHeaderContent: {
      flex: 1,
      gap: spacing.xs
    },
    templateActions: {
      flexDirection: "row",
      gap: spacing.sm
    },
    templateName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800"
    },
    templateMeta: {
      color: colors.muted,
      fontSize: 12
    },
    templateFieldLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase"
    },
    templatePreview: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 22
    },
    errorCard: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.md
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "700"
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm
    },
    primaryButtonText: {
      color: colors.surfaceRaised,
      fontSize: 14,
      fontWeight: "800"
    },
    secondaryButton: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    ghostButton: {
      borderColor: colors.borderStrong,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    ghostButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    modalScrim: {
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.42)",
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap: spacing.lg,
      maxWidth: 680,
      padding: spacing.xl,
      width: "100%"
    },
    confirmCard: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap: spacing.lg,
      maxWidth: 520,
      padding: spacing.xl,
      width: "100%"
    },
    modalTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800"
    },
    fieldGroup: {
      gap: spacing.sm
    },
    fieldLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase"
    },
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.text,
      fontSize: 14,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    textArea: {
      minHeight: 160,
      textAlignVertical: "top"
    },
    templateHintCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.md
    },
    templateHintTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "800"
    },
    templateHintBody: {
      color: colors.muted,
      fontSize: 13
    },
    modalActions: {
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "flex-end"
    }
  });
}
