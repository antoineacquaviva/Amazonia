import { execFileSync } from "node:child_process";
import path from "node:path";
const out = process.argv[2];
if (!out || !path.isAbsolute(out)) throw new Error("Destination absolue requise");
execFileSync("python3", ["-B", "scripts/v4-kit-build.py", out], { stdio: "inherit" });
