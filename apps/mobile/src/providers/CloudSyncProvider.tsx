import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type PropsWithChildren
} from "react";
import { onAuthChanged, type CloudUser } from "../services/cloud/cloudAuthService";
import { pushAllToCloud, pullAllFromCloud, type SyncSummary } from "../services/cloud/cloudSyncService";
import { isFirebaseConfigured } from "../services/cloud/firebaseApp";
import type { AppServices } from "../services/interfaces";

type SyncStatus = "idle" | "syncing" | "error";

type CloudSyncContextValue = {
  user: CloudUser | null;
  isConfigured: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  pushToCloud: () => Promise<SyncSummary | null>;
  pullFromCloud: () => Promise<void>;
};

const CloudSyncContext = createContext<CloudSyncContextValue>({
  user: null,
  isConfigured: false,
  syncStatus: "idle",
  lastSyncedAt: null,
  lastError: null,
  pushToCloud: async () => null,
  pullFromCloud: async () => {}
});

type Props = PropsWithChildren<{ services: AppServices }>;

export function CloudSyncProvider({ children, services }: Props) {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const isConfigured = isFirebaseConfigured();

  useEffect(() => {
    return onAuthChanged((nextUser) => {
      setUser(nextUser);
    });
  }, []);

  const pushToCloud = useCallback(async (): Promise<SyncSummary | null> => {
    if (!user) return null;
    setSyncStatus("syncing");
    setLastError(null);
    try {
      const [workflows, messageTemplates, runs] = await Promise.all([
        services.storageService.listWorkflowTemplates(),
        services.storageService.listMessageTemplates(),
        services.storageService.listRuns().then((runList) =>
          Promise.all(
            runList.map((run) => services.storageService.getRunState(run.id))
          )
        ).then((states) => states.filter((s): s is NonNullable<typeof s> => !!s))
      ]);

      const summary = await pushAllToCloud(user.uid, { workflows, messageTemplates, runs });
      setLastSyncedAt(summary.syncedAt);
      setSyncStatus("idle");
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      setSyncStatus("error");
      return null;
    }
  }, [user, services]);

  const pullFromCloud = useCallback(async (): Promise<void> => {
    if (!user) return;
    setSyncStatus("syncing");
    setLastError(null);
    try {
      const cloudData = await pullAllFromCloud(user.uid);

      // Merge workflows — cloud wins, preserve any local-only ones
      const localWorkflows = await services.storageService.listWorkflowTemplates();
      const cloudWorkflowIds = new Set(cloudData.workflows.map((w) => w.id));
      const localOnlyWorkflows = localWorkflows.filter((w) => !cloudWorkflowIds.has(w.id));
      for (const workflow of [...cloudData.workflows, ...localOnlyWorkflows]) {
        await services.storageService.saveWorkflowTemplate(workflow);
      }

      // Merge message templates — same strategy
      const localTemplates = await services.storageService.listMessageTemplates();
      const cloudTemplateIds = new Set(cloudData.messageTemplates.map((t) => t.id));
      const localOnlyTemplates = localTemplates.filter((t) => !cloudTemplateIds.has(t.id));
      for (const template of [...cloudData.messageTemplates, ...localOnlyTemplates]) {
        await services.storageService.saveMessageTemplate(template);
      }

      // Merge runs — cloud wins, preserve local photos
      for (const cloudRun of cloudData.runs) {
        const localState = await services.storageService.getRunState(cloudRun.run.id);
        const mergedState = {
          ...cloudRun,
          // Keep local photos since they're device-specific file URIs
          photos: localState?.photos ?? []
        };
        await services.storageService.saveRunState(mergedState);
      }

      setLastSyncedAt(cloudData.syncedAt ?? new Date().toISOString());
      setSyncStatus("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      setSyncStatus("error");
    }
  }, [user, services]);

  // Auto-sync on login
  useEffect(() => {
    if (user) {
      void pullFromCloud();
    }
  }, [user?.uid]);

  return (
    <CloudSyncContext.Provider
      value={{ user, isConfigured, syncStatus, lastSyncedAt, lastError, pushToCloud, pullFromCloud }}
    >
      {children}
    </CloudSyncContext.Provider>
  );
}

export function useCloudSync() {
  return useContext(CloudSyncContext);
}
