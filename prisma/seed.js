// prisma/seed.js — Seed LicensePilot with realistic demo data
// Run: node prisma/seed.js  (or via: npx prisma db seed)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const companyPrefixes = [
  "Meridian",
  "Apex",
  "Vantage",
  "Ironclad",
  "Cascade",
  "Luminary",
  "Cobalt",
  "Bastion",
  "Helix",
  "Prism",
  "Nexus",
  "Alloy",
  "Vertex",
  "Canopy",
  "Stratus",
  "Onyx",
  "Citadel",
  "Forge",
  "Terrain",
  "Summit",
];
const companySuffixes = [
  "Solutions",
  "Systems",
  "Technologies",
  "Corp",
  "Labs",
  "Group",
  "Digital",
  "Works",
];
const regions = ["North America", "Europe", "Asia Pacific", "Latin America"];
const plans = ["Single app", "Multi app", "Deployment"];

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

async function main() {
  console.log("🌱  Seeding LicensePilot…");

  // Clear existing data
  await prisma.agentDecision.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.order.deleteMany();
  await prisma.licence.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();

  // Vendor
  const vendor = await prisma.vendor.create({
    data: { name: "Sample Grid Vendor", slug: "sample-grid-vendor" },
  });

  // Policies
  await prisma.policy.createMany({
    data: [
      {
        key: "auto_invoice_limit",
        label: "Auto-invoice limit ($)",
        value: "12000",
        valueType: "number",
        description:
          "Maximum invoice amount the agent can send without human approval",
      },
      {
        key: "renewal_pct",
        label: "Renewal estimate (%)",
        value: "30",
        valueType: "number",
        description:
          "Estimated renewal as % of licence value. This is an assumption, not an official rate.",
      },
      {
        key: "renewal_window_days",
        label: "Renewal window (days)",
        value: "30",
        valueType: "number",
        description: "Process renewals due within this many days",
      },
      {
        key: "max_devs_online",
        label: "Max devs for online purchase",
        value: "10",
        valueType: "number",
        description: "Teams above this size are routed to sales",
      },
      {
        key: "excluded_regions",
        label: "Excluded regions (JSON array)",
        value: "[]",
        valueType: "json",
        description:
          'Regions excluded from autopilot (e.g. ["Sanctioned Country"])',
      },
    ],
  });

  // Users
  await prisma.user.createMany({
    data: [
      { email: "admin@licensepilot.dev", name: "Alex Admin", role: "admin" },
      { email: "vendor@ag-grid.example", name: "Sam Vendor", role: "vendor" },
    ],
  });

  // Customers (500 for quick seed, deterministic)
  const customerCount = 500;
  const customers = [];
  for (let i = 0; i < customerCount; i++) {
    const r = rng(i * 31337);
    const prefix = companyPrefixes[i % companyPrefixes.length];
    const suffix = companySuffixes[Math.floor(r() * companySuffixes.length)];
    const num = i + 1;
    const plan = plans[i % 3];
    const seats = 2 + ((i * 7) % 40);
    const devsDetected = seats + (i % 13 === 0 ? 1 + (i % 3) : 0);
    const renewalInDays = ((i * 13) % 400) - 40;
    const paid = i % 12 !== 0;
    const value = Math.round((8000 + r() * 52000) / 100) * 100;
    const balanceDue = paid ? 0 : Math.round((500 + r() * 4500) / 100) * 100;
    const regionIdx = i % 4;
    const company = `${prefix} ${suffix} ${num}`;
    customers.push({
      vendorId: vendor.id,
      company,
      region: regions[regionIdx],
      plan,
      seats,
      devsDetected,
      renewalInDays,
      paid,
      autoRenewRequested: false,
      value,
      balanceDue,
      billingEmail: `billing@${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.example`,
    });
  }

  // Batch insert
  for (let i = 0; i < customers.length; i += 50) {
    await prisma.customer.createMany({ data: customers.slice(i, i + 50) });
  }

  console.log(`  ✓ ${customerCount} customers`);

  // Seed a few licence records for the demo customer
  const demoCust =
    (await prisma.customer.findFirst({
      where: { paid: true, devsDetected: { lte: 10 } },
    })) || (await prisma.customer.findFirst({ where: { paid: true } }));

  if (demoCust) {
    const validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + 1);
    await prisma.licence.create({
      data: {
        vendorId: vendor.id,
        customerId: demoCust.id,
        key: "LP-DEMO-SEED-0001",
        product: "Sample Grid Enterprise",
        seats: demoCust.seats,
        validUntil,
      },
    });
    console.log(`  ✓ Licence created for ${demoCust.company}`);
  }

  console.log("✅  Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
