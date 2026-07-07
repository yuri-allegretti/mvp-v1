import { getDemoContext } from "@/modules/demo/demoContextService";

export async function GET() {
  const context = await getDemoContext();
  return Response.json(context);
}
