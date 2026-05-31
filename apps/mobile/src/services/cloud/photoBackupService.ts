import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata
} from "firebase/storage";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getFirebaseApp, isFirebaseConfigured } from "./firebaseApp";

// Storage limits per tier (bytes)
export const PHOTO_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

export type PhotoBackupMeta = {
  photoId: string;
  fulfillmentId: number;
  label: "product" | "label";
  downloadUrl: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type StorageUsageSummary = {
  usedBytes: number;
  limitBytes: number;
  photoCount: number;
  usedPercent: number;
};

function getStorageRef(uid: string, photoId: string) {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase not configured.");
  const storage = getStorage(app);
  return ref(storage, `users/${uid}/photos/${photoId}`);
}

function getDb() {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase not configured.");
  return getFirestore(app);
}

export async function uploadPhoto(
  uid: string,
  photoId: string,
  fulfillmentId: number,
  label: "product" | "label",
  localUri: string,
  onProgress?: (percent: number) => void
): Promise<PhotoBackupMeta> {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase not configured.");
  }

  // Fetch the local file as a blob
  const response = await fetch(localUri);
  const blob = await response.blob();

  const storageRef = getStorageRef(uid, photoId);
  const uploadTask = uploadBytesResumable(storageRef, blob, {
    contentType: "image/jpeg",
    customMetadata: { fulfillmentId: String(fulfillmentId), label }
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(Math.round(percent));
      },
      reject,
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const metadata = await getMetadata(uploadTask.snapshot.ref);
          const sizeBytes = metadata.size ?? blob.size;
          const uploadedAt = new Date().toISOString();

          const backupMeta: PhotoBackupMeta = {
            photoId,
            fulfillmentId,
            label,
            downloadUrl,
            sizeBytes,
            uploadedAt
          };

          // Record in Firestore for storage tracking
          const db = getDb();
          await setDoc(
            doc(db, "users", uid, "photoBackups", photoId),
            { ...backupMeta, _savedAt: serverTimestamp() }
          );

          resolve(backupMeta);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function deletePhotoBackup(uid: string, photoId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const storageRef = getStorageRef(uid, photoId);
    await deleteObject(storageRef);

    const db = getDb();
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "users", uid, "photoBackups", photoId));
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function getStorageUsage(uid: string): Promise<StorageUsageSummary> {
  if (!isFirebaseConfigured()) {
    return { usedBytes: 0, limitBytes: PHOTO_STORAGE_LIMIT_BYTES, photoCount: 0, usedPercent: 0 };
  }

  try {
    const { getDocs, collection } = await import("firebase/firestore");
    const db = getDb();
    const snap = await getDocs(collection(db, "users", uid, "photoBackups"));
    const usedBytes = snap.docs.reduce((sum, d) => sum + ((d.data().sizeBytes as number) ?? 0), 0);
    const photoCount = snap.docs.length;
    const usedPercent = Math.min((usedBytes / PHOTO_STORAGE_LIMIT_BYTES) * 100, 100);
    return { usedBytes, limitBytes: PHOTO_STORAGE_LIMIT_BYTES, photoCount, usedPercent };
  } catch {
    return { usedBytes: 0, limitBytes: PHOTO_STORAGE_LIMIT_BYTES, photoCount: 0, usedPercent: 0 };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
