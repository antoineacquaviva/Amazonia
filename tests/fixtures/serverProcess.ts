import express from "express";
import { CampaignManager } from "../../src/server/campaignManager";
import { createApp } from "../../server";
if (!process.argv[2])
  throw new Error("Explicit isolated test directory required");
const manager = new CampaignManager({
  campaignsDir: process.argv[2],
  batchSize: 2,
  pool: { workers: 1, queue: 2 },
});
const { app } = await createApp({ manager, web: false });
if (process.argv[3] === "web") app.use(express.static("dist"));
const server = app.listen(0, "127.0.0.1", () =>
  console.log(
    JSON.stringify({ port: (server.address() as { port: number }).port }),
  ),
);
