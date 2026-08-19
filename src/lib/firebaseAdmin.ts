// server-only
import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import type { App } from "firebase-admin/app";

type ServiceAccountConfig = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

type FirebaseAdminGlobal = typeof globalThis & {
  __FIREBASE_ADMIN_APP__?: App | null;
  __FIREBASE_ADMIN_MISSING_CONFIG_WARNED__?: boolean;
};

const globalForAdmin = globalThis as FirebaseAdminGlobal;

let adminApp: App | null =
  globalForAdmin.__FIREBASE_ADMIN_APP__ ?? null;
let missingAdminConfigWarned = globalForAdmin.__FIREBASE_ADMIN_MISSING_CONFIG_WARNED__ ?? false;

function readServiceAccountFromBase64(): ServiceAccountConfig | null {
  const base64 =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_ADMIN_JSON_BASE64;

  if (!base64) return null;

  try {
    const trimmed = base64.trim();
    if (!trimmed) return null;
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as {
      project_id?: string;
      projectId?: string;
      client_email?: string;
      clientEmail?: string;
      private_key?: string;
      privateKey?: string;
    };

    return {
      projectId: parsed.project_id ?? parsed.projectId,
      clientEmail: parsed.client_email ?? parsed.clientEmail,
      privateKey: parsed.private_key ?? parsed.privateKey,
    };
  } catch (error) {
    console.error("[firebaseAdmin] Falha ao ler FIREBASE_*_BASE64", error);
    return null;
  }
}

function readServiceAccountFromEnv(): ServiceAccountConfig {
  const base64Config = readServiceAccountFromBase64();
  if (base64Config?.projectId && base64Config?.clientEmail && base64Config?.privateKey) {
    return base64Config;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    base64Config?.clientEmail;

  const rawPrivateKey =
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    base64Config?.privateKey;

  let privateKey = rawPrivateKey;
  if (typeof privateKey === "string" && privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  return { projectId: projectId ?? undefined, clientEmail, privateKey };
}

function logMissingAdminConfig() {
  if (missingAdminConfigWarned) return;
  console.warn(
    "[firebaseAdmin] Service account credentials are not fully configured. Firebase Admin features are disabled until the environment variables are provided.",
  );
  missingAdminConfigWarned = true;
  globalForAdmin.__FIREBASE_ADMIN_MISSING_CONFIG_WARNED__ = true;
}

export function getAdminApp() {
  const { projectId, clientEmail, privateKey } = readServiceAccountFromEnv();

  if (!projectId || !clientEmail || !privateKey) {
    logMissingAdminConfig();
    return null;
  }

  if (!adminApp) {
    const existingApp = getApps()[0];
    if (existingApp) {
      adminApp = existingApp;
    } else {
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });
    }
    globalForAdmin.__FIREBASE_ADMIN_APP__ = adminApp;
  }

  return adminApp;
}
