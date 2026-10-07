// One-time script: gets a Google OAuth2 refresh token for a personal
// Gmail account with Drive access, using a "Desktop app" OAuth client.
// Not part of the running app — run manually, once, on your own machine.
//
// Usage:
//   1. In Google Cloud Console, create an OAuth client of type "Desktop app".
//   2. Put its Client ID and Client Secret in .env.local as:
//        GOOGLE_OAUTH_CLIENT_ID=...
//        GOOGLE_OAUTH_CLIENT_SECRET=...
//   3. node -r dotenv/config scripts/get-refresh-token.js dotenv_config_path=.env.local

// Plain CommonJS on purpose: run directly with `node`, outside the app build.
/* eslint-disable @typescript-eslint/no-require-imports */

const http = require("node:http");
const { exec } = require("node:child_process");
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log("Couldn't auto-open a browser. Open this URL manually:\n" + url);
    }
  });
}

async function main() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.\n" +
        "Add them to .env.local first, then re-run.",
    );
    process.exit(1);
  }

  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token back
    prompt: "consent", // forces Google to reissue a refresh_token even if you've authorized this app before
    scope: SCOPES,
  });

  console.log("Opening your browser to authorize Drive access...");
  console.log("If it doesn't open automatically, visit this URL:\n" + authUrl + "\n");
  openBrowser(authUrl);

  const code = await new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }

      const error = url.searchParams.get("error");
      const authCode = url.searchParams.get("code");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        error
          ? "<h2>Authorization failed.</h2><p>You can close this tab and check the terminal.</p>"
          : "<h2>Authorization complete.</h2><p>You can close this tab and return to the terminal.</p>",
      );

      if (error) reject(new Error(`Google returned an error: ${error}`));
      else if (!authCode) reject(new Error("No authorization code in callback."));
      else resolve(authCode);
    });
  });

  server.close();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh_token was returned. This usually means this Google " +
        "account already granted this exact app consent before, without " +
        "'prompt: consent' forcing reissue. Go to " +
        "https://myaccount.google.com/permissions, remove access for this " +
        "app, and re-run this script.",
    );
    process.exit(1);
  }

  console.log("\nSuccess. Save this value — it is the REFRESH TOKEN:\n");
  console.log(tokens.refresh_token);
  console.log(
    "\n(The other fields Google returned — access_token, expiry_date — are " +
      "short-lived and not needed; the refresh token is used to mint new " +
      "access tokens automatically.)",
  );
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
