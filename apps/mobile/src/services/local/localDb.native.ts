import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "og-fulfillment-v1.db";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function bootstrapDb() {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_records (
      namespace TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (namespace, id)
    );
  `);
}

export async function saveRecord(namespace: string, id: string, payload: string) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO app_records (namespace, id, payload, updated_at) VALUES (?, ?, ?, ?);`,
    [namespace, id, payload, Date.now()]
  );
}

export async function getRecord(namespace: string, id: string) {
  const db = await getDb();
  const result = await db.getFirstAsync<{ payload: string }>(
    `SELECT payload FROM app_records WHERE namespace = ? AND id = ?;`,
    [namespace, id]
  );
  return result?.payload ?? null;
}

export async function listRecords(namespace: string) {
  const db = await getDb();
  const results = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM app_records WHERE namespace = ? ORDER BY updated_at DESC;`,
    [namespace]
  );
  return results.map((row) => row.payload);
}

export async function listNamespaceRecords(namespace: string) {
  const db = await getDb();
  return db.getAllAsync<{ id: string; payload: string }>(
    `SELECT id, payload FROM app_records WHERE namespace = ? ORDER BY updated_at DESC;`,
    [namespace]
  );
}

export async function deleteRecords(namespace: string) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM app_records WHERE namespace = ?;`, [namespace]);
}

export async function deleteRecord(namespace: string, id: string) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM app_records WHERE namespace = ? AND id = ?;`, [namespace, id]);
}

async function getDb() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return databasePromise;
}
