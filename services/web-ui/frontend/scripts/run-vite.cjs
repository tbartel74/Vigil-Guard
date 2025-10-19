#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node ./scripts/run-vite.cjs <command> [args...]");
  process.exit(1);
}

process.env.ROLLUP_SKIP_NODEJS_NATIVE_BUILD = "1";
process.env.NAPI_RS_FORCE_WASI = "1";

// In npm workspaces monorepo, binaries are installed in root node_modules/.bin
// Try workspace node_modules/.bin first, then fallback to root
const fs = require("node:fs");
const workspaceBinDir = path.resolve(process.cwd(), "node_modules", ".bin");
const rootBinDir = path.resolve(process.cwd(), "../../../node_modules", ".bin");
const isWindows = process.platform === "win32";
const viteName = isWindows ? "vite.cmd" : "vite";

let viteBin;
if (fs.existsSync(path.join(workspaceBinDir, viteName))) {
  viteBin = path.join(workspaceBinDir, viteName);
} else if (fs.existsSync(path.join(rootBinDir, viteName))) {
  viteBin = path.join(rootBinDir, viteName);
} else {
  console.error("Error: vite binary not found in workspace or root node_modules/.bin");
  console.error("Tried:", workspaceBinDir, "and", rootBinDir);
  process.exit(1);
}

const child = spawn(viteBin, args, {
  stdio: "inherit",
  env: process.env,
  shell: isWindows,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
