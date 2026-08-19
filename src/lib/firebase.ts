"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirebasePublicConfig } from "@/lib/firebaseConfig";

type FirebaseClientGlobal = typeof globalThis & {
  __FIREBASE_CLIENT_APP__?: FirebaseApp;
  __FIREBASE_CLIENT_AUTH__?: Auth;
  __FIREBASE_CLIENT_ERROR__?: Error;
};
const globalForFirebase = globalThis as FirebaseClientGlobal;

if (!globalForFirebase.__FIREBASE_CLIENT_APP__ && !globalForFirebase.__FIREBASE_CLIENT_ERROR__) {
  try {
    const app = getApps().length ? getApp() : initializeApp(getFirebasePublicConfig());
    globalForFirebase.__FIREBASE_CLIENT_APP__ = app;
    globalForFirebase.__FIREBASE_CLIENT_AUTH__ = getAuth(app);
  } catch (error) {
    globalForFirebase.__FIREBASE_CLIENT_ERROR__ = error instanceof Error ? error : new Error(String(error));
  }
}

const initializationError = globalForFirebase.__FIREBASE_CLIENT_ERROR__ ?? null;
const resolvedApp = globalForFirebase.__FIREBASE_CLIENT_APP__ ?? null;
const resolvedAuth = globalForFirebase.__FIREBASE_CLIENT_AUTH__ ?? null;
export const auth = resolvedAuth;
export default resolvedApp;
export function tryGetClientApp() { return { app: resolvedApp, error: initializationError }; }
export function getClientApp(): FirebaseApp { if (initializationError) throw initializationError; if (!resolvedApp) throw new Error("Firebase client não pôde ser inicializado."); return resolvedApp; }
export const getClientFirebaseApp = getClientApp;
export function tryGetAuth(): { auth: Auth | null; error: Error | null } { return initializationError ? { auth: null, error: initializationError } : { auth: resolvedAuth, error: null }; }
export function getAuthClient(): Auth { if (initializationError) throw initializationError; if (!resolvedAuth) throw new Error("Firebase Auth não pôde ser inicializado."); return resolvedAuth; }
