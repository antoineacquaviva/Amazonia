import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { provenance } from "../src/v4science/protocol";
const out = process.argv[2];
if (!out || !path.isAbsolute(out))
  throw new Error("Destination absolue .tar.gz requise");
const p = provenance();
if (p.dirty || p.commit === "UNAVAILABLE")
  throw new Error("Commit de sources propre requis avant release");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-v4-release-"));
try {
  const tar = path.join(tmp, "release.tar");
  execFileSync("git", ["archive", "--format=tar", "-o", tar, p.commit]);
  fs.writeFileSync(
    path.join(tmp, ".release.json"),
    JSON.stringify({ commit: p.commit, sourceHash: p.sourceHash }, null, 2),
  );
  execFileSync("tar", ["-rf", tar, "-C", tmp, ".release.json"]);
  const bytes = gzipSync(fs.readFileSync(tar));
  fs.writeFileSync(out, bytes, { flag: "wx", mode: 0o600 });
  console.log(
    JSON.stringify({
      file: out,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      commit: p.commit,
      sourceHash: p.sourceHash,
    }),
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
