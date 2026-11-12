// scripts/free-ports.js
// Stops only the processes listening on the dev ports (3001 = API, 5173 = web).
// macOS / Linux use `lsof`; Windows uses `netstat` + `taskkill`.
// Run it when `npm run dev` says "address already in use".

import { execSync } from "node:child_process";

const PORTS = [3001, 5173];
const isWindows = process.platform === "win32";

function run(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // Both lsof and findstr exit with an error when nothing matches.
    return "";
  }
}

function pidsOnPort(port) {
  if (isWindows) {
    return run(`netstat -ano | findstr LISTENING | findstr :${port}`)
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).pop())
      .filter(Boolean);
  }
  return run(`lsof -iTCP:${port} -sTCP:LISTEN -t`).split("\n").filter(Boolean);
}

for (const port of PORTS) {
  const pids = [...new Set(pidsOnPort(port))];
  if (pids.length === 0) {
    console.log(`Port ${port} is free.`);
    continue;
  }
  for (const pid of pids) {
    console.log(`Stopping process ${pid} on port ${port}`);
    run(isWindows ? `taskkill /PID ${pid} /F` : `kill ${pid}`);
  }
}
