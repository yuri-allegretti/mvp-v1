import { actorUserIdFromSearchParam } from "@/lib/companyAccess";
import { getDemoContext } from "@/modules/demo/demoContextService";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry.trim());
    return first ?? null;
  }
  return null;
}

export async function getDemoPageData(searchParams?: Promise<SearchParamsRecord> | SearchParamsRecord) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedCompanyId = firstString(resolvedSearchParams.companyId);
  const requestedBankAccountId = firstString(resolvedSearchParams.bankAccountId);
  const demoContext = await getDemoContext(undefined, {
    companyId: requestedCompanyId,
    bankAccountId: requestedBankAccountId,
  });
  const requestedUserId = actorUserIdFromSearchParam(resolvedSearchParams.userId);
  const currentUser =
    demoContext.users.find((user) => user.id === requestedUserId) ??
    demoContext.users.find((user) => user.id === demoContext.recommendedUserId) ??
    demoContext.users[0] ??
    null;

  return {
    demoContext,
    currentUser,
    currentUserId: currentUser?.id ?? demoContext.recommendedUserId,
    currentCompanyId: demoContext.company?.id ?? requestedCompanyId ?? null,
    currentBankAccountId: demoContext.bankAccount?.id ?? requestedBankAccountId ?? null,
  };
}
