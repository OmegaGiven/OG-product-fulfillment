import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  serverTimestamp,
  type Firestore
} from "firebase/firestore";
import { getFirebaseApp } from "./firebaseApp";
import type {
  WorkflowTemplate,
  MessageTemplate,
  WorkflowRunState
} from "../../domain";

// Firestore structure:
//   users/{uid}/workflows/{id}
//   users/{uid}/messageTemplates/{id}
//   users/{uid}/runs/{id}          — run state without photos (too large)

function getDb(): Firestore {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase not configured.");
  return getFirestore(app);
}

function userPath(uid: string) {
  return `users/${uid}`;
}

// ── Workflows ────────────────────────────────────────────────────────────────

export async function pushWorkflow(uid: string, workflow: WorkflowTemplate): Promise<void> {
  const db = getDb();
  await setDoc(
    doc(db, userPath(uid), "workflows", String(workflow.id)),
    { ...workflow, _syncedAt: serverTimestamp() }
  );
}

export async function deleteCloudWorkflow(uid: string, workflowId: number): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, userPath(uid), "workflows", String(workflowId)));
}

export async function pullWorkflows(uid: string): Promise<WorkflowTemplate[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, userPath(uid), "workflows"));
  return snap.docs.map((d) => {
    const data = d.data();
    const { _syncedAt, ...clean } = data;
    return clean as WorkflowTemplate;
  });
}

// ── Message templates ────────────────────────────────────────────────────────

export async function pushMessageTemplate(uid: string, template: MessageTemplate): Promise<void> {
  const db = getDb();
  await setDoc(
    doc(db, userPath(uid), "messageTemplates", String(template.id)),
    { ...template, _syncedAt: serverTimestamp() }
  );
}

export async function deleteCloudMessageTemplate(uid: string, templateId: number): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, userPath(uid), "messageTemplates", String(templateId)));
}

export async function pullMessageTemplates(uid: string): Promise<MessageTemplate[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, userPath(uid), "messageTemplates"));
  return snap.docs.map((d) => {
    const data = d.data();
    const { _syncedAt, ...clean } = data;
    return clean as MessageTemplate;
  });
}

// ── Fulfillment runs ─────────────────────────────────────────────────────────

function stripPhotos(state: WorkflowRunState): Omit<WorkflowRunState, "photos"> & { photos: [] } {
  // Photos are large local files — never sync URIs which are device-specific
  return { ...state, photos: [] };
}

export async function pushRun(uid: string, state: WorkflowRunState): Promise<void> {
  const db = getDb();
  await setDoc(
    doc(db, userPath(uid), "runs", String(state.run.id)),
    { ...stripPhotos(state), _syncedAt: serverTimestamp() }
  );
}

export async function deleteCloudRun(uid: string, fulfillmentId: number): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, userPath(uid), "runs", String(fulfillmentId)));
}

export async function pullRuns(uid: string): Promise<WorkflowRunState[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, userPath(uid), "runs"));
  return snap.docs.map((d) => {
    const data = d.data();
    const { _syncedAt, ...clean } = data;
    return clean as WorkflowRunState;
  });
}

// ── Full sync ────────────────────────────────────────────────────────────────

export type SyncSummary = {
  workflows: number;
  messageTemplates: number;
  runs: number;
  syncedAt: string;
};

export async function pushAllToCloud(
  uid: string,
  data: {
    workflows: WorkflowTemplate[];
    messageTemplates: MessageTemplate[];
    runs: WorkflowRunState[];
  }
): Promise<SyncSummary> {
  await Promise.all([
    ...data.workflows.map((w) => pushWorkflow(uid, w)),
    ...data.messageTemplates.map((t) => pushMessageTemplate(uid, t)),
    ...data.runs.map((r) => pushRun(uid, r))
  ]);

  const syncedAt = new Date().toISOString();
  const db = getDb();
  await setDoc(doc(db, userPath(uid), "meta", "lastSync"), { syncedAt });

  return {
    workflows: data.workflows.length,
    messageTemplates: data.messageTemplates.length,
    runs: data.runs.length,
    syncedAt
  };
}

export async function pullAllFromCloud(uid: string): Promise<{
  workflows: WorkflowTemplate[];
  messageTemplates: MessageTemplate[];
  runs: WorkflowRunState[];
  syncedAt: string | null;
}> {
  const [workflows, messageTemplates, runs] = await Promise.all([
    pullWorkflows(uid),
    pullMessageTemplates(uid),
    pullRuns(uid)
  ]);

  const db = getDb();
  const metaSnap = await getDoc(doc(db, userPath(uid), "meta", "lastSync"));
  const syncedAt = metaSnap.exists() ? (metaSnap.data().syncedAt as string) : null;

  return { workflows, messageTemplates, runs, syncedAt };
}
