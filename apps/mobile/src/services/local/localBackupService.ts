import { Directory, File, Paths } from "expo-file-system";

import type { BackupService, BackupSummary } from "../interfaces";
import { nowIso } from "../../utils";
import { type WorkflowRunState } from "../../domain";
import {
  getSecureJson,
  setSecureJson,
  deleteSecureItem
} from "./localSecureStore";
import {
  LocalStorageService,
  MESSAGE_TEMPLATE_NAMESPACE,
  ORDER_NAMESPACE,
  ORDER_RUN_LINK_NAMESPACE,
  RUN_NAMESPACE,
  STORAGE_NAMESPACES,
  WORKFLOW_NAMESPACE
} from "./localStorageService";
import { deleteRecords, saveRecord } from "./localDb";

type StoredNamespaceRecord = {
  id: string;
  payload: string;
};

type BackupPhotoEntry = {
  photoId: number;
  fulfillmentId: number;
  label: "product" | "label";
  relativePath: string;
};

type BackupManifest = {
  version: 1;
  bundleName: string;
  exportedAt: string;
  namespaceCounts: Record<string, number>;
  namespaces: Record<string, StoredNamespaceRecord[]>;
  photoCount: number;
  photos: BackupPhotoEntry[];
  secureStore: Record<string, unknown>;
};

const MANIFEST_FILE_NAME = "manifest.json";
const TABLES_DIRECTORY_NAME = "tables";
const PHOTOS_DIRECTORY_NAME = "photos";
const SECURE_SETTINGS_FILE_NAME = "secure-store.json";
const ACCESS_CONTROL_KEY = "access-control";
const APPEARANCE_KEY = "appearance-preferences";
const CONNECTION_INDEX_KEY = "integration:index";
const OAUTH_STATE_PREFIX = "integration:oauth-state:";
const FILE_NAME_SAFE_PATTERN = /[^a-zA-Z0-9._-]/g;

function escapeCsv(value: unknown) {
  const stringValue =
    value == null
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);

  return `"${stringValue.replace(/"/g, '""')}"`;
}

function buildCsv(records: StoredNamespaceRecord[]) {
  const lines = ["record_id,payload_json"];
  for (const record of records) {
    lines.push(`${escapeCsv(record.id)},${escapeCsv(record.payload)}`);
  }
  return `${lines.join("\n")}\n`;
}

function sanitizeSegment(value: string) {
  const normalized = value.trim().replace(FILE_NAME_SAFE_PATTERN, "-");
  return normalized.length > 0 ? normalized : "file";
}

function getFileExtension(uri: string) {
  const cleanUri = uri.split("?")[0] ?? uri;
  const lastSegment = cleanUri.split("/").pop() ?? "";
  const extension = lastSegment.includes(".") ? lastSegment.slice(lastSegment.lastIndexOf(".")) : "";
  return extension.length > 0 && extension.length <= 8 ? extension : ".jpg";
}

function buildBundleName(exportedAt: string) {
  const compact = exportedAt.replace(/[:.]/g, "-");
  return `og-fulfillment-export-${compact}`;
}

function getParentUri(uri: string) {
  const segments = uri.split("/");
  segments.pop();
  return segments.join("/");
}

async function collectSecureStorePayload() {
  const secureStore: Record<string, unknown> = {};
  const staticEntries = await Promise.all([
    getSecureJson(ACCESS_CONTROL_KEY),
    getSecureJson(APPEARANCE_KEY),
    getSecureJson<number[]>(CONNECTION_INDEX_KEY)
  ]);
  const connectionIds = staticEntries[2] ?? [];

  if (staticEntries[0] != null) {
    secureStore[ACCESS_CONTROL_KEY] = staticEntries[0];
  }
  if (staticEntries[1] != null) {
    secureStore[APPEARANCE_KEY] = staticEntries[1];
  }
  if (connectionIds.length > 0) {
    secureStore[CONNECTION_INDEX_KEY] = connectionIds;
  }

  const integrationEntries = await Promise.all(
    connectionIds.flatMap((connectionId) => [
      getSecureJson(`integration:${connectionId}`),
      getSecureJson(`${OAUTH_STATE_PREFIX}${connectionId}`)
    ])
  );

  connectionIds.forEach((connectionId, index) => {
    const storedConnection = integrationEntries[index * 2];
    const oauthState = integrationEntries[index * 2 + 1];
    if (storedConnection != null) {
      secureStore[`integration:${connectionId}`] = storedConnection;
    }
    if (oauthState != null) {
      secureStore[`${OAUTH_STATE_PREFIX}${connectionId}`] = oauthState;
    }
  });

  return secureStore;
}

async function clearCurrentSecureStore() {
  const connectionIds = (await getSecureJson<number[]>(CONNECTION_INDEX_KEY)) ?? [];
  const keys = [
    ACCESS_CONTROL_KEY,
    APPEARANCE_KEY,
    CONNECTION_INDEX_KEY,
    ...connectionIds.flatMap((connectionId) => [
      `integration:${connectionId}`,
      `${OAUTH_STATE_PREFIX}${connectionId}`
    ])
  ];

  await Promise.all(keys.map((key) => deleteSecureItem(key)));
}

export class LocalBackupService implements BackupService {
  constructor(private storageService: LocalStorageService) {}

  async exportData(): Promise<BackupSummary> {
    const exportRoot = await Directory.pickDirectoryAsync();
    const exportedAt = nowIso();
    const bundleName = buildBundleName(exportedAt);
    const bundleDirectory = new Directory(exportRoot.uri, bundleName);
    bundleDirectory.create({ idempotent: true, intermediates: true });

    const tablesDirectory = new Directory(bundleDirectory, TABLES_DIRECTORY_NAME);
    const photosDirectory = new Directory(bundleDirectory, PHOTOS_DIRECTORY_NAME);
    tablesDirectory.create({ idempotent: true, intermediates: true });
    photosDirectory.create({ idempotent: true, intermediates: true });

    const namespaceEntries = await Promise.all(
      STORAGE_NAMESPACES.map(async (namespace) => [
        namespace,
        await this.storageService.listNamespaceRecords(namespace)
      ] as const)
    );

    const photos: BackupPhotoEntry[] = [];
    const namespaceCounts: Record<string, number> = {};

    for (const [namespace, records] of namespaceEntries) {
      let exportRecords = records;

      if (namespace === RUN_NAMESPACE) {
        exportRecords = [];
        for (const record of records) {
          const state = JSON.parse(record.payload) as WorkflowRunState;
          const nextPhotos = [];

          for (const photo of state.photos) {
            const sourceFile = new File(photo.uri);
            if (!sourceFile.exists) {
              throw new Error(`Missing photo file for run ${state.run.id}: ${photo.uri}`);
            }

            const photoDirectory = new Directory(
              photosDirectory,
              `run-${state.run.id}`
            );
            photoDirectory.create({ idempotent: true, intermediates: true });

            const fileName = `${photo.id}-${sanitizeSegment(photo.label)}${getFileExtension(photo.uri)}`;
            const destinationFile = new File(photoDirectory, fileName);
            sourceFile.copy(destinationFile);

            const relativePath = `${PHOTOS_DIRECTORY_NAME}/run-${state.run.id}/${fileName}`;
            photos.push({
              photoId: photo.id,
              fulfillmentId: state.run.id,
              label: photo.label,
              relativePath
            });

            nextPhotos.push({
              ...photo,
              uri: relativePath
            });
          }

          exportRecords.push({
            id: record.id,
            payload: JSON.stringify({
              ...state,
              photos: nextPhotos
            })
          });
        }
      }

      namespaceCounts[namespace] = exportRecords.length;
      const tableFile = new File(tablesDirectory, `${namespace}.csv`);
      tableFile.create({ intermediates: true, overwrite: true });
      tableFile.write(buildCsv(exportRecords));
      namespaceEntries[namespaceEntries.findIndex(([entryNamespace]) => entryNamespace === namespace)] = [
        namespace,
        exportRecords
      ];
    }

    const namespaces = Object.fromEntries(namespaceEntries) as BackupManifest["namespaces"];
    const secureStore = await collectSecureStorePayload();
    const secureStoreFile = new File(bundleDirectory, SECURE_SETTINGS_FILE_NAME);
    secureStoreFile.create({ intermediates: true, overwrite: true });
    secureStoreFile.write(`${JSON.stringify(secureStore, null, 2)}\n`);

    const manifest: BackupManifest = {
      version: 1,
      bundleName,
      exportedAt,
      namespaceCounts,
      namespaces,
      photoCount: photos.length,
      photos,
      secureStore
    };

    const manifestFile = new File(bundleDirectory, MANIFEST_FILE_NAME);
    manifestFile.create({ intermediates: true, overwrite: true });
    manifestFile.write(`${JSON.stringify(manifest, null, 2)}\n`);

    return {
      bundleName,
      exportedAt,
      namespaceCounts,
      photoCount: photos.length,
      secureKeyCount: Object.keys(secureStore).length
    };
  }

  async importData(): Promise<BackupSummary> {
    const importDirectory = await Directory.pickDirectoryAsync();
    const manifestFile = new File(importDirectory.uri, MANIFEST_FILE_NAME);
    if (!manifestFile.exists) {
      throw new Error("Selected folder does not contain a OG Fulfillment manifest.json file.");
    }
    const manifest = JSON.parse(await manifestFile.text()) as BackupManifest;

    if (manifest.version !== 1 || !manifest.namespaces || !manifest.bundleName) {
      throw new Error("Selected file is not a supported OG Fulfillment backup manifest.");
    }

    const importRoot = new Directory(Paths.document, "og-fulfillment-imports", manifest.bundleName);
    importRoot.create({ idempotent: true, intermediates: true });

    const nextRunRecords = new Map<string, StoredNamespaceRecord>();
    for (const record of manifest.namespaces[RUN_NAMESPACE] ?? []) {
      const state = JSON.parse(record.payload) as WorkflowRunState;
      const nextPhotos = [];

      for (const photo of state.photos) {
        if (!photo.uri.startsWith(`${PHOTOS_DIRECTORY_NAME}/`)) {
          nextPhotos.push(photo);
          continue;
        }

        const sourceFile = new File(importDirectory.uri, ...photo.uri.split("/"));
        if (!sourceFile.exists) {
          throw new Error(`Backup photo is missing: ${photo.uri}`);
        }

        const destinationFile = new File(importRoot.uri, ...photo.uri.split("/"));
        new Directory(getParentUri(destinationFile.uri)).create({
          idempotent: true,
          intermediates: true
        });
        sourceFile.copy(destinationFile);

        nextPhotos.push({
          ...photo,
          uri: destinationFile.uri
        });
      }

      nextRunRecords.set(record.id, {
        id: record.id,
        payload: JSON.stringify({
          ...state,
          photos: nextPhotos
        })
      });
    }

    await Promise.all(STORAGE_NAMESPACES.map((namespace) => deleteRecords(namespace)));
    for (const namespace of STORAGE_NAMESPACES) {
      const records =
        namespace === RUN_NAMESPACE
          ? Array.from(nextRunRecords.values())
          : (manifest.namespaces[namespace] ?? []);

      await Promise.all(
        records.map((record) => saveRecord(namespace, record.id, record.payload))
      );
    }

    await clearCurrentSecureStore();
    await Promise.all(
      Object.entries(manifest.secureStore ?? {}).map(([key, value]) => setSecureJson(key, value))
    );

    await this.storageService.bootstrap();

    return {
      bundleName: manifest.bundleName,
      exportedAt: manifest.exportedAt,
      namespaceCounts: manifest.namespaceCounts,
      photoCount: manifest.photoCount,
      secureKeyCount: Object.keys(manifest.secureStore ?? {}).length
    };
  }
}

export const BACKUP_NAMESPACE_LABELS = {
  [ORDER_NAMESPACE]: "Orders",
  [ORDER_RUN_LINK_NAMESPACE]: "Order Links",
  [RUN_NAMESPACE]: "Runs",
  [WORKFLOW_NAMESPACE]: "Workflows",
  [MESSAGE_TEMPLATE_NAMESPACE]: "Message Templates"
};
