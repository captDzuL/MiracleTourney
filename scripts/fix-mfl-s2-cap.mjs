import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SLUG = "mfl-blitz-s2";
const NEW_CAP = 32;

const event = await prisma.event.findFirst({ where: { slug: SLUG } });
if (!event) throw new Error(`Event ${SLUG} tidak ditemukan`);

console.log(`Sebelum: ${event.name} (${event.slug}) cap=${event.participantCap}`);

const updated = await prisma.event.update({
  where: { slug: SLUG },
  data: { participantCap: NEW_CAP },
});

console.log(`Sesudah: ${updated.name} (${updated.slug}) cap=${updated.participantCap}`);

await prisma.$disconnect();
