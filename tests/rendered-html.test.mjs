import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
let productionServer;
let baseUrl;
let serverOutput = "";

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Production server did not start.\n${serverOutput}`);
}

before(async () => {
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  productionServer = spawn(
    process.execPath,
    [
      wranglerCli,
      "dev",
      "--config",
      "dist/server/wrangler.json",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--local",
      "--log-level",
      "error",
      "--show-interactive-dev-session",
      "false",
    ],
    { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  productionServer.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  productionServer.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  await waitForServer(baseUrl);
});

after(() => {
  productionServer?.kill();
});

test("production server renders the Moon Goons mission shell", async () => {
  const response = await fetch(baseUrl, {
    headers: { accept: "text/html" },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Moon Goons — Practice Moon \| Moon Goons<\/title>/i);
  assert.match(html, /SUIT UP/);
  assert.match(html, /TRY NOT TO FLOAT/);
  assert.match(html, /SOLO FIELD TEST/);
  assert.match(html, /Playable third-person 3D Practice Moon extraction mission/);
  assert.match(html, /MULTIPLAYER CORE 6A \/\/ CREW LINK TRANSPORT SPIKE/);
  assert.match(html, /BUILD 018/);
  assert.match(html, /HOST CREW/);
  assert.match(html, /JOIN CREW/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("production server delivers every stylesheet and script referenced by the page", async () => {
  const html = await (await fetch(baseUrl)).text();
  const assetPaths = [
    ...html.matchAll(/(?:src|href)="(\/[^"?#]+\.(?:js|css))[^\"]*"/g),
  ].map((match) => match[1]);

  assert.ok(assetPaths.length >= 2, "expected rendered scripts and stylesheets");
  const results = await Promise.all(
    [...new Set(assetPaths)].map(async (assetPath) => ({
      assetPath,
      response: await fetch(new URL(assetPath, baseUrl)),
    })),
  );
  for (const { assetPath, response } of results) {
    assert.equal(response.status, 200, `${assetPath} should load`);
  }
});

test("field-notes endpoint validates an empty report without touching storage", async () => {
  const response = await fetch(new URL("/api/field-notes", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "Add your name or initials.");
});

test("crew endpoint validates an empty call sign without touching storage", async () => {
  const response = await fetch(new URL("/api/crew", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create", name: "" }),
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "Use a call sign with at least two characters.");
});
