"use server";
export async function checkSavePasswordAction(password: string): Promise<boolean> {
  const { checkSavePasswordAction: check } = await import("@/lib/auth-actions");
  return check(password);
}
