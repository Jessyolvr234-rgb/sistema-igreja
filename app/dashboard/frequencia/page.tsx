import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import AttendanceManagement from "@/components/dashboard/attendance-management";
import { getDashboardAccess } from "@/lib/supabase/dashboard-access";
import { createClient } from "@/lib/supabase/server";

export default async function FrequenciaPage() {
  const access = await getDashboardAccess();
  if (!access.ok) {
    redirect("/");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";

  return (
    <DashboardShell email={email}>
      <AttendanceManagement role={access.access.role} />
    </DashboardShell>
  );
}
