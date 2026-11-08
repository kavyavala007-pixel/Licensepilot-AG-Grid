import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const isPostgres = /^(postgres|postgresql):\/\//i.test(
  process.env.DATABASE_URL || "",
);
const schema = isPostgres
  ? "prisma/postgres/schema.prisma"
  : "prisma/schema.prisma";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args) {
  const result = spawnSync(npx, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Database setup failed: npx ${args.join(" ")}`);
}

run(["prisma", "generate", "--schema", schema]);
if (isPostgres) {
  run(["prisma", "migrate", "deploy", "--schema", schema]);
} else {
  run(["prisma", "db", "push", "--schema", schema, "--skip-generate"]);
}

const seed = spawnSync(process.execPath, ["scripts/seed-if-empty.js"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (seed.error) throw seed.error;
if (seed.status !== 0) throw new Error("Initial demo database seed failed");
