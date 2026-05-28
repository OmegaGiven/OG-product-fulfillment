import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { StepType, WorkflowStep, WorkflowTemplate } from "../../src/domain";
import { Pressable } from "../../src/components/InteractivePressable";
import { ScrollView, TextInput } from "../../src/components/SafeNative";
import { useBootstrapApp } from "../../src/hooks/useBootstrapApp";
import { useMessageTemplates } from "../../src/hooks/useMessageTemplates";
import { useWorkflowTemplates } from "../../src/hooks/useWorkflowTemplates";
import { AppNav } from "../../src/components/AppNav";
import { useAppTheme } from "../../src/providers/AppearanceProvider";
import { useToast } from "../../src/providers/ToastProvider";
import type { AppTheme } from "../../src/theme";
import { createLocalRecordId } from "../../src/utils";
import { getDefaultStepPreset, STEP_LIBRARY } from "../../src/workflow/stepLibrary";
import { cloneTemplate } from "../../src/workflow/workflowBuilder";

const MATCH_COLUMNS = [
  "name",
  "address1",
  "address2",
  "city",
  "state",
  "postalCode",
  "phone",
  "orderNumber",
  "buyerName",
  "buyerEmail"
] as const;

const OCR_TOOLS = ["native-ocr", "web-ocr", "mock-ocr"] as const;
const CAPTURE_TOOLS = ["camera", "camera-or-upload", "upload"] as const;
const MESSAGE_TOOLS = ["integration-message", "email", "manual"] as const;
const API_METHODS = ["GET", "POST", "PUT", "PATCH"] as const;

function cloneStep(step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    config: { ...step.config }
  };
}

function coerceTemplate(template: WorkflowTemplate) {
  return {
    ...cloneTemplate(template),
    steps: template.steps.map((step) => ({
      ...step,
      config:
        step.type === "capture-photos" && step.config.captureTool === "scanner"
          ? { ...step.config, captureTool: "upload" }
          : { ...step.config }
    })),
    stepOrder: [...template.steps.map((step) => step.id)]
  };
}

export default function WorkflowDetailScreen() {
  const params = useLocalSearchParams<{ workflowId: string }>();
  const workflowIdValue = Array.isArray(params.workflowId) ? params.workflowId[0] : params.workflowId;
  const workflowId = workflowIdValue ? Number(workflowIdValue) : undefined;
  const { theme } = useAppTheme();
  const { showToast } = useToast();
  const { colors } = theme;
  const styles = createStyles(theme);
  const { isReady, error: bootstrapError } = useBootstrapApp();
  const { templates, saveTemplate } = useWorkflowTemplates();
  const { templates: messageTemplates } = useMessageTemplates();
  const sourceTemplate = useMemo(
    () => templates.find((template) => template.id === workflowId) ?? null,
    [templates, workflowId]
  );
  const [draft, setDraft] = useState<WorkflowTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [openModuleTypeStepId, setOpenModuleTypeStepId] = useState<string | null>(null);
  const [openInsertMenu, setOpenInsertMenu] = useState<{
    stepId: string;
    placement: "above" | "below";
  } | null>(null);

  useEffect(() => {
    if (sourceTemplate) {
      setDraft(coerceTemplate(sourceTemplate));
    }
  }, [sourceTemplate]);

  function updateDraft(updater: (current: WorkflowTemplate) => WorkflowTemplate) {
    setDraft((current) => (current ? updater(current) : current));
  }

  function updateStep(stepId: string, updater: (step: WorkflowStep) => WorkflowStep) {
    updateDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === stepId ? updater(step) : step)),
      stepOrder: current.steps.map((step) => step.id)
    }));
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    updateDraft((current) => {
      const index = current.steps.findIndex((step) => step.id === stepId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.steps.length) {
        return current;
      }
      const nextSteps = [...current.steps];
      const [step] = nextSteps.splice(index, 1);
      nextSteps.splice(nextIndex, 0, step);
      return {
        ...current,
        steps: nextSteps,
        stepOrder: nextSteps.map((item) => item.id)
      };
    });
  }

  function removeStep(stepId: string) {
    updateDraft((current) => {
      const nextSteps = current.steps.filter((step) => step.id !== stepId);
      return {
        ...current,
        steps: nextSteps,
        stepOrder: nextSteps.map((step) => step.id)
      };
    });
  }

  function changeStepType(stepId: string, type: StepType) {
    updateDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => {
        if (step.id !== stepId) {
          return step;
        }
        const preset = getDefaultStepPreset(type);
        return {
          ...step,
          type,
          title: preset.title,
          description: preset.description,
          config: { ...(preset.config ?? {}) }
        };
      })
    }));
    setOpenModuleTypeStepId(null);
  }

  function addStep(
    type: StepType,
    options?: {
      referenceStepId?: string;
      placement?: "above" | "below";
    }
  ) {
    updateDraft((current) => {
      const preset = getDefaultStepPreset(type);
      const step: WorkflowStep = {
        id: `step_${createLocalRecordId()}`,
        type,
        title: preset.title,
        description: preset.description,
        required: true,
        optional: false,
        config: { ...(preset.config ?? {}) }
      };

      if (!options?.referenceStepId) {
        return {
          ...current,
          steps: [...current.steps, step],
          stepOrder: [...current.stepOrder, step.id]
        };
      }

      const referenceIndex = current.steps.findIndex(
        (existingStep) => existingStep.id === options.referenceStepId
      );
      if (referenceIndex < 0) {
        return {
          ...current,
          steps: [...current.steps, step],
          stepOrder: [...current.stepOrder, step.id]
        };
      }

      const insertIndex =
        options.placement === "above" ? referenceIndex : referenceIndex + 1;
      const nextSteps = [...current.steps];
      nextSteps.splice(insertIndex, 0, step);

      return {
        ...current,
        steps: nextSteps,
        stepOrder: nextSteps.map((item) => item.id)
      };
    });
    setOpenInsertMenu(null);
  }

  async function handleSave() {
    if (!draft) {
      return;
    }
    if (draft.steps.length === 0) {
      showToast("Add at least one module before saving the workflow.", {
        variant: "error",
        durationMs: 4200
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveTemplate({
        ...draft,
        stepOrder: draft.steps.map((step) => step.id)
      });
      showToast("Saved workflow", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsSaving(false);
    }
  }

  if (!isReady) {
    return (
      <View style={styles.centered}>
        <Text style={styles.pageTitle}>Preparing workflow editor...</Text>
      </View>
    );
  }

  if (bootstrapError || !draft) {
    return (
      <View style={styles.centered}>
        <Text style={styles.pageTitle}>Workflow not available</Text>
        <Text style={styles.pageBody}>{bootstrapError?.message ?? "This workflow could not be loaded."}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title={draft.name} active="workflows" />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Workflow Name</Text>
        <View style={styles.fieldGroup}>
          <TextInput
            value={draft.name}
            onChangeText={(value) => updateDraft((current) => ({ ...current, name: value }))}
            placeholder="Workflow name"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>
      </View>

      {draft.steps.map((step, index) => (
        <View key={step.id} style={styles.card}>
          <View style={styles.stepHeader}>
            <View style={styles.stepHeaderInfo}>
              <Text style={styles.cardTitle}>Step {index + 1}</Text>
              <Text style={styles.stepMeta}>{step.type}</Text>
            </View>
            <View style={styles.stepActionRow}>
              <Pressable
                onPress={() => moveStep(step.id, -1)}
                style={styles.secondaryButton}
                disabled={index === 0}
              >
                <Text style={styles.secondaryButtonText}>Move Up</Text>
              </Pressable>
              <Pressable
                onPress={() => moveStep(step.id, 1)}
                style={styles.secondaryButton}
                disabled={index === draft.steps.length - 1}
              >
                <Text style={styles.secondaryButtonText}>Move Down</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setOpenInsertMenu((current) =>
                    current?.stepId === step.id && current.placement === "above"
                      ? null
                      : { stepId: step.id, placement: "above" }
                  )
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Add Above</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setOpenInsertMenu((current) =>
                    current?.stepId === step.id && current.placement === "below"
                      ? null
                      : { stepId: step.id, placement: "below" }
                  )
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Add Below</Text>
              </Pressable>
              <Pressable onPress={() => removeStep(step.id)} style={styles.ghostButton}>
                <Text style={styles.ghostButtonText}>Remove</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Module Type</Text>
            <View style={styles.dropdownGroup}>
              <Pressable
                onPress={() =>
                  setOpenModuleTypeStepId((current) => (current === step.id ? null : step.id))
                }
                style={styles.dropdownTrigger}
              >
                <Text style={styles.dropdownTriggerText}>
                  {STEP_LIBRARY.find((item) => item.type === step.type)?.title ?? step.type}
                </Text>
                <Text style={styles.dropdownChevron}>
                  {openModuleTypeStepId === step.id ? "▲" : "▼"}
                </Text>
              </Pressable>

              {openModuleTypeStepId === step.id ? (
                <View style={styles.dropdownMenu}>
                  {STEP_LIBRARY.map((item) => {
                    const isActive = item.type === step.type;
                    return (
                      <Pressable
                        key={`${step.id}:${item.type}`}
                        onPress={() => changeStepType(step.id, item.type)}
                        style={[styles.dropdownOption, isActive ? styles.dropdownOptionActive : null]}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionTitle,
                            isActive ? styles.dropdownOptionTitleActive : null
                          ]}
                        >
                          {item.title}
                        </Text>
                        <Text style={styles.dropdownOptionMeta}>{item.type}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>

          {step.type === "capture-photos" ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Capture Tool</Text>
              <View style={styles.chipRow}>
                {CAPTURE_TOOLS.map((tool) => {
                  const selectedCaptureTool =
                    step.config.captureTool === "scanner" ? "upload" : (step.config.captureTool ?? "camera");
                  const isActive = selectedCaptureTool === tool;
                  return (
                    <Pressable
                      key={`${step.id}:${tool}`}
                      onPress={() =>
                        updateStep(step.id, (current) => ({
                          ...current,
                          config: { ...current.config, captureTool: tool }
                        }))
                      }
                      style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                    >
                      <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>
                        {tool}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step.type === "ocr-match" ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>OCR Tool</Text>
                <View style={styles.chipRow}>
                  {OCR_TOOLS.map((tool) => {
                    const isActive = (step.config.ocrTool ?? "native-ocr") === tool;
                    return (
                      <Pressable
                        key={`${step.id}:${tool}`}
                        onPress={() =>
                          updateStep(step.id, (current) => ({
                            ...current,
                            config: { ...current.config, ocrTool: tool }
                          }))
                        }
                        style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                      >
                        <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>
                          {tool}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Match Columns</Text>
                <View style={styles.chipRow}>
                  {MATCH_COLUMNS.map((column) => {
                    const columns = Array.isArray(step.config.matchColumns)
                      ? (step.config.matchColumns as string[])
                      : ["name", "address1", "city", "state", "postalCode", "phone"];
                    const isActive = columns.includes(column);
                    return (
                      <Pressable
                        key={`${step.id}:${column}`}
                        onPress={() =>
                          updateStep(step.id, (current) => {
                            const nextColumns = Array.isArray(current.config.matchColumns)
                              ? [...(current.config.matchColumns as string[])]
                              : ["name", "address1", "city", "state", "postalCode", "phone"];
                            const updatedColumns = nextColumns.includes(column)
                              ? nextColumns.filter((value) => value !== column)
                              : [...nextColumns, column];
                            return {
                              ...current,
                              config: {
                                ...current.config,
                                matchColumns: updatedColumns
                              }
                            };
                          })
                        }
                        style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                      >
                        <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>
                          {column}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}

          {step.type === "message-customer" || step.type === "approve-send" ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Messaging Tool</Text>
                <View style={styles.chipRow}>
                  {MESSAGE_TOOLS.map((tool) => {
                    const isActive = (step.config.messagingTool ?? "integration-message") === tool;
                    return (
                      <Pressable
                        key={`${step.id}:${tool}`}
                        onPress={() =>
                          updateStep(step.id, (current) => ({
                            ...current,
                            config: { ...current.config, messagingTool: tool }
                          }))
                        }
                        style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                      >
                        <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>
                          {tool}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Message Template</Text>
                <View style={styles.chipRow}>
                  {messageTemplates.map((template) => {
                    const isActive = step.config.messageTemplateId === template.id;
                    return (
                      <Pressable
                        key={`${step.id}:${template.id}`}
                        onPress={() =>
                          updateStep(step.id, (current) => ({
                            ...current,
                            config: { ...current.config, messageTemplateId: template.id }
                          }))
                        }
                        style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                      >
                        <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>
                          {template.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}

          {step.type === "text-display" ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Display Text</Text>
              <TextInput
                multiline
                value={String(step.config.displayText ?? "")}
                onChangeText={(value) =>
                  updateStep(step.id, (current) => ({
                    ...current,
                    config: { ...current.config, displayText: value }
                  }))
                }
                placeholder="Instructions or text shown to the operator"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.textArea]}
              />
            </View>
          ) : null}

          {step.type === "input-step" ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Input Label</Text>
                <TextInput
                  value={String(step.config.inputLabel ?? "")}
                  onChangeText={(value) =>
                    updateStep(step.id, (current) => ({
                      ...current,
                      config: { ...current.config, inputLabel: value }
                    }))
                  }
                  placeholder="What should the operator enter?"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Input Placeholder</Text>
                <TextInput
                  value={String(step.config.inputPlaceholder ?? "")}
                  onChangeText={(value) =>
                    updateStep(step.id, (current) => ({
                      ...current,
                      config: { ...current.config, inputPlaceholder: value }
                    }))
                  }
                  placeholder="Placeholder text"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>
            </>
          ) : null}

          {step.type === "api-request" ? (
            <>
              <View style={styles.wipCard}>
                <Text style={styles.wipTitle}>API Request (WIP)</Text>
                <Text style={styles.wipBody}>
                  This module is intentionally partial for now. You can outline the endpoint and method, and later we can expand it into a real request builder.
                </Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>HTTP Method</Text>
                <View style={styles.chipRow}>
                  {API_METHODS.map((method) => {
                    const isActive = (step.config.method ?? "POST") === method;
                    return (
                      <Pressable
                        key={`${step.id}:${method}`}
                        onPress={() =>
                          updateStep(step.id, (current) => ({
                            ...current,
                            config: { ...current.config, method }
                          }))
                        }
                        style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                      >
                        <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>
                          {method}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Endpoint</Text>
                <TextInput
                  value={String(step.config.endpoint ?? "")}
                  onChangeText={(value) =>
                    updateStep(step.id, (current) => ({
                      ...current,
                      config: { ...current.config, endpoint: value }
                    }))
                  }
                  placeholder="https://api.example.com/endpoint"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>
            </>
          ) : null}

          {openInsertMenu?.stepId === step.id ? (
            <View style={styles.insertMenuCard}>
              <Text style={styles.fieldLabel}>
                Add Module {openInsertMenu.placement === "above" ? "Above" : "Below"} Step {index + 1}
              </Text>
              <View style={styles.chipRow}>
                {STEP_LIBRARY.map((libraryStep) => (
                  <Pressable
                    key={`${step.id}:${openInsertMenu.placement}:${libraryStep.type}`}
                    onPress={() =>
                      addStep(libraryStep.type, {
                        referenceStepId: step.id,
                        placement: openInsertMenu.placement
                      })
                    }
                    style={styles.choiceChip}
                  >
                    <Text style={styles.choiceChipText}>{libraryStep.title}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ))}

      {draft.steps.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add First Module</Text>
          <View style={styles.chipRow}>
            {STEP_LIBRARY.map((step) => (
              <Pressable
                key={`add:first:${step.type}`}
                onPress={() => addStep(step.type)}
                style={styles.choiceChip}
              >
                <Text style={styles.choiceChipText}>{step.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Pressable onPress={handleSave} style={styles.primaryButton} disabled={isSaving}>
        <Text style={styles.primaryButtonText}>{isSaving ? "Saving..." : "Save Workflow"}</Text>
      </Pressable>
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
      gap: spacing.sm,
      justifyContent: "center",
      padding: spacing.xl
    },
    pageTitle: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "700"
    },
    pageBody: {
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
    card: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.xl
    },
    cardTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "700"
    },
    stepHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      justifyContent: "space-between"
    },
    stepHeaderInfo: {
      flex: 1,
      gap: 2,
      minWidth: 180
    },
    stepMeta: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase"
    },
    fieldGroup: {
      gap: spacing.xs
    },
    dropdownGroup: {
      gap: spacing.xs
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    dropdownTrigger: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    dropdownTriggerText: {
      color: colors.text,
      flex: 1,
      fontSize: 15,
      fontWeight: "600"
    },
    dropdownChevron: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      marginLeft: spacing.sm
    },
    dropdownMenu: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      overflow: "hidden"
    },
    dropdownOption: {
      backgroundColor: colors.surfaceRaised,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      gap: 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2
    },
    dropdownOptionActive: {
      backgroundColor: colors.accentSoft
    },
    dropdownOptionTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    dropdownOptionTitleActive: {
      color: colors.text
    },
    dropdownOptionMeta: {
      color: colors.muted,
      fontSize: 12
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
    textArea: {
      minHeight: 88,
      textAlignVertical: "top"
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    choiceChip: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    choiceChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent
    },
    choiceChipText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700"
    },
    choiceChipTextActive: {
      color: colors.text
    },
    wipCard: {
      backgroundColor: colors.background,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.md
    },
    insertControlsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    insertMenuCard: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md
    },
    wipTitle: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700"
    },
    wipBody: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20
    },
    stepActionRow: {
      justifyContent: "flex-end",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
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
    },
    secondaryButton: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    ghostButton: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    ghostButtonText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "700"
    }
  });
}
