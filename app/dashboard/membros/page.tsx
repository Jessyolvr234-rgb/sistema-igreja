import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import MembersManagement from "@/components/dashboard/members-management";
import { createClient } from "@/lib/supabase/server";

export default async function MembrosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/");
  }

  const email =
    typeof data.claims.email === "string" ? data.claims.email : "";

  return (
    <DashboardShell email={email}>
      <MembersManagement />
    </DashboardShell>
  );
}
