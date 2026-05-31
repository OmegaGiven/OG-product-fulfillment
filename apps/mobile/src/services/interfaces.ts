import type {
  FulfillmentPhoto,
  FulfillmentRun,
  ImportedOrder,
  MatchCandidate,
  MessageAttempt,
  MessageTemplate,
  MessageChannel,
  FulfillmentId,
  OcrExtraction,
  RecordId,
  WorkflowRunState,
  WorkflowTemplate
} from "../domain";

export type IntegrationConnection = {
  connectionId: RecordId;
  connectionName: string;
  integrationKey: string;
  integrationName: string;
  description: string;
  mode: "mock" | "live";
  connectedAt: string | null;
  lastSyncedAt: string | null;
  syncedOrderCount: number;
  hasStoredCredentials: boolean;
  hasOAuthTokens: boolean;
  fields: IntegrationCredentialField[];
  usesSecureStorage: boolean;
  supportsOAuth?: boolean;
  liveSetupNotes?: string[];
};

export type IntegrationDefinition = {
  integrationKey: string;
  integrationName: string;
  description: string;
  fields: IntegrationCredentialField[];
  supportsOAuth?: boolean;
  liveSetupNotes?: string[];
};

export type IntegrationCredentialField = {
  key: string;
  label: string;
  placeholder: string;
  secret: boolean;
};

export type IntegrationCredentialInput = {
  connectionId?: RecordId;
  connectionName: string;
  integrationKey: string;
  mode: "mock" | "live";
  values: Record<string, string>;
};

export type PreparedIntegrationOAuth = {
  connectionId: RecordId;
  integrationKey: string;
  authorizationUrl: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  requestedAt: string;
};

export type OrderFulfillmentLink = {
  orderId: RecordId;
  fulfillmentId: FulfillmentId;
};

export interface StorageService {
  bootstrap(): Promise<void>;
  listRuns(): Promise<FulfillmentRun[]>;
  getRunState(fulfillmentId: FulfillmentId): Promise<WorkflowRunState | null>;
  saveRunState(state: WorkflowRunState): Promise<void>;
  deleteRunState(fulfillmentId: FulfillmentId): Promise<void>;
  listOrders(): Promise<ImportedOrder[]>;
  listOrderFulfillmentLinks(): Promise<OrderFulfillmentLink[]>;
  replaceOrders(orders: ImportedOrder[]): Promise<void>;
  saveOrders(orders: ImportedOrder[]): Promise<void>;
  saveOrderFulfillmentLink(orderId: RecordId, fulfillmentId: FulfillmentId): Promise<void>;
  listWorkflowTemplates(): Promise<WorkflowTemplate[]>;
  getWorkflowTemplate(templateId: RecordId): Promise<WorkflowTemplate | null>;
  saveWorkflowTemplate(template: WorkflowTemplate): Promise<void>;
  deleteWorkflowTemplate(templateId: RecordId): Promise<void>;
  listMessageTemplates(): Promise<MessageTemplate[]>;
  getMessageTemplate(templateId: RecordId): Promise<MessageTemplate | null>;
  saveMessageTemplate(template: MessageTemplate): Promise<void>;
  deleteMessageTemplate(templateId: RecordId): Promise<void>;
}

export type BackupSummary = {
  bundleName: string;
  exportedAt: string;
  namespaceCounts: Record<string, number>;
  photoCount: number;
  secureKeyCount: number;
};

export interface BackupService {
  exportData(): Promise<BackupSummary>;
  importData(): Promise<BackupSummary>;
}

export interface WorkflowService {
  getDefaultWorkflow(): Promise<WorkflowTemplate>;
  listWorkflowTemplates(): Promise<WorkflowTemplate[]>;
  saveWorkflowTemplate(template: WorkflowTemplate): Promise<WorkflowTemplate>;
  deleteWorkflowTemplate(templateId: RecordId): Promise<void>;
  createFulfillmentRun(templateId?: RecordId): Promise<FulfillmentRun>;
  getRunState(fulfillmentId: FulfillmentId): Promise<WorkflowRunState | null>;
  saveRunState(state: WorkflowRunState): Promise<void>;
  deleteFulfillmentRun(fulfillmentId: FulfillmentId): Promise<void>;
  goToPreviousStep(fulfillmentId: FulfillmentId): Promise<WorkflowRunState>;
  advanceStep(fulfillmentId: FulfillmentId): Promise<WorkflowRunState>;
}

export interface OrderSyncService {
  syncOrders(connectionId?: RecordId): Promise<ImportedOrder[]>;
}

export interface OcrService {
  runOcr(fulfillmentId: FulfillmentId): Promise<OcrExtraction>;
}

export interface MatchService {
  findMatchCandidates(fulfillmentId: FulfillmentId): Promise<MatchCandidate[]>;
  confirmMatchedOrder(fulfillmentId: FulfillmentId, orderId: RecordId): Promise<WorkflowRunState>;
}

export interface MessageService {
  generateMessagePreview(fulfillmentId: FulfillmentId): Promise<MessageAttempt>;
  approveAndSend(fulfillmentId: FulfillmentId, channel: MessageChannel): Promise<WorkflowRunState>;
}

export interface IntegrationAuthService {
  listConnections(): Promise<IntegrationConnection[]>;
  listIntegrationCatalog(): Promise<IntegrationDefinition[]>;
  saveCredentials(input: IntegrationCredentialInput): Promise<IntegrationConnection>;
  prepareOAuthConnection(connectionId: RecordId): Promise<PreparedIntegrationOAuth | null>;
  completeOAuthConnectionByState(code: string, state: string): Promise<IntegrationConnection>;
  removeCredentials(connectionId: RecordId): Promise<void>;
  recordSyncResult(connectionId: RecordId, syncedOrderCount: number): Promise<void>;
  getCredentials(connectionId: RecordId): Promise<Record<string, string> | null>;
}

export interface AppServices {
  backupService: BackupService;
  storageService: StorageService;
  workflowService: WorkflowService;
  orderSyncService: OrderSyncService;
  ocrService: OcrService;
  matchService: MatchService;
  messageService: MessageService;
  integrationAuthService: IntegrationAuthService;
}
