import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import express from "express";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
import { StudyManager } from "../src/v4science/manager";
const require = createRequire(
    process.env.V4_PLAYWRIGHT_PACKAGE ??
      new URL("../package.json", import.meta.url),
  ),
  { chromium } = require("playwright");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-v4-study-ui-")),
  studies = new StudyManager({ root: path.join(root, "studies") }),
  manager = new CampaignManager({
    campaignsDir: path.join(root, "legacy"),
    createReference: false,
    pool: { workers: 1, queue: 2 },
  });
const { app } = await createApp({
  manager,
  studies,
  web: false,
  authorize: () => true,
});
app.use(express.static("dist"));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
let browser: any;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean) {
  const end = Date.now() + 60000;
  while (!fn()) {
    assert(Date.now() < end, "browser/server timeout");
    await wait(20);
  }
}
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.V4_CHROMIUM ?? "/usr/bin/chromium",
  });
  let context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  let page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  await page.goto(base);
  await page
    .getByRole("link", { name: "V4 expérimentale", exact: true })
    .click();
  await page.getByLabel("Version d’utilisation V4").selectOption("science");
  await page
    .getByRole("heading", { name: "Campagne V4 durable — sept familles" })
    .waitFor();
  await page.getByLabel("Positions par piste").fill("8");
  await page
    .getByRole("button", { name: "Utiliser cette configuration seule" })
    .click();
  await page
    .getByRole("button", { name: "Estimer et vérifier le plan" })
    .click();
  await page.getByRole("alert").filter({ hasText: "Fin de piste" }).waitFor();
  assert(
    await page
      .getByRole("button", { name: "Lancer le plan fixe" })
      .isDisabled(),
  );
  await page.getByLabel("Positions par piste").fill("16");
  await page
    .getByRole("button", { name: "Utiliser cette configuration seule" })
    .click();
  await page.getByLabel("Parties par configuration et famille").fill("2");
  await page.getByLabel("Déclarer les parties indépendantes").check();
  await page
    .getByRole("button", { name: "Estimer et vérifier le plan" })
    .click();
  await page.getByRole("status").filter({ hasText: "14 parties" }).waitFor();
  await page.getByRole("button", { name: "Lancer le plan fixe" }).click();
  await page.getByRole("button", { name: "Suspendre", exact: true }).click();
  await page.getByRole("heading", { name: /PAUSED ·/ }).waitFor();
  await until(() => !studies.busy);
  const id = studies.list()[0].id;
  assert.equal(studies.get(id).status, "PAUSED");
  await page.getByRole("button", { name: "Reprendre explicitement" }).click();
  // Client disconnects completely; the server continues and checkpoints without polling.
  await context.close();
  await until(() => studies.get(id).status === "COMPLETED");
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  page = await context.newPage();
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("link", { name: "V4 expérimentale", exact: true })
    .click();
  await page.getByLabel("Version d’utilisation V4").selectOption("science");
  await page
    .getByRole("button", { name: /Étude V4 ciblée · COMPLETED · 14\/14/ })
    .click();
  await page
    .getByRole("heading", { name: "COMPLETED · 14/14 parties" })
    .waitFor();
  const article = page.getByRole("article", { name: "Bilan scientifique V4" });
  assert((await article.innerText()).includes("Arbres hors d’atteinte"));
  assert((await article.innerText()).includes("appariement vérifié"));
  assert(
    (await article.innerText()).includes("Agrégation /100 : indisponible"),
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: "Exporter l’archive JSON autonome" })
      .click(),
  ]);
  const data = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  assert.equal(data.samples.length, 14);
  assert.equal(data.report.policyContrasts.length, 6);
  assert(data.report.policyContrasts.every((c: any) => c.estimate.paired));
  assert(data.study.documentSnapshots["docs/V4_SCIENTIFIC.md"]);
  assert(data.samples.some((s: any) => s.privileged));
  const [md] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exporter le bilan Markdown" }).click(),
  ]);
  assert(fs.readFileSync(await md.path(), "utf8").includes("Contrastes"));
  // Stop is explicit and preserves any committed progress; resumption is explicit too.
  await page.getByLabel("Nom de l’étude").fill("Arrêt UI");
  await page
    .getByRole("button", { name: "Estimer et vérifier le plan" })
    .click();
  await page.getByRole("button", { name: "Lancer le plan fixe" }).click();
  await page.getByRole("button", { name: "Arrêter", exact: true }).click();
  await page.getByRole("heading", { name: /STOPPED ·/ }).waitFor();
  await until(() => !studies.busy);
  assert.equal(studies.list()[0].status, "STOPPED");
  await page.screenshot({
    path: "/tmp/amazonia-v4-scientific-ui.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("select").first().selectOption("dashboard");
  await page.locator("select").first().selectOption("v4");
  await page.getByLabel("Version d’utilisation V4").selectOption("science");
  await page
    .getByRole("heading", { name: "Campagne V4 durable — sept familles" })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.equal(manager.listCampaigns().length, 0);
  console.log(
    "V4_SCIENTIFIC_UI_OK: plan refusé/estimé, sept profils, pause/reprise/arrêt, reconnexion navigateur, 14 parties durables, six contrastes, axes et dilution, archives JSON/Markdown, navigation mobile, aucune erreur JS",
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await studies.close();
  await manager.close();
  fs.rmSync(root, { recursive: true, force: true });
}
