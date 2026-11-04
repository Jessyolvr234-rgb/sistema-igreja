import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import UsersManagement from "@/components/dashboard/users-management";
import {
  getDashboardAccess,
  hasAdministrativeAccess,
} from "@/lib/supabase/dashboard-access";
import { createClient } from "@/lib/supabase/server";

export default async function UsuariosPage() {
  const access = await getDashboardAccess();
  if (!access.ok || !hasAdministrativeAccess(access.access)) {
    redirect("/dashboard");
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
      <UsersManagement />
    </DashboardShell>
  );
}
