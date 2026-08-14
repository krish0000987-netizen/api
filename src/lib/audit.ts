import { prisma } from "@/lib/prisma";

export async function logAudit(input: {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        details: input.details,
      },
    });
  } catch (error) {
    // Audit logging must never break the operation it records.
    console.error("Failed to write audit log:", error);
  }
}
