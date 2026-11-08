import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const vendors = await prisma.vendor.count();
  if (vendors === 0) {
    const seed = spawnSync(process.execPath, ["prisma/seed.js"], {
      stdio: "inherit",
      env: process.env,
    });
    if (seed.error) throw seed.error;
    if (seed.status !== 0) throw new Error("Initial demo database seed failed");
  }
} finally {
  await prisma.$disconnect();
}
