import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { privateAccess } from "../src/v4science/privateAccess";
test("private instance requires its own file credential, exact origin for writes, and never accepts unsigned identity headers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-v4-private-")),
    key = path.join(dir, "key"),
    token = "ab".repeat(32);
  fs.writeFileSync(key, token, { mode: 0o600 });
  const app = express(),
    server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port,
    base = `http://127.0.0.1:${port}`,
    access = privateAccess(key, port);
  app.use(access.guard);
  app.get("/", (_req, res) => res.send("private"));
  app.post("/", (_req, res) => res.json({ ok: true }));
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal(
      (await fetch(base, { headers: { "X-Atelier-Internal": "fake" } })).status,
      401,
    );
    const Authorization =
      "Basic " + Buffer.from("amazonia:" + token).toString("base64");
    assert.equal(
      (await fetch(base, { headers: { Authorization } })).status,
      200,
    );
    assert.equal(
      (
        await fetch(base, {
          method: "POST",
          headers: { Authorization, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(base, {
          method: "POST",
          headers: {
            Authorization,
            Origin: base,
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base, {
          method: "POST",
          headers: {
            Authorization,
            Origin: "https://other.invalid",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      401,
    );
    fs.chmodSync(key, 0o644);
    assert.throws(() => privateAccess(key, port), /0600/);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
