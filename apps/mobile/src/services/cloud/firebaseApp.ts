import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import Constants from "expo-constants";

// Fill these in with your Firebase project config from console.firebase.google.com
// Project settings → General → Your apps → SDK setup and configuration
// These values are safe to commit — security is enforced by Firestore rules.
const FIREBASE_CONFIG = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey ?? "",
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain ?? "",
  projectId: Constants.expoConfig?.extra?.firebaseProjectId ?? "",
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket ?? "",
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId ?? "",
  appId: Constants.expoConfig?.extra?.firebaseAppId ?? ""
};

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!FIREBASE_CONFIG.projectId) {
    return null;
  }
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }
  app = initializeApp(FIREBASE_CONFIG);
  return app;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);
}
