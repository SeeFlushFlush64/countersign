import { randomUUID } from "node:crypto";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const UPLOAD_URI =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";

// Drive access is via OAuth2 as a real Google account (see
// scripts/get-refresh-token.js), not a service account — service accounts
// have no storage quota of their own and can't write into a personal
// Gmail Drive without a Shared Drive or domain-wide delegation, neither
// of which applies here.
async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth credentials are not configured.");
  }

  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Google token refresh failed: ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// Drive archiving is optional: environments without these variables (the
// seed script, a fresh clone) skip it instead of logging a failure.
export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_FOLDER_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
}

export async function uploadPdfToDrive(
  fileName: string,
  pdf: Buffer,
): Promise<{ id: string; webViewLink?: string }> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");
  }

  const accessToken = await getAccessToken();
  const boundary = `countersign-${randomUUID()}`;
  const metadata = { name: fileName, parents: [folderId] };

  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/pdf\r\n\r\n`,
    "utf-8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf-8");
  const body = Buffer.concat([head, pdf, tail]);

  const res = await fetch(UPLOAD_URI, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}
