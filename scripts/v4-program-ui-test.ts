import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import express from "express";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
import { StudyManager } from "../src/v4science/manager";
import { privateAccess } from "../src/v4science/privateAccess";

const { chromium } = createRequire(
  process.env.V4_PLAYWRIGHT_PACKAGE ??
    new URL("../package.json", import.meta.url),
)("playwright");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-guided-ui-"));
const outer = express(),
  server = outer.listen(0, "127.0.0.1");
await once(server, "listening");
const port = (server.address() as import("node:net").AddressInfo).port;
const password = randomBytes(32).toString("hex"),
  key = path.join(root, "key");
fs.writeFileSync(key, password, { mode: 0o600 });
const access = privateAccess(key, port);
const studies = new StudyManager({
  root: path.join(root, "studies"),
  batchSize: 8,
});
const manager = new CampaignManager({
  campaignsDir: path.join(root, "legacy"),
  createReference: false,
  pool: { workers: 1 },
});
let browser: any;
try {
  const { app } = await createApp({
    manager,
    studies,
    authorize: access.authorized,
    web: false,
  });
  outer.use(access.guard, app);
  outer.use("/amazonia", express.static("dist"));
  const base = `http://127.0.0.1:${port}/amazonia/`;
  assert.equal((await fetch(base + "api/v4/studies/programs")).status, 401);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.V4_CHROMIUM ?? "/usr/bin/chromium",
  });
  async function open() {
    const context = await browser.newContext({
      httpCredentials: { username: "amazonia", password },
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(base);
    return { context, page };
  }
  let { context, page } = await open();
  await page
    .getByLabel("Parties par variante, table et famille")
    .selectOption("2");
  await page
    .getByRole("button", { name: "Lancer la campagne comparative" })
    .click();
  await page
    .getByRole("heading", { name: /En cours · .*896 parties/ })
    .waitFor();
  await context.close();
  ({ context, page } = await open());
  await page.getByRole("button", { name: "Suspendre le programme" }).click();
  await page.getByRole("heading", { name: /En pause/ }).waitFor();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Télécharger le bilan IA/ }).click();
  const report = JSON.parse(
    fs.readFileSync(await (await download).path(), "utf8"),
  );
  assert.equal(report.cells.length, 448);
  assert.equal(report.program.total, 896);
  assert.equal(
    report.cells.reduce((n: number, c: any) => n + c.observed, 0),
    report.program.completed,
  );
  assert.equal(
    report.cells.reduce((n: number, c: any) => n + c.missing, 0),
    896 - report.program.completed,
  );
  assert.equal(studies.programs().length, 1);
  console.log(
    "Authenticated guided campaign: mobile launch, reconnection, pause and AI export passed",
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await studies.close();
  await manager.close();
  fs.rmSync(root, { recursive: true, force: true });
}
