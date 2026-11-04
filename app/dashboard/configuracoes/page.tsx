import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import SettingsManagement from "@/components/dashboard/settings-management";
import { getDashboardAccess } from "@/lib/supabase/dashboard-access";
import { createClient } from "@/lib/supabase/server";

export default async function ConfiguracoesPage() {
  const access = await getDashboardAccess();
  if (!access.ok || access.access.role !== "admin") {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";

  return (
    <DashboardShell email={email}>
      <SettingsManagement />
    </DashboardShell>
  );
}
