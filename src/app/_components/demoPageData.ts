import { actorUserIdFromSearchParam } from "@/lib/companyAccess";
import { getDemoContext } from "@/modules/demo/demoContextService";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export async function getDemoPageData(searchParams?: Promise<SearchParamsRecord> | SearchParamsRecord) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const demoContext = await getDemoContext();
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
  };
}
