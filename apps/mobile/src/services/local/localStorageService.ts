import type {
  FulfillmentId,
  FulfillmentRun,
  ImportedOrder,
  MessageTemplate,
  WorkflowRunState,
  WorkflowTemplate
} from "../../domain";
import {
  importedOrderSchema,
  messageTemplateSchema,
  workflowRunStateSchema,
  workflowTemplateSchema
} from "../../domain";
import type { StorageService } from "../interfaces";
import { DEFAULT_WORKFLOW_TEMPLATE } from "../../workflow/defaultWorkflow";
import { appendTouchedByUser, LOCAL_DEVICE_USER_ID } from "../../utils";
import { seededTemplates } from "./seedData";

import {
  bootstrapDb,
  deleteRecord,
  deleteRecords,
  getRecord,
  listNamespaceRecords,
  listRecords,
  saveRecord
} from "./localDb";

export const ORDER_NAMESPACE = "orders";
export const ORDER_RUN_LINK_NAMESPACE = "order_run_links";
export const RUN_NAMESPACE = "runs";
export const WORKFLOW_NAMESPACE = "workflows";
export const MESSAGE_TEMPLATE_NAMESPACE = "message_templates";
export const STORAGE_NAMESPACES = [
  ORDER_NAMESPACE,
  ORDER_RUN_LINK_NAMESPACE,
  RUN_NAMESPACE,
  WORKFLOW_NAMESPACE,
  MESSAGE_TEMPLATE_NAMESPACE
] as const;

function normalizeRecordId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }

    let hash = 0;
    for (let index = 0; index < trimmed.length; index += 1) {
      hash = (hash * 31 + trimmed.charCodeAt(index)) >>> 0;
    }
    return Math.max(1, hash);
  }

  return 1;
}

function migrateWorkflowRunState(raw: any): WorkflowRunState {
  const fulfillmentId = normalizeRecordId(raw?.run?.id);

  const migrated = {
    ...raw,
    run: {
      ...raw.run,
      id: fulfillmentId,
      workflowTemplateId: normalizeRecordId(raw?.run?.workflowTemplateId),
      matchedOrderId:
        raw?.run?.matchedOrderId == null ? null : normalizeRecordId(raw.run.matchedOrderId),
      touchedByUsers: appendTouchedByUser(
        raw?.run?.touchedByUsers,
        typeof raw?.approval?.approvedBy === "string" ? raw.approval.approvedBy : LOCAL_DEVICE_USER_ID
      )
    },
    photos: Array.isArray(raw?.photos)
      ? raw.photos.map((photo: any) => ({
          ...photo,
          id: normalizeRecordId(photo?.id),
          fulfillmentId: normalizeRecordId(photo?.fulfillmentId ?? photo?.runId ?? fulfillmentId)
        }))
      : [],
    ocrExtraction: raw?.ocrExtraction
      ? {
          ...raw.ocrExtraction,
          fulfillmentId: normalizeRecordId(
            raw.ocrExtraction.fulfillmentId ?? raw.ocrExtraction.runId ?? fulfillmentId
          ),
          sourcePhotoId:
            raw.ocrExtraction.sourcePhotoId == null
              ? undefined
              : normalizeRecordId(raw.ocrExtraction.sourcePhotoId)
        }
      : null,
    candidates: Array.isArray(raw?.candidates)
      ? raw.candidates.map((candidate: any) => ({
          ...candidate,
          orderId: normalizeRecordId(candidate?.orderId)
        }))
      : [],
    previewMessage: raw?.previewMessage
      ? {
          ...raw.previewMessage,
          id: normalizeRecordId(raw.previewMessage.id),
          fulfillmentId: normalizeRecordId(
            raw.previewMessage.fulfillmentId ?? raw.previewMessage.runId ?? fulfillmentId
          )
        }
      : null,
    approval: {
      ...raw?.approval,
      fulfillmentId: normalizeRecordId(raw?.approval?.fulfillmentId ?? raw?.approval?.runId ?? fulfillmentId)
    }
  };

  return workflowRunStateSchema.parse(migrated);
}

function migrateImportedOrder(raw: any): ImportedOrder {
  return importedOrderSchema.parse({
    ...raw,
    id: normalizeRecordId(raw?.id),
    externalOrderId: raw?.externalOrderId ?? String(raw?.id ?? ""),
    integrationConnectionId:
      raw?.integrationConnectionId == null
        ? undefined
        : normalizeRecordId(raw.integrationConnectionId)
  });
}

function migrateWorkflowTemplate(raw: any): WorkflowTemplate {
  const migratedSteps = Array.isArray(raw?.steps)
    ? raw.steps.map((step: any) => ({
        ...step,
        type: step?.type === "preview-message" ? "message-customer" : step?.type
      }))
    : raw?.steps;

  return workflowTemplateSchema.parse({
    ...raw,
    id: normalizeRecordId(raw?.id),
    steps: migratedSteps
  });
}

function shouldRefreshDefaultWorkflowTemplate(template: WorkflowTemplate) {
  if (template.id !== DEFAULT_WORKFLOW_TEMPLATE.id) {
    return false;
  }

  return (
    template.stepOrder.includes("step_confirm_order") ||
    template.stepOrder.includes("step_approve_send")
  );
}

function migrateMessageTemplate(raw: any): MessageTemplate {
  return messageTemplateSchema.parse({
    ...raw,
    id: normalizeRecordId(raw?.id)
  });
}

export class LocalStorageService implements StorageService {
  async bootstrap() {
    await bootstrapDb();
    const existingWorkflow = await this.getWorkflowTemplate(DEFAULT_WORKFLOW_TEMPLATE.id);
    if (!existingWorkflow) {
      await this.saveWorkflowTemplate(DEFAULT_WORKFLOW_TEMPLATE);
    } else if (shouldRefreshDefaultWorkflowTemplate(existingWorkflow)) {
      await this.saveWorkflowTemplate(DEFAULT_WORKFLOW_TEMPLATE);
    }
    const existingTemplates = await this.listMessageTemplates();
    if (existingTemplates.length === 0) {
      await Promise.all(seededTemplates.map((template) => this.saveMessageTemplate(template)));
    }
  }

  async listRuns(): Promise<FulfillmentRun[]> {
    const rows = await listRecords(RUN_NAMESPACE);
    return rows.map((row: string) => migrateWorkflowRunState(JSON.parse(row)).run);
  }

  async getRunState(fulfillmentId: FulfillmentId): Promise<WorkflowRunState | null> {
    const row = await getRecord(RUN_NAMESPACE, String(fulfillmentId));
    if (!row) {
      return null;
    }
    return migrateWorkflowRunState(JSON.parse(row));
  }

  async saveRunState(state: WorkflowRunState) {
    const normalizedState = workflowRunStateSchema.parse({
      ...state,
      run: {
        ...state.run,
        touchedByUsers: appendTouchedByUser(state.run.touchedByUsers, LOCAL_DEVICE_USER_ID)
      }
    });

    await saveRecord(RUN_NAMESPACE, String(normalizedState.run.id), JSON.stringify(normalizedState));
  }

  async deleteRunState(fulfillmentId: FulfillmentId) {
    await deleteRecord(RUN_NAMESPACE, String(fulfillmentId));
  }

  async listOrders(): Promise<ImportedOrder[]> {
    const rows = await listRecords(ORDER_NAMESPACE);
    return rows.map((row: string) => migrateImportedOrder(JSON.parse(row)));
  }

  async listOrderFulfillmentLinks() {
    const rows = await listRecords(ORDER_RUN_LINK_NAMESPACE);
    return rows.map(
      (row: string) => {
        const raw = JSON.parse(row);
        return {
          orderId: normalizeRecordId(raw?.orderId),
          fulfillmentId: normalizeRecordId(raw?.fulfillmentId ?? raw?.runId)
        };
      }
    );
  }

  async replaceOrders(orders: ImportedOrder[]) {
    await deleteRecords(ORDER_NAMESPACE);
    await this.saveOrders(orders);
  }

  async saveOrders(orders: ImportedOrder[]) {
    await Promise.all(
      orders.map((order) => saveRecord(ORDER_NAMESPACE, String(order.id), JSON.stringify(order)))
    );
  }

  async saveOrderFulfillmentLink(orderId: number, fulfillmentId: FulfillmentId) {
    await saveRecord(
      ORDER_RUN_LINK_NAMESPACE,
      String(orderId),
      JSON.stringify({ orderId, fulfillmentId })
    );
  }

  async listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    const rows = await listRecords(WORKFLOW_NAMESPACE);
    return rows.map((row: string) => migrateWorkflowTemplate(JSON.parse(row)));
  }

  async getWorkflowTemplate(templateId: number) {
    const row = await getRecord(WORKFLOW_NAMESPACE, String(templateId));
    return row ? migrateWorkflowTemplate(JSON.parse(row)) : null;
  }

  async saveWorkflowTemplate(template: WorkflowTemplate) {
    await saveRecord(WORKFLOW_NAMESPACE, String(template.id), JSON.stringify(template));
  }

  async deleteWorkflowTemplate(templateId: number) {
    await deleteRecord(WORKFLOW_NAMESPACE, String(templateId));
  }

  async listMessageTemplates(): Promise<MessageTemplate[]> {
    const rows = await listRecords(MESSAGE_TEMPLATE_NAMESPACE);
    return rows.map((row: string) => migrateMessageTemplate(JSON.parse(row)));
  }

  async getMessageTemplate(templateId: number) {
    const row = await getRecord(MESSAGE_TEMPLATE_NAMESPACE, String(templateId));
    return row ? migrateMessageTemplate(JSON.parse(row)) : null;
  }

  async saveMessageTemplate(template: MessageTemplate) {
    await saveRecord(MESSAGE_TEMPLATE_NAMESPACE, String(template.id), JSON.stringify(template));
  }

  async deleteMessageTemplate(templateId: number) {
    await deleteRecord(MESSAGE_TEMPLATE_NAMESPACE, String(templateId));
  }

  async listNamespaceRecords(namespace: string) {
    return listNamespaceRecords(namespace);
  }
}
