import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import express from "express";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
const require = createRequire(
  process.env.V4_PLAYWRIGHT_PACKAGE ??
    new URL("../package.json", import.meta.url),
);
const { chromium } = require("playwright");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-v4-ui-"));
const manager = new CampaignManager({
  campaignsDir: dir,
  createReference: false,
  pool: { workers: 1, queue: 2 },
});
const { app } = await createApp({ manager, web: false, authorize: () => true });
app.use(express.static("dist"));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
let browser: any;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.V4_CHROMIUM ?? "/usr/bin/chromium",
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("link", { name: "V4 expérimentale", exact: true })
    .click();
  await page.getByLabel("Positions par piste").fill("8");
  await page.getByRole("alert").filter({ hasText: "Fin de piste" }).waitFor();
  assert(
    await page
      .getByRole("button", { name: "Lancer la simulation V4" })
      .isDisabled(),
  );
  await page.getByLabel("Positions par piste").fill("16");
  await page.getByLabel("Ordre initial de l’Œil").fill("1,1,3");
  await page.getByRole("alert").filter({ hasText: "Ordre initial" }).waitFor();
  await page.getByLabel("Ordre initial de l’Œil").fill("1,2,3");
  await page.getByLabel("Graines distinctes").fill("42001");
  await page.getByLabel("Prise de l’Œil").selectOption("FULL_CAPTURE");
  await page.getByLabel("Défenseurs par case furtive").selectOption("MULTIPLE");
  await page.getByLabel("Sabotage par défenseur").selectOption("BOTH_MACHINES");
  await page.getByRole("button", { name: "Lancer la simulation V4" }).click();
  await page
    .getByRole("heading", { name: "COMPLETED · 1/1 parties" })
    .waitFor({ timeout: 30000 });
  const results = page.getByRole("article", { name: "Résultats V4" });
  assert((await results.innerText()).includes("FULL_CAPTURE"));
  assert((await results.innerText()).includes("MULTIPLE"));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exporter JSON et traces" }).click(),
  ]);
  const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  assert.equal(exported.results.length, 1);
  assert.equal(exported.results[0].privileged, false);
  assert.equal(exported.results[0].config.eyeMode, "FULL_CAPTURE");
  assert.equal(exported.results[0].traces.length, 8);
  await page.getByLabel("Comparer les huit combinaisons").check();
  await page.getByRole("button", { name: "Lancer la simulation V4" }).click();
  await page
    .getByRole("heading", { name: "COMPLETED · 8/8 parties" })
    .waitFor({ timeout: 30000 });
  assert.equal(await results.locator("tbody tr").count(), 8);
  const [markdown] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exporter le bilan Markdown" }).click(),
  ]);
  assert(
    fs.readFileSync(await markdown.path(), "utf8").includes("sans conclusion"),
  );
  await page.screenshot({ path: "/tmp/amazonia-v4-ui.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("select").first().selectOption("dashboard");
  await page.locator("select").first().selectOption("v4");
  await page
    .getByRole("heading", { name: "Amazonia V4 — essai expérimental" })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.equal(manager.listCampaigns().length, 0);
  console.log(
    "V4_UI_OK: configuration refusée, trois variantes, partie, campagne de huit variantes, progression, résultats, téléchargements JSON/Markdown, navigation mobile, aucune erreur JS",
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await manager.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
