import { requireContext } from "@/platform/context";
import { HttpError, route } from "@/platform/http";
import { getWorkspace } from "@/modules/records/workspace";
import { chatMediaItems, chatMediaPage } from "@/modules/chat/media";

export function GET(request: Request) {
  return route(async () => {
    const params = new URL(request.url).searchParams;
    const scope = {
      conversationId: params.get("conversationId") || "",
      productionId: params.get("productionId") || "",
    };
    const before = params.get("before") || "";
    const beforeId = params.get("beforeId") || "";
    if (
      scope.conversationId.length > 100 ||
      scope.productionId.length > 100 ||
      (scope.conversationId && scope.productionId) ||
      !!before !== !!beforeId ||
      beforeId.length > 100 ||
      (before &&
        (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(before) ||
          !Number.isFinite(Date.parse(before))))
    )
      throw new HttpError(400, "Die Medienauswahl ist ungültig.");
    const { records } = await getWorkspace(await requireContext(), ["messages", "files"], scope);
    if (
      (scope.conversationId &&
        !records.conversations.some((chat) => chat.id === scope.conversationId)) ||
      (scope.productionId &&
        !records.productions.some((production) => production.id === scope.productionId))
    )
      throw new HttpError(403, "Du hast keinen Zugriff auf diesen Chat.");
    return Response.json(
      chatMediaPage(chatMediaItems(records.messages, records.files, scope), before, beforeId),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  });
}
