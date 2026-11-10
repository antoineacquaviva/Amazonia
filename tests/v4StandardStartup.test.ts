import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { DEFAULT_V4_CONFIG } from "../src/v4/types";
import { PROTOCOL } from "../src/v4science/types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function port() {
  const server = net.createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const p = (server.address() as net.AddressInfo).port;
  await new Promise<void>((r) => server.close(() => r()));
  return p;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    wait(10000).then(() => { throw Error("Standard server did not stop"); }),
  ]);
}
async function instance(scientific: boolean, fn: (ctx: {
  base: string; key: string; env: NodeJS.ProcessEnv;
  start: () => ChildProcess; ready: (child: ChildProcess) => Promise<void>;
}) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-standard-recovery-"));
  const campaigns = path.join(root, "campaigns");
  fs.mkdirSync(campaigns, { mode: 0o700 });
  fs.writeFileSync(path.join(campaigns, ".amazonia-storage"), "", { mode: 0o600 });
  const key = "cd".repeat(32), keyFile = path.join(root, "internal-key");
  fs.writeFileSync(keyFile, key, { mode: 0o600 });
  const p = await port(), base = "http://127.0.0.1:" + p;
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME,
    NODE_ENV: "production", PORT: String(p),
    AMAZONIA_CAMPAIGNS_DIR: campaigns,
    ATELIER_INTERNAL_KEY_FILE: keyFile,
    ATELIER_PUBLIC_ORIGINS: "https://atelierconceptionjeu.fr",
    AMAZONIA_WORKERS: "1", AMAZONIA_QUEUE: "2",
    V4_WORKERS: "1", V4_BATCH_SIZE: "2", V4_MAX_ACTIVE: "1",
    ...(scientific ? { V4_STUDIES_DIR: path.join(root, "science") } : {}),
  };
  const children: ChildProcess[] = [];
  const start = () => {
    const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
      cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"],
    });
    // Consume without publishing potential private output.
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});
    children.push(child);
    return child;
  };
  const ready = async (child: ChildProcess) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      assert.equal(child.exitCode, null, "Standard startup exited");
      try {
        if ((await fetch(base + "/api/v4/studies")).status === 403) return;
      } catch {}
      await wait(40);
    }
    throw Error("Standard server readiness timeout");
  };
  try { await fn({ base, key, env, start, ready }); }
  finally {
    for (const child of children) await stop(child);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test("standard portal entry wires durable science with private auth and preserves studies on restart", () =>
  instance(true, async ({ base, key, start, ready }) => {
    let child = start();
    await ready(child);
    const headers = { "X-Atelier-Internal": key };
    for (const prefix of ["/api", "/amazonia/api"]) {
      assert.equal((await fetch(base + prefix + "/v4/studies")).status, 403);
      const response = await fetch(base + prefix + "/v4/studies", { headers });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).studies, []);
    }
    const created = await fetch(base + "/api/v4/studies", {
      method: "POST",
      headers: { ...headers, Origin: "https://atelierconceptionjeu.fr",
        "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol: PROTOCOL, name: "Standard portal recovery fixture",
        configs: [DEFAULT_V4_CONFIG], families: ["COORD_HYBRID"], seeds: [87101],
        experimentSeed: 71, environmentSeed: 73, policySeed: 79, independentGames: true,
      }),
    });
    assert.equal(created.status, 202);
    let study = await created.json();
    const end = Date.now() + 30000;
    while (study.status === "RUNNING") {
      assert(Date.now() < end);
      await wait(40);
      study = await (await fetch(base + "/api/v4/studies/" + study.id, { headers })).json();
    }
    assert.equal(study.status, "COMPLETED");
    assert.equal(study.completed, 1);
    await stop(child);
    child = start();
    await ready(child);
    const restored = await (await fetch(base + "/api/v4/studies/" + study.id, { headers })).json();
    assert.equal(restored.status, "COMPLETED");
    assert.equal(restored.completed, 1);
    const samples = await (await fetch(base + "/api/v4/studies/" + study.id + "/samples", { headers })).json();
    assert.equal(samples.samples.length, 1);
  }));
test("standard startup without scientific directory keeps its explicit unavailable response", () =>
  instance(false, async ({ base, key, start, ready }) => {
    const child = start(); await ready(child);
    const response = await fetch(base + "/api/v4/studies", { headers: { "X-Atelier-Internal": key } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /non configurée/);
  }));
test("standard startup rejects scientific storage inside source before creating it", () =>
  instance(false, async ({ env }) => {
    const forbidden = path.join(process.cwd(), ".forbidden-science-storage");
    assert(!fs.existsSync(forbidden));
    const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
      env: { ...env, V4_STUDIES_DIR: forbidden }, stdio: "ignore",
    });
    const [code] = await once(child, "exit");
    assert.notEqual(code, 0);
    assert(!fs.existsSync(forbidden));
  }));

test("guided launch through the protected prefix freezes coverage and survives restart", () =>
  instance(true, async ({ base, key, start, ready }) => {
    let server = start(); await ready(server);
    const url = base+"/amazonia/api/v4/studies/programs";
    const headers = {"X-Atelier-Internal":key,Origin:"https://atelierconceptionjeu.fr","Content-Type":"application/json"};
    const id = "bd2a2da7-26ec-4fd5-9edf-a49a5d06f419";
    const post = (path:string,body:unknown)=>fetch(url+path,{method:"POST",headers,body:JSON.stringify(body)});
    assert.equal((await fetch(url)).status,403);
    assert.equal((await post("",{id,repeats:2})).status,202);
    assert.equal((await post("",{id,repeats:2})).status,202);
    assert.equal((await (await fetch(url,{headers})).json()).length,1);
    await stop(server);server=start();await ready(server);
    const [p] = await (await fetch(url,{headers})).json();
    assert.equal(p.status,"PAUSED");assert.equal(p.total,896);
    assert.equal((await post("/"+id+"/resume",{})).status,200);
    await wait(500);
    const report=await (await fetch(url+"/"+id+"/export?detail=units",{headers})).json();
    assert.equal(report.cells.length,448);
    assert.equal(report.studies.flatMap((s:any)=>s?.samples ?? []).length,report.program.completed);
    assert.equal(report.cells.reduce((n:number,c:any)=>n+c.observed+c.missing,0),896);
  }));
