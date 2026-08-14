import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
let productionServer;
let baseUrl;
let serverOutput = "";
let persistenceDirectory;
let testWranglerConfig;

async function runWrangler(args) {
  return new Promise((resolve, reject) => {
    const command = spawn(process.execPath, [wranglerCli, ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: persistenceDirectory
          ? path.join(persistenceDirectory, "wrangler.log")
          : undefined,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    command.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    command.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    command.once("error", reject);
    command.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Wrangler command failed (${code}).\n${output}`));
    });
  });
}

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
  persistenceDirectory = await mkdtemp(path.join(projectRoot, ".wrangler-test-"));
  const persistenceArgument = path.relative(projectRoot, persistenceDirectory);
  testWranglerConfig = path.join(
    projectRoot,
    "dist",
    "server",
    `wrangler.test-${path.basename(persistenceDirectory)}.json`,
  );
  await writeFile(
    testWranglerConfig,
    JSON.stringify({
      name: "moon-goons-test",
      compatibility_date: "2026-05-15",
      compatibility_flags: ["nodejs_compat"],
      main: "index.js",
      no_bundle: true,
      rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
      assets: { directory: "../client" },
      d1_databases: [
        {
          binding: "DB",
          database_name: "site-creator-d1",
          database_id: "00000000-0000-4000-8000-000000000000",
        },
      ],
    }),
  );
  const migrationDirectory = path.join(projectRoot, "drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const migrationFile of migrationFiles) {
    await runWrangler([
      "d1",
      "execute",
      "site-creator-d1",
      "--local",
      "--config",
      testWranglerConfig,
      "--persist-to",
      persistenceArgument,
      "--file",
      path.join(migrationDirectory, migrationFile),
    ]);
  }
  productionServer = spawn(
    process.execPath,
    [
      wranglerCli,
      "dev",
      "--config",
      testWranglerConfig,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--local",
      "--persist-to",
      persistenceArgument,
      "--log-level",
      "error",
      "--show-interactive-dev-session",
      "false",
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: path.join(persistenceDirectory, "wrangler.log"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  productionServer.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  productionServer.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  await waitForServer(baseUrl);
});

after(async () => {
  if (productionServer && productionServer.exitCode === null) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      productionServer.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      productionServer.kill();
    });
  }
  if (persistenceDirectory) {
    await rm(persistenceDirectory, {
      recursive: true,
      force: true,
      maxRetries: 6,
      retryDelay: 150,
    });
  }
  if (testWranglerConfig) {
    await unlink(testWranglerConfig).catch(() => undefined);
  }
});

test("production server renders the Moon Goons mission shell", async () => {
  const response = await fetch(baseUrl, {
    headers: { accept: "text/html" },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Moon Goons — Two-Destination Field Test \| Moon Goons<\/title>/i);
  assert.match(html, /THE QUESTIONABLE DECISION/);
  assert.match(html, /OPEN OPS TERMINAL/);
  assert.match(html, /PERSONAL \/\/ THIS DEVICE/);
  assert.match(html, /CREW-SHARED \/\/ THIS RUN/);
  assert.match(html, /Contract Control/);
  assert.match(html, /Crew Link Uplink/);
  assert.match(html, /Playable third-person 3D The Practice Moon extraction mission/);
  assert.match(html, /DECK 03 \/\/ PROCUREMENT \+ CREW OPERATIONS/);
  assert.match(html, /BUILD 032/);
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

test("Crew Link preserves queued actions, cases, signals, rescue state, and clean shutdown", async () => {
  const createResponse = await fetch(new URL("/api/crew", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create", name: "CAPTAIN TEST" }),
  });
  assert.equal(createResponse.status, 201);
  const { session: host } = await createResponse.json();
  assert.equal(host.role, "host");
  assert.match(host.roomCode, /^[A-Z2-9]{5}$/);

  const joinResponse = await fetch(new URL("/api/crew", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "join",
      name: "CART INTERN",
      roomCode: host.roomCode,
    }),
  });
  assert.equal(joinResponse.status, 201);
  const { session: guest } = await joinResponse.json();
  assert.equal(guest.role, "guest");
  assert.equal(guest.missionSeed, host.missionSeed);

  const crewUrl = (session) =>
    new URL(
      `/api/crew?room=${encodeURIComponent(session.roomCode)}&member=${encodeURIComponent(
        session.memberId,
      )}`,
      baseUrl,
    );
  const headersFor = (session) => ({
    "content-type": "application/json",
    "x-crew-token": session.token,
  });
  const state = {
    missionSeed: host.missionSeed,
    contractId: "rust_belt_salvage",
    phase: "active",
    time: 180,
    score: 0,
    message: "Crew contract live.",
    cart: {
      position: [-7.5, 0.3, 7.2],
      yaw: -0.18,
      ownerId: null,
      cargoIds: [],
    },
    facility: {
      relayMask: 3,
      vaultOpen: false,
      railPulse: 0.65,
    },
    pings: [
      {
        id: "test-cargo-ping",
        memberId: guest.memberId,
        memberName: "CART INTERN",
        kind: "cargo",
        position: [8.5, 0.05, -3.25],
        remaining: 7.5,
      },
    ],
    rescueAssists: [
      {
        targetMemberId: host.memberId,
        helperMemberId: guest.memberId,
        helperName: "CART INTERN",
        remaining: 2.2,
      },
    ],
    fieldToolCases: [
      {
        id: "field-case-corer",
        toolId: "corer",
        position: [8.5, 1.5, -3.25],
        velocity: [4.2, 2.8, -1.4],
        ownerId: null,
        isBallistic: true,
        bounceCount: 1,
      },
    ],
    deposits: [],
    stats: {
      repairsCompleted: 0,
      airmailDeliveries: 0,
      bankShotDeliveries: 0,
      stuntBonus: 0,
      cargoBounces: 0,
      brokenSamples: 0,
    },
  };

  const launchResponse = await fetch(crewUrl(host), {
    method: "PATCH",
    headers: headersFor(host),
    body: JSON.stringify({
      presence: { x: -12, y: 0, z: 5, yaw: 0, inputMask: 0 },
      phase: "active",
      authoritativeState: state,
    }),
  });
  assert.equal(launchResponse.status, 200);
  const launched = await launchResponse.json();
  assert.equal(launched.room.phase, "active");
  assert.equal(launched.room.members.length, 2);

  const actionResponse = await fetch(crewUrl(guest), {
    method: "PATCH",
    headers: headersFor(guest),
    body: JSON.stringify({
      presence: { x: 8.5, y: 0, z: -3.25, yaw: 0.7, inputMask: 34 },
      action: { sequence: 1, type: "cart_toggle" },
    }),
  });
  assert.equal(actionResponse.status, 200);

  const burstActionResponse = await fetch(crewUrl(guest), {
    method: "PATCH",
    headers: headersFor(guest),
    body: JSON.stringify({
      presence: { x: 8.75, y: 0, z: -3, yaw: 0.72, inputMask: 34 },
      action: { sequence: 2, type: "ping_cargo" },
    }),
  });
  assert.equal(burstActionResponse.status, 200);

  const rescueActionResponse = await fetch(crewUrl(guest), {
    method: "PATCH",
    headers: headersFor(guest),
    body: JSON.stringify({
      presence: { x: 9, y: 0, z: -2.8, yaw: 0.75, inputMask: 34 },
      action: { sequence: 3, type: "rescue" },
    }),
  });
  assert.equal(rescueActionResponse.status, 200);

  const toolThrowResponse = await fetch(crewUrl(guest), {
    method: "PATCH",
    headers: headersFor(guest),
    body: JSON.stringify({
      presence: { x: 9.1, y: 0, z: -2.7, yaw: 0.76, inputMask: 34 },
      action: { sequence: 4, type: "tool_throw" },
    }),
  });
  assert.equal(toolThrowResponse.status, 200);

  const hostPollResponse = await fetch(crewUrl(host), {
    headers: { "x-crew-token": host.token },
  });
  assert.equal(hostPollResponse.status, 200);
  const hostPoll = await hostPollResponse.json();
  assert.equal(hostPoll.room.members.length, 2);
  const remoteMember = hostPoll.room.members.find(
    (member) => member.id === guest.memberId,
  );
  assert.equal(remoteMember.x, 9.1);
  assert.equal(remoteMember.z, -2.7);
  assert.equal(remoteMember.inputMask, 34);
  assert.equal(hostPoll.room.actions.length, 4);
  assert.equal(hostPoll.room.actions[0].type, "cart_toggle");
  assert.equal(hostPoll.room.actions[1].type, "ping_cargo");
  assert.equal(hostPoll.room.actions[2].type, "rescue");
  assert.equal(hostPoll.room.actions[3].type, "tool_throw");

  const acknowledgedState = {
    ...state,
    time: 179.5,
    message: "Cargo cart hitch accepted.",
    cart: {
      ...state.cart,
      ownerId: guest.memberId,
    },
  };
  const acknowledgeResponse = await fetch(crewUrl(host), {
    method: "PATCH",
    headers: headersFor(host),
    body: JSON.stringify({
      presence: { x: -12, y: 0, z: 5, yaw: 0, inputMask: 0 },
      authoritativeState: acknowledgedState,
      ackActionId: hostPoll.room.actions[3].id,
    }),
  });
  assert.equal(acknowledgeResponse.status, 200);

  const guestPollResponse = await fetch(crewUrl(guest), {
    headers: { "x-crew-token": guest.token },
  });
  assert.equal(guestPollResponse.status, 200);
  const guestPoll = await guestPollResponse.json();
  assert.equal(guestPoll.room.actionCursor, hostPoll.room.actions[3].id);
  assert.equal(guestPoll.room.authoritativeState.message, "Cargo cart hitch accepted.");
  assert.equal(guestPoll.room.authoritativeState.contractId, "rust_belt_salvage");
  assert.equal(guestPoll.room.authoritativeState.cart.ownerId, guest.memberId);
  assert.deepEqual(guestPoll.room.authoritativeState.facility, state.facility);
  assert.deepEqual(guestPoll.room.authoritativeState.pings, state.pings);
  assert.deepEqual(
    guestPoll.room.authoritativeState.rescueAssists,
    state.rescueAssists,
  );
  assert.deepEqual(
    guestPoll.room.authoritativeState.fieldToolCases,
    state.fieldToolCases,
  );

  const closeResponse = await fetch(crewUrl(host), {
    method: "DELETE",
    headers: { "x-crew-token": host.token },
  });
  assert.equal(closeResponse.status, 200);
  const closedGuestResponse = await fetch(crewUrl(guest), {
    headers: { "x-crew-token": guest.token },
  });
  assert.equal(closedGuestResponse.status, 200);
  const closedGuest = await closedGuestResponse.json();
  assert.equal(closedGuest.room.phase, "closed");

  const guestLeaveResponse = await fetch(crewUrl(guest), {
    method: "DELETE",
    headers: { "x-crew-token": guest.token },
  });
  assert.equal(guestLeaveResponse.status, 200);
});
