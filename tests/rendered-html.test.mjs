import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Moon Goons mission shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Moon Goons — Practice Moon \| Moon Goons<\/title>/i);
  assert.match(html, /SUIT UP/);
  assert.match(html, /TRY NOT TO FLOAT/);
  assert.match(html, /ACCEPT LIABILITY \+ ENTER 3D/);
  assert.match(html, /Playable third-person 3D Practice Moon extraction mission/);
  assert.match(html, /3D AESTHETIC VERTICAL SLICE \/\/ PRACTICE MOON/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
