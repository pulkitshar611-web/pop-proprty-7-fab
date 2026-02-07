const prisma = require("../src/config/prisma");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

async function main() {
  console.log("🌱 Starting seed...");

  const hashedPassword = await bcrypt.hash("123456", 10);

  // 1. Admin
  await prisma.user.upsert({
    where: { email: "admin@property.com" },
    update: {},
    create: {
      email: "admin@property.com",
      name: "Super Admin",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  // 2. Owner
  const owner = await prisma.user.upsert({
    where: { email: "owner@property.com" },
    update: {},
    create: {
      email: "owner@property.com",
      name: "Grand Holdings Ltd",
      password: hashedPassword,
      role: "OWNER",
      phone: "+1 (555) 111-2222",
    },
  });

  // 3. Properties
  const sunset = await prisma.property.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Sunrise Apartments",
      address: "123 Sunset Blvd, CA",
      status: "Active",
      ownerId: owner.id,
      units: {
        create: [
          { name: "A-101", status: "Occupied", rentAmount: 12000, bedrooms: 2 },
          { name: "A-102", status: "Occupied", rentAmount: 12000, bedrooms: 2 },
          { name: "A-103", status: "Vacant", rentAmount: 12000, bedrooms: 2 },
        ],
      },
    },
  });

  const greenView = await prisma.property.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: "Green View Residency",
      address: "456 Park Avenue, NY",
      status: "Active",
      ownerId: owner.id,
      units: {
        create: [
          { name: "B-201", status: "Occupied", rentAmount: 5000, bedrooms: 1 },
          { name: "B-202", status: "Occupied", rentAmount: 5000, bedrooms: 1 },
        ],
      },
    },
  });

  // 4. Tenants
  const tenant1 = await prisma.user.upsert({
    where: { email: "tenant@property.com" },
    update: {},
    create: {
      email: "tenant@property.com",
      password: hashedPassword,
      name: "John Doe",
      role: "TENANT",
      type: "Individual",
      phone: "+1 (555) 777-8888",
    },
  });

  const tenant2 = await prisma.user.upsert({
    where: { email: "sarah@example.com" },
    update: {},
    create: {
      email: "sarah@example.com",
      password: hashedPassword,
      name: "Sarah Smith",
      role: "TENANT",
      type: "Individual",
    },
  });

  // Cleanup relations for re-run safety
  await prisma.insurance.deleteMany({ where: { userId: tenant1.id } });
  await prisma.document.deleteMany({ where: { userId: tenant1.id } });
  await prisma.ticket.deleteMany({ where: { userId: tenant1.id } });

  // 4a. Tenant Insurance
  await prisma.insurance.create({
    data: {
      userId: tenant1.id,
      provider: "State Farm",
      policyNumber: "SF-12345",
      startDate: new Date("2025-01-01"),
      endDate: new Date("2026-01-05"), // Expired a few days ago for demo
    }
  });

  // 4b. Tenant Documents
  await prisma.document.create({
    data: {
      userId: tenant1.id,
      name: "Lease_Agreement.pdf",
      type: "Lease",
      fileUrl: "https://example.com/lease.pdf"
    }
  });

  // 4c. Tenant Tickets
  await prisma.ticket.create({
    data: {
      userId: tenant1.id,
      subject: "Leaking Kitchen Sink",
      description: "Water is dripping from the main pipe under the sink.",
      priority: "High",
      status: "In Progress",
    }
  });

  await prisma.ticket.create({
    data: {
      userId: tenant1.id,
      subject: "AC Filter Replacement",
      description: "Regular maintenance request for AC filter.",
      priority: "Low",
      status: "Resolved",
    }
  });

  // 5. Leases
  const unitA101 = await prisma.unit.findFirst({ where: { name: "A-101" } });
  const unitB202 = await prisma.unit.findFirst({ where: { name: "B-202" } });

  await prisma.lease.create({
    data: {
      unitId: unitA101.id,
      tenantId: tenant1.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
      status: "Active",
      monthlyRent: 12000,
    },
  });

  await prisma.lease.create({
    data: {
      unitId: unitB202.id,
      tenantId: tenant2.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
      status: "Active",
      monthlyRent: 5000,
    },
  });

  // 6. Invoices & Ledger
  await prisma.invoice.create({
    data: {
      invoiceNo: "INV-001",
      tenantId: tenant1.id,
      unitId: unitA101.id,
      month: "Jan 2026",
      rent: 12000,
      amount: 12000,
      status: "paid",
      paidAt: new Date("2026-01-05"),
    },
  });

  await prisma.transaction.create({
    data: {
      date: new Date("2026-01-05"),
      description: "Rent Payment - INV-001",
      type: "Income",
      amount: 12000,
      balance: 12000,
      status: "Completed",
      ownerId: owner.id,
      propertyId: sunset.id
    }
  });

  await prisma.invoice.create({
    data: {
      invoiceNo: "INV-002",
      tenantId: tenant2.id,
      unitId: unitB202.id,
      month: "Jan 2026",
      rent: 5000,
      serviceFees: 1500,
      amount: 6500,
      status: "paid",
      paidAt: new Date("2026-01-07"),
    },
  });

  await prisma.transaction.create({
    data: {
      date: new Date("2026-01-07"),
      description: "Rent Payment - INV-002",
      type: "Income",
      amount: 6500,
      balance: 18500,
      status: "Completed",
      ownerId: owner.id,
      propertyId: greenView.id
    }
  });

  await prisma.transaction.create({
    data: {
      date: new Date("2026-01-10"),
      description: "Maintenance Material - Plumbing",
      type: "Expense",
      amount: -2500,
      balance: 16000,
      status: "Completed",
      ownerId: owner.id,
      propertyId: sunset.id
    }
  });


  console.log("🌱 Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
