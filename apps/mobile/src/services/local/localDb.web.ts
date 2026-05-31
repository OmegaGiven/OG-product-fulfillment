type StoredRecord = {
  id: string;
  payload: string;
  updatedAt: number;
};

function getStorageKey(namespace: string) {
  return `og-fulfillment:${namespace}`;
}

function readNamespace(namespace: string): StoredRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getStorageKey(namespace));
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as StoredRecord[];
  } catch {
    return [];
  }
}

function writeNamespace(namespace: string, records: StoredRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getStorageKey(namespace), JSON.stringify(records));
}

export async function bootstrapDb() {
  return;
}

export async function saveRecord(namespace: string, id: string, payload: string) {
  const records = readNamespace(namespace);
  const nextRecord: StoredRecord = { id, payload, updatedAt: Date.now() };
  const filtered = records.filter((record) => record.id !== id);
  writeNamespace(namespace, [...filtered, nextRecord]);
}

export async function getRecord(namespace: string, id: string) {
  const record = readNamespace(namespace).find((entry) => entry.id === id);
  return record?.payload ?? null;
}

export async function listRecords(namespace: string) {
  return readNamespace(namespace)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((record) => record.payload);
}

export async function listNamespaceRecords(namespace: string) {
  return readNamespace(namespace)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((record) => ({
      id: record.id,
      payload: record.payload
    }));
}

export async function deleteRecords(namespace: string) {
  writeNamespace(namespace, []);
}

export async function deleteRecord(namespace: string, id: string) {
  const records = readNamespace(namespace);
  writeNamespace(
    namespace,
    records.filter((record) => record.id !== id)
  );
}
