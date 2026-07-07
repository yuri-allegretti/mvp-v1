export const demoCompanyId = "demo-company";
export const demoBankAccountId = "demo-itau-account";
export const demoAdminUserId = "demo-admin";
export const demoAccountantUserId = "demo-accountant";
export const demoViewerUserId = "demo-viewer";
export const recommendedDemoUserId = demoAccountantUserId;

export const demoUserIds = [
  demoAdminUserId,
  demoAccountantUserId,
  demoViewerUserId,
] as const;

export function withUserId(path: string, userId: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}userId=${encodeURIComponent(userId)}`;
}
