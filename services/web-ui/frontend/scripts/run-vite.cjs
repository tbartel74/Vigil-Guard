#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node ./scripts/run-vite.cjs <command> [args...]");
  process.exit(1);
}

process.env.ROLLUP_SKIP_NODEJS_NATIVE_BUILD = "1";
const binDir = path.resolve(process.cwd(), "node_modules", ".bin");
const isWindows = process.platform === "win32";
const viteBin = path.join(binDir, isWindows ? "vite.cmd" : "vite");

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
