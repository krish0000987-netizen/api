// Provider health tracking (section 25). One row per vendor is upserted with
// a rolling success-rate and average latency. The admin dashboard reads this
// to show Healthy / Degraded / Down per provider.

import { prisma } from "@/lib/prisma";

export async function updateHealthAfterCall(
  vendorId: string,
  success: boolean,
  responseTimeMs: number,
  httpStatus: number,
  errorCode?: string,
): Promise<void> {
  try {
    const existing = await prisma.providerHealth.findUnique({ where: { vendorId } });
    const totalRequests = (existing?.totalRequests ?? 0) + 1;
    const failedRequests = (existing?.failedRequests ?? 0) + (success ? 0 : 1);
    const successRate = totalRequests === 0 ? 100 : Math.round(((totalRequests - failedRequests) / totalRequests) * 1000) / 10;
    const prevAvg = existing?.avgResponseMs ?? 0;
    const prevTotal = existing?.totalRequests ?? 0;
    const avgResponseMs = Math.round((prevAvg * prevTotal + responseTimeMs) / totalRequests);

    const status =
      !success || httpStatus === 0
        ? "down"
        : successRate >= 90
          ? "healthy"
          : successRate >= 70
            ? "degraded"
            : "down";

    await prisma.providerHealth.upsert({
      where: { vendorId },
      create: {
        vendorId,
        status,
        successRate,
        avgResponseMs,
        totalRequests,
        failedRequests,
        lastSuccessAt: success ? new Date() : undefined,
        lastFailureAt: success ? undefined : new Date(),
        lastError: success ? undefined : errorCode ?? (httpStatus ? `http_${httpStatus}` : "unknown"),
      },
      update: {
        status,
        successRate,
        avgResponseMs,
        totalRequests,
        failedRequests,
        lastSuccessAt: success ? new Date() : undefined,
        lastFailureAt: success ? undefined : new Date(),
        lastError: success ? undefined : errorCode ?? (httpStatus ? `http_${httpStatus}` : "unknown"),
      },
    });
  } catch (error) {
    console.error("Health update failed:", error);
  }
}