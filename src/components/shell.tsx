import { requireSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ShellLayout } from "./shell-layout";
import { SECTIONS } from "@/lib/nav";


function filterSections(sections: any[], allowed: string[] | null, role: string) {
  if (role === "ADMIN" || role === "superadmin") return sections;
  // If allowedModules is null or empty, assume no restrictions (backward compatibility)
  if (!allowed || allowed.length === 0) return sections;

  return sections.map(section => {
    const filteredSub = section.subsections?.map((sub: any) => ({
      ...sub,
      items: sub.items.filter((item: any) => allowed.includes(item.key))
    })).filter((sub: any) => sub.items.length > 0);

    const filteredItems = section.items?.filter((item: any) => allowed.includes(item.key));

    return {
      ...section,
      subsections: filteredSub?.length ? filteredSub : undefined,
      items: filteredItems?.length ? filteredItems : undefined
    };
  }).filter(section => section.subsections || section.items);
}

export async function Shell({ children, active }: { children: React.ReactNode; active?: string }) {
  const session = await requireSession();

  async function handleLogout() {
    "use server";
    await logout();
    redirect("/login");
  }

  return (
    <ShellLayout
      sections={filterSections(SECTIONS, session.allowedModules || null, session.roleName)}
      active={active}
      sessionName={session.fullName}
      sessionRole={session.roleName}
      logoutAction={handleLogout}
    >
      {children}
    </ShellLayout>
  );
}
