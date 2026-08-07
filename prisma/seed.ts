import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD ?? "Miracle2026!",
    12,
  );
  const captainPasswordHash = await bcrypt.hash(
    process.env.SEED_CAPTAIN_PASSWORD ?? "Miracle2026!",
    12,
  );

  await prisma.user.upsert({
    where: { email: "admin@miraclefc.gg" },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: "admin@miraclefc.gg",
      name: "League Commissioner",
      role: "admin",
      passwordHash: adminPasswordHash,
    },
  });

  await prisma.user.upsert({
    where: { email: "captain@miraclefc.gg" },
    update: { passwordHash: captainPasswordHash },
    create: {
      email: "captain@miraclefc.gg",
      name: "Riko Aida",
      role: "captain",
      passwordHash: captainPasswordHash,
    },
  });

  console.log("Seeded admin and captain users.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());