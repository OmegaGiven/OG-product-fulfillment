import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { Pressable } from "../components/InteractivePressable";
import { TextInput } from "../components/SafeNative";
import type {
  FulfillmentPhoto,
  FulfillmentRun,
  ImportedOrder,
  WorkflowTemplate
} from "../domain";
import { useFulfillmentRun } from "../hooks/useFulfillmentRun";
import { useMessageTemplates } from "../hooks/useMessageTemplates";
import { renderMessageTemplate } from "../messages/renderMessageTemplate";
import { useAppTheme } from "../providers/AppearanceProvider";
import { useServices } from "../providers/AppProviders";
import { useToast } from "../providers/ToastProvider";
import type { AppTheme } from "../theme";
import { createLocalRecordId, nowIso } from "../utils";

type Props = {
  run: FulfillmentRun;
  workflow: WorkflowTemplate;
  onRunUpdated?: () => Promise<void>;
};

function formatAddress(order: ImportedOrder) {
  const address = order.shippingAddress;
  return [
    address.name,
    address.address1,
    address.address2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.phone
  ]
    .filter(Boolean)
    .join("\n");
}

function formatRecipient(
  recipient: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    phone?: string;
  } | null
) {
  if (!recipient) {
    return "No OCR recipient data yet.";
  }

  const cityLine = [recipient.city, recipient.state, recipient.postalCode]
    .filter(Boolean)
    .join(" ");

  return [
    recipient.name,
    recipient.address1,
    recipient.address2,
    cityLine,
    recipient.phone
  ]
    .filter(Boolean)
    .join("\n");
}

export function WorkflowScreen({ run, workflow, onRunUpdated }: Props) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { showToast } = useToast();
  const { state, refresh } = useFulfillmentRun(run.id);
  const {
    storageService,
    workflowService,
    ocrService,
    matchService,
    messageService
  } = useServices();
  const [isBusy, setIsBusy] = useState(false);
  const [orders, setOrders] = useState<ImportedOrder[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [isDebugExpanded, setIsDebugExpanded] = useState(false);
  const { templates: messageTemplates } = useMessageTemplates();

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      const nextOrders = await storageService.listOrders();
      if (isMounted) {
        setOrders(nextOrders);
      }
    }

    void loadOrders();

    return () => {
      isMounted = false;
    };
  }, [storageService, state?.run.updatedAt]);

  if (!state) {
    return null;
  }

  const currentState = state;

  const currentStepId = currentState.run.stepOrder[currentState.run.currentStepIndex];
  const currentStep = workflow.steps.find((step) => step.id === currentStepId);
  const productPhotos = currentState.photos.filter((photo) => photo.label === "product");
  const labelPhotos = currentState.photos.filter((photo) => photo.label === "label");
  const matchedOrder =
    orders.find((order) => order.id === currentState.run.matchedOrderId) ?? null;
  const selectedMessageTemplateId =
    typeof currentStep?.config.messageTemplateId === "number"
      ? currentStep.config.messageTemplateId
      : workflow.steps.find(
            (step) =>
              (step.type === "message-customer" || step.type === "approve-send") &&
              typeof step.config.messageTemplateId === "number"
          )?.config.messageTemplateId;
  const selectedMessageTemplate =
    messageTemplates.find((template) => template.id === selectedMessageTemplateId) ?? null;
  const renderedTemplatePreview =
    selectedMessageTemplate && matchedOrder
      ? renderMessageTemplate(selectedMessageTemplate, matchedOrder)
      : null;
  const messagingTool =
    typeof currentStep?.config.messagingTool === "string"
      ? currentStep.config.messagingTool
      : workflow.steps.find(
            (step) =>
              (step.type === "message-customer" || step.type === "approve-send") &&
              typeof step.config.messagingTool === "string"
          )?.config.messagingTool ?? "integration-message";
  const filteredOrders = orders.filter((order) => {
    const query = orderSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [
      order.orderNumber,
      order.buyerName,
      order.integrationName,
      order.integrationConnectionName ?? "",
      order.shippingAddress.name
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const orderSearchPresets = ["", ...new Set(orders.map((order) => order.integrationKey))];

  async function addPhoto(label: "product" | "label") {
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const photo: FulfillmentPhoto = {
        id: createLocalRecordId(),
        fulfillmentId: run.id,
        uri: result.assets[0].uri,
        label,
        createdAt: nowIso()
      };

      await storageService.saveRunState({
        ...currentState,
        photos: [...currentState.photos, photo]
      });
      await refresh();
      await onRunUpdated?.();
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    }
  }

  async function handleAdvance() {
    if (!currentStep) {
      return;
    }

    setIsBusy(true);
    try {
      if (currentStep.type === "capture-photos") {
        const hasProduct = currentState.photos.some((photo) => photo.label === "product");
        const hasLabel = currentState.photos.some((photo) => photo.label === "label");

        if (!hasProduct || !hasLabel) {
          throw new Error("Capture at least one product photo and one label photo.");
        }
      }

      if (currentStep.type === "review-photos" && currentState.photos.length === 0) {
        throw new Error("Add photos before reviewing them.");
      }

      if (currentStep.type === "ocr-match") {
        if (!currentState.ocrExtraction || currentState.candidates.length === 0) {
          await ocrService.runOcr(run.id);
          await matchService.findMatchCandidates(run.id);
          await refresh();
          await onRunUpdated?.();
          return;
        }

        if (!currentState.run.matchedOrderId) {
          throw new Error("Review the match candidates and select the correct order before continuing.");
        }
      }

      if (currentStep.type === "confirm-order" && !currentState.run.matchedOrderId) {
        throw new Error("Select the correct matched order before continuing.");
      }

      if (currentStep.type === "select-order-manual" && !currentState.run.matchedOrderId) {
        throw new Error("Select an order before continuing.");
      }

      if (currentStep.type === "message-customer") {
        if (!currentState.previewMessage) {
          await messageService.generateMessagePreview(run.id);
          await refresh();
          await onRunUpdated?.();
          return;
        }
      }

      await workflowService.advanceStep(run.id);
      await refresh();
      await onRunUpdated?.();
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsBusy(false);
    }
  }

  async function rerunOcrAndMatching() {
    setIsBusy(true);
    try {
      await ocrService.runOcr(run.id);
      await matchService.findMatchCandidates(run.id);
      await refresh();
      await onRunUpdated?.();
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBack() {
    if (currentState.run.currentStepIndex === 0) {
      return;
    }

    setIsBusy(true);
    try {
      await workflowService.goToPreviousStep(run.id);
      await refresh();
      await onRunUpdated?.();
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsBusy(false);
    }
  }

  async function chooseCandidate(orderId: number) {
    setIsBusy(true);
    try {
      await matchService.confirmMatchedOrder(run.id, orderId);
      await refresh();
      await onRunUpdated?.();
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsBusy(false);
    }
  }

  async function approveAndSend() {
    if (!currentState.previewMessage?.channel) {
      return;
    }

    setIsBusy(true);
    try {
      await messageService.approveAndSend(run.id, currentState.previewMessage.channel);
      await refresh();
      await onRunUpdated?.();
      showToast("Customer message sent.", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        {workflow.stepOrder.map((stepId, index) => {
          const step = workflow.steps.find((item) => item.id === stepId);
          const isActive = index === currentState.run.currentStepIndex;
          return (
            <View
              key={stepId}
              style={[styles.progressPill, isActive ? styles.progressPillActive : null]}
            >
              <Text style={[styles.progressText, isActive ? styles.progressTextActive : null]}>
                {index + 1}. {step?.title ?? stepId}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.featureCard}>
        <Text style={styles.cardBody}>{currentStep?.description}</Text>
      </View>

      {(currentStep?.type === "capture-photos" || currentStep?.type === "review-photos") && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photo Packet</Text>
          <Text style={styles.cardBody}>
            Capture the product set and a clear label image. Review confirms the packet is
            complete before OCR and order matching.
          </Text>
          {currentStep?.type === "capture-photos" ? (
            <View style={styles.buttonRow}>
              <Pressable onPress={() => addPhoto("product")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Capture Product Photo</Text>
              </Pressable>
              <Pressable onPress={() => addPhoto("label")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Capture Label Photo</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Product Photos</Text>
              <Text style={styles.summaryValue}>{productPhotos.length}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Label Photos</Text>
              <Text style={styles.summaryValue}>{labelPhotos.length}</Text>
            </View>
          </View>

          {currentState.photos.length === 0 ? (
            <Text style={styles.metaText}>No photos captured yet.</Text>
          ) : (
            <View style={styles.photoGrid}>
              {currentState.photos.map((photo) => (
                <View key={photo.id} style={styles.photoCard}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <View style={styles.photoMetaRow}>
                    <Text style={styles.photoLabel}>{photo.label}</Text>
                    <Text style={styles.metaText}>
                      {photo.label === "label" ? "Used for OCR" : "Product packet"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {currentStep?.type === "ocr-match" || currentStep?.type === "confirm-order" ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>OCR Review</Text>
            <Text style={styles.cardBody}>
              OCR scans the captured photos, extracts recipient details, and lets you review and confirm the best order match before continuing.
            </Text>
            {currentState.ocrExtraction ? (
              <>
                <View style={styles.buttonRow}>
                  <Pressable
                    onPress={() => void rerunOcrAndMatching()}
                    style={[styles.secondaryButton, isBusy ? styles.buttonDisabled : null]}
                    disabled={isBusy}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {isBusy ? "Running..." : "Run OCR And Matching Again"}
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.metaText}>
                  Confidence: {(currentState.ocrExtraction.confidence * 100).toFixed(0)}%
                </Text>
                <Text style={styles.compareTitle}>Parsed Recipient</Text>
                <Text style={styles.compareValue}>
                  {formatRecipient(currentState.ocrExtraction.recipient)}
                </Text>
                <Text style={styles.compareTitle}>Extracted Text</Text>
                <Text style={styles.compareValue}>{currentState.ocrExtraction.text}</Text>
              </>
            ) : (
              <>
                <Text style={styles.metaText}>
                  Run OCR to extract recipient text from the label photo packet, then review and confirm the best match here.
                </Text>
                <View style={styles.buttonRow}>
                  <Pressable
                    onPress={() => void rerunOcrAndMatching()}
                    style={[styles.secondaryButton, isBusy ? styles.buttonDisabled : null]}
                    disabled={isBusy}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {isBusy ? "Running..." : "Run OCR And Matching"}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Match Candidates</Text>
            {currentState.candidates.length === 0 ? (
              <Text style={styles.metaText}>No candidates yet. Run OCR and matching first.</Text>
            ) : (
              currentState.candidates.map((candidate) => {
                const order = orders.find((item) => item.id === candidate.orderId);
                const isSelected = currentState.run.matchedOrderId === candidate.orderId;

                return (
                  <Pressable
                    key={candidate.orderId}
                    onPress={() => chooseCandidate(candidate.orderId)}
                    style={[
                      styles.candidateRow,
                      isSelected ? styles.candidateRowSelected : null
                    ]}
                  >
                    <View style={styles.candidateHeader}>
                      <View style={styles.candidateHeaderText}>
                        <Text style={styles.candidateTitle}>
                          {order?.integrationName ?? "Order"} {order?.orderNumber ?? candidate.orderId}
                        </Text>
                        <Text style={styles.metaText}>
                          Confidence: {(candidate.confidence * 100).toFixed(0)}%
                        </Text>
                      </View>
                      <View style={styles.selectPill}>
                        <Text style={styles.selectPillText}>
                          {isSelected ? "Selected" : "Tap to select"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.compareGrid}>
                      <View style={styles.compareCard}>
                        <Text style={styles.compareTitle}>OCR Recipient</Text>
                        <Text style={styles.compareValue}>
                          {formatRecipient(currentState.ocrExtraction?.recipient ?? null)}
                        </Text>
                      </View>
                      <View style={styles.compareCard}>
                        <Text style={styles.compareTitle}>Order Address</Text>
                        <Text style={styles.compareValue}>
                          {order ? formatAddress(order) : candidate.orderId}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.metaText}>{candidate.reasons.join(" ")}</Text>
                  </Pressable>
                );
              })
            )}
          </View>

          {matchedOrder ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Selected Order</Text>
              <Text style={styles.cardBody}>
                {matchedOrder.integrationName} {matchedOrder.orderNumber}
              </Text>
              <Text style={styles.metaText}>Buyer: {matchedOrder.buyerName}</Text>
              <Text style={styles.compareValue}>{formatAddress(matchedOrder)}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {currentStep?.type === "select-order-manual" ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Manual Order Selection</Text>
            <Text style={styles.cardBody}>
              Search your pulled orders and choose one directly for this fulfillment run.
            </Text>
            <View style={styles.searchCard}>
              <Text style={styles.searchLabel}>Search Orders</Text>
              <TextInput
                value={orderSearch}
                onChangeText={setOrderSearch}
                placeholder="Search by order, buyer, platform, or store"
                placeholderTextColor={theme.colors.muted}
                style={styles.searchInput}
              />
            </View>
            <View style={styles.searchChipRow}>
              {orderSearchPresets.map((preset) => (
                <Pressable
                  key={`preset:${preset || "all"}`}
                  onPress={() => setOrderSearch(preset)}
                  style={[
                    styles.choiceChip,
                    orderSearch === preset ? styles.choiceChipActive : null
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      orderSearch === preset ? styles.choiceChipTextActive : null
                    ]}
                  >
                    {preset ? `Filter ${preset}` : "All Orders"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Available Orders</Text>
            {filteredOrders.length === 0 ? (
              <Text style={styles.metaText}>No orders match the current search.</Text>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = currentState.run.matchedOrderId === order.id;

                return (
                  <Pressable
                    key={order.id}
                    onPress={() => chooseCandidate(order.id)}
                    style={[
                      styles.candidateRow,
                      isSelected ? styles.candidateRowSelected : null
                    ]}
                  >
                    <View style={styles.candidateHeader}>
                      <View style={styles.candidateHeaderText}>
                        <Text style={styles.candidateTitle}>
                          {order.integrationConnectionName ?? order.integrationName} {order.orderNumber}
                        </Text>
                        <Text style={styles.metaText}>
                          {order.integrationName} • {order.buyerName}
                        </Text>
                      </View>
                      <View style={styles.selectPill}>
                        <Text style={styles.selectPillText}>
                          {isSelected ? "Selected" : "Tap to select"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.compareValue}>{formatAddress(order)}</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </>
      ) : null}

      {currentStep?.type === "message-customer" || currentStep?.type === "approve-send" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Message Customer</Text>
          <Text style={styles.metaText}>Delivery path: {messagingTool}</Text>
          {selectedMessageTemplate ? (
            <View style={styles.compareCard}>
              <Text style={styles.compareTitle}>Selected Template</Text>
              <Text style={styles.metaText}>{selectedMessageTemplate.name}</Text>
              <Text style={styles.metaText}>Subject template: {selectedMessageTemplate.subject}</Text>
              <Text style={styles.cardBody}>{selectedMessageTemplate.body}</Text>
            </View>
          ) : null}
          {renderedTemplatePreview ? (
            <View style={styles.compareCard}>
              <Text style={styles.compareTitle}>Rendered Email</Text>
              <Text style={styles.metaText}>Subject: {renderedTemplatePreview.subject}</Text>
              <Text style={styles.cardBody}>{renderedTemplatePreview.body}</Text>
            </View>
          ) : null}
          {currentState.previewMessage ? (
            <>
              <Text style={styles.metaText}>Channel: {currentState.previewMessage.channel}</Text>
              <Text style={styles.metaText}>Subject: {currentState.previewMessage.subject}</Text>
              <Text style={styles.cardBody}>{currentState.previewMessage.body}</Text>
              {currentState.previewMessage.status === "sent" ? (
                <Text style={styles.metaText}>This customer message has already been sent.</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.metaText}>
              Generate the message preview here, review it, and then send it from this same step. For email sends, the app currently hands off to the device mail composer; a server email provider can be added later behind the same message module.
            </Text>
          )}
        </View>
      ) : null}

      {currentStep?.type === "text-display" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Text Display Module</Text>
          <Text style={styles.cardBody}>
            {String(currentStep.config.displayText ?? "No display text configured for this step.")}
          </Text>
        </View>
      ) : null}

      {currentStep?.type === "input-step" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Input Module</Text>
          <Text style={styles.metaText}>
            Label: {String(currentStep.config.inputLabel ?? "Input")}
          </Text>
          <Text style={styles.metaText}>
            Placeholder: {String(currentStep.config.inputPlaceholder ?? "No placeholder configured")}
          </Text>
          <Text style={styles.cardBody}>
            This input module is currently a workflow placeholder. It is configurable in the workflow builder and can be expanded into saved operator input later.
          </Text>
        </View>
      ) : null}

      {currentStep?.type === "api-request" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>API Request Module (WIP)</Text>
          <Text style={styles.metaText}>
            Method: {String(currentStep.config.method ?? "POST")}
          </Text>
          <Text style={styles.metaText}>
            Endpoint: {String(currentStep.config.endpoint ?? "Not configured")}
          </Text>
          <Text style={styles.cardBody}>
            This module is marked WIP and does not execute requests yet. It currently serves as a configurable placeholder in the flow.
          </Text>
        </View>
      ) : null}

      {currentStep?.type === "custom-checkpoint" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Custom Checkpoint</Text>
          <Text style={styles.cardBody}>
            This step is a manual checkpoint. Review the instruction text above, then continue when complete.
          </Text>
        </View>
      ) : null}

      <View style={styles.navigationRow}>
        <Pressable
          onPress={handleBack}
          style={[
            styles.secondaryButton,
            run.currentStepIndex === 0 ? styles.buttonDisabled : null
          ]}
          disabled={isBusy || currentState.run.currentStepIndex === 0}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              currentState.run.currentStepIndex === 0 ? styles.buttonDisabledText : null
            ]}
          >
            Back
          </Text>
        </Pressable>

        {currentStep?.type === "message-customer" || currentStep?.type === "approve-send" ? (
          <Pressable
            onPress={currentState.previewMessage ? approveAndSend : handleAdvance}
            style={styles.primaryButton}
            disabled={isBusy || currentState.previewMessage?.status === "sent"}
          >
            <Text style={styles.primaryButtonText}>
              {isBusy
                ? currentState.previewMessage
                  ? "Sending..."
                  : "Preparing..."
                : currentState.previewMessage
                  ? currentState.previewMessage.status === "sent"
                    ? "Sent"
                    : "Message Customer"
                  : "Prepare Message"}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={handleAdvance} style={styles.primaryButton} disabled={isBusy}>
            <Text style={styles.primaryButtonText}>
              {isBusy ? "Working..." : "Next"}
            </Text>
          </Pressable>
        )}
      </View>

      {__DEV__ ? (
        <View style={styles.debugBanner}>
          <Pressable
            onPress={() => setIsDebugExpanded((current) => !current)}
            style={styles.debugBannerHeader}
          >
            <Text style={styles.debugBannerTitle}>Debug Run State</Text>
            <Text style={styles.debugBannerAction}>
              {isDebugExpanded ? "Hide" : "Show"}
            </Text>
          </Pressable>
          {isDebugExpanded ? (
            <View style={styles.debugContent}>
              <Text style={styles.metaText}>
                Matched order: {currentState.run.matchedOrderId ?? "None"}
              </Text>
              <Text style={styles.metaText}>
                Approval:{" "}
                {currentState.approval.approvedAt
                  ? `approved at ${currentState.approval.approvedAt}`
                  : "pending"}
              </Text>
              <Text style={styles.metaText}>Run status: {currentState.run.status}</Text>
              <Text style={styles.metaText}>
                Current step: {currentState.run.currentStepIndex + 1}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
const { colors, radius, spacing } = theme;
return StyleSheet.create({
  container: {
    gap: spacing.lg
  },
  progressRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  progressPill: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  progressPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  progressText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  progressTextActive: {
    color: colors.surface
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  featureCard: {
    backgroundColor: colors.backgroundAccent,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700"
  },
  cardBody: {
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
    fontWeight: "600"
  },
  metaText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  searchCard: {
    gap: spacing.sm
  },
  searchLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  searchChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  choiceChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
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
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  navigationRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center"
  },
  secondaryButton: {
    backgroundColor: colors.background,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  buttonDisabled: {
    backgroundColor: colors.backgroundAccent,
    borderColor: colors.border
  },
  buttonDisabledText: {
    color: colors.muted
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  summaryTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  summaryValue: {
    color: colors.primaryDark,
    fontSize: 28,
    fontWeight: "700"
  },
  photoGrid: {
    gap: spacing.md
  },
  photoCard: {
    gap: spacing.sm
  },
  photoPreview: {
    backgroundColor: colors.backgroundAccent,
    borderRadius: radius.lg,
    height: 220,
    width: "100%"
  },
  photoMetaRow: {
    gap: spacing.xs
  },
  photoLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  candidateRow: {
    backgroundColor: colors.backgroundAccent,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  candidateRowSelected: {
    borderColor: colors.primary,
    borderWidth: 2
  },
  candidateHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  candidateHeaderText: {
    flex: 1,
    gap: spacing.xs
  },
  candidateTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  selectPill: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  selectPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  compareGrid: {
    gap: spacing.sm
  },
  compareCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  compareTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  compareValue: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  debugBanner: {
    backgroundColor: colors.backgroundAccent,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  debugBannerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  debugBannerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  debugBannerAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700"
  },
  debugContent: {
    gap: spacing.xs
  }
});
}
