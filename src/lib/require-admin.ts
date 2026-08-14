import { auth } from "@/auth";

export async function getAdminSession() {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "admin") return null;
  return session;
}
