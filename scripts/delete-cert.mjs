import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
await prisma.certificate.deleteMany({ where: { eventId: "cmstykvjk0001kz04txzr5zgu" } });
console.log("deleted");
await prisma.$disconnect();
