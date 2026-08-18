import { redirect } from "next/navigation";

// Backward-compatible redirect: Providers now live at /admin/providers.
export default function AdminVendorsRedirect() {
  redirect("/admin/providers");
}