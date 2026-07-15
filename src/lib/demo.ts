export {
  demoAdminUserId,
  demoAccountantUserId,
  demoBankAccountId,
  demoCompanies,
  demoCompanyId,
  demoIsolationBankAccountId,
  demoIsolationCompanyId,
  demoSecondaryBankAccountId,
  demoUserIds,
  recommendedDemoUserId,
} from "../modules/demo/demoSetup";

export function withUserId(path: string, userId: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}userId=${encodeURIComponent(userId)}`;
}

export function withDemoContext(
  path: string,
  context: {
    userId: string;
    companyId?: string | null;
    bankAccountId?: string | null;
  },
): string {
  const params = new URLSearchParams();
  params.set("userId", context.userId);
  if (context.companyId) params.set("companyId", context.companyId);
  if (context.bankAccountId) params.set("bankAccountId", context.bankAccountId);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${params.toString()}`;
}
