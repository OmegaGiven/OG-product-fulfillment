import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  OAuthProvider,
  signInWithCredential,
  deleteUser,
  type User
} from "firebase/auth";
import { Platform } from "react-native";
import { getFirebaseApp, isFirebaseConfigured } from "./firebaseApp";

export type CloudUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

function toCloudUser(user: User): CloudUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase not configured. Add your Firebase project config to app.json.");
  return getAuth(app);
}

export async function signUpWithEmail(email: string, password: string): Promise<CloudUser> {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return toCloudUser(cred.user);
}

export async function signInWithEmail(email: string, password: string): Promise<CloudUser> {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return toCloudUser(cred.user);
}

export async function signInWithApple(): Promise<CloudUser> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple Sign-In is only available on iOS.");
  }

  const AppleAuthentication = await import("expo-apple-authentication");
  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL
    ]
  });

  const provider = new OAuthProvider("apple.com");
  const oauthCredential = provider.credential({
    idToken: appleCredential.identityToken ?? "",
    rawNonce: appleCredential.authorizationCode ?? undefined
  });

  const auth = getFirebaseAuth();
  const cred = await signInWithCredential(auth, oauthCredential);
  return toCloudUser(cred.user);
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
}

export async function deleteAccount(): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  await deleteUser(user);
}

export function getCurrentUser(): CloudUser | null {
  if (!isFirebaseConfigured()) return null;
  const auth = getFirebaseAuth();
  return auth.currentUser ? toCloudUser(auth.currentUser) : null;
}

export function onAuthChanged(callback: (user: CloudUser | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    callback(null);
    return () => {};
  }
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, (user) => callback(user ? toCloudUser(user) : null));
}
