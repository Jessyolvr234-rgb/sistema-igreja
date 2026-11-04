import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import NetworksManagement from "@/components/dashboard/networks-management";
import { getDashboardAccess } from "@/lib/supabase/dashboard-access";
import { createClient } from "@/lib/supabase/server";

export default async function RedesPage() {
  const access = await getDashboardAccess();
  if (!access.ok) {
    redirect("/entrar");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/");
  }

  const email =
    typeof data.claims.email === "string" ? data.claims.email : "";

  return (
    <DashboardShell email={email}>
      <NetworksManagement />
    </DashboardShell>
  );
}
