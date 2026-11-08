import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
import { internalAuthorization } from "../src/server/internalAuthorization";
test("internal key adapter: absent, wrong, forged identity, CSRF, correct proof and all API aliases", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-entry-")),
    old = { ...process.env };
  const m = new CampaignManager({ campaignsDir: path.join(dir, "data") });
  const key = randomBytes(32).toString("hex"),
    file = path.join(dir, "key");
  fs.writeFileSync(file, key, { mode: 0o600 });
  process.env.ATELIER_INTERNAL_KEY_FILE = file;
  process.env.ATELIER_PUBLIC_ORIGINS = "https://atelier.example";
  const { app } = await createApp({
    manager: m,
    web: false,
    authorize: internalAuthorization(),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const prefix of ["/api", "/amazonia/api", "/other/api"]) {
      assert.equal(
        (
          await fetch(base + prefix + "/health", {
            headers: {
              "x-user": "admin",
              Authorization: "Basic test",
              "x-atelier-internal": "f".repeat(64),
            },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(base + prefix + "/health", {
            headers: { "x-atelier-internal": key },
          })
        ).status,
        200,
      );
      for (const origin of ["", "https://evil.example"])
        assert.equal(
          (
            await fetch(base + prefix + "/simulate-single", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-atelier-internal": key,
                Origin: origin,
              },
              body: "{}",
            })
          ).status,
          403,
        );
    }
    const response = await fetch(base + "/amazonia/api/simulate-single", {
      method: "POST",
      headers: {
        "x-atelier-internal": key,
        Origin: "https://atelier.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(response.status, 200);
    fs.chmodSync(file, 0o644);
    assert.throws(internalAuthorization, /Permissions/);
    fs.chmodSync(file, 0o600);
    delete process.env.ATELIER_INTERNAL_KEY_FILE;
    assert.equal(internalAuthorization(), undefined);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await m.close();
    process.env = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('client controls and deletion send JSON required by entry CSRF contract',async()=>{
 const original=globalThis.fetch;const calls:RequestInit[]=[];
 globalThis.fetch=async(_url,options)=>{calls.push(options!);return new Response('{}',{headers:{'content-type':'application/json'}});};
 try {const api=await import('../src/api');await api.controlCampaign('test','pause');await api.removeCampaign('test');for(const c of calls){assert.equal((c.headers as any)['Content-Type'],'application/json');assert.equal(c.body,'{}');}}
 finally {globalThis.fetch=original;}
});
