import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/platform/auth";
import { requireContext } from "@/platform/context";
import { readJson, route, HttpError } from "@/platform/http";
import { timerAction } from "@/modules/time-tracking/timer";
import { timesheetAction } from "@/modules/time-tracking/timesheets";
import { decideLeave } from "@/modules/calendar/leave";
import { organizationAction } from "@/modules/organization/actions";
import { copyProduction } from "@/modules/productions/copy";
import { updateProfile } from "@/modules/profile/service";
import { readChatNotifications } from "@/modules/notifications/read";
export async function POST(request: Request) {
  return route(async () => {
    const {
      action,
      id,
      data = {},
    } = z
      .object({
        action: z.string().max(100),
        id: z.string().max(100).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await readJson(request));
    const context = await requireContext(true);
    let result: unknown;
    if (action === "profile-update") result = await updateProfile(context, data);
    else if (action === "chat-notifications-read")
      result = await readChatNotifications(context, data);
    else if (action.startsWith("attendance-timer-"))
      result = await timerAction(context, action.replace("attendance-", ""), data, "attendance");
    else if (action.startsWith("timer-")) result = await timerAction(context, action, data);
    else if (action.startsWith("timesheet-"))
      result = await timesheetAction(context, action, id, data);
    else if (action === "leave-decide" && id)
      result = await decideLeave(context, id, data.status, data.category);
    else if (action === "production-copy" && id)
      result = await copyProduction(context, id, String(data.title || ""));
    else if (action === "password-change") {
      const body = z
        .object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(128) })
        .parse(data);
      return auth.api.changePassword({
        body: { ...body, revokeOtherSessions: true },
        headers: request.headers,
        asResponse: true,
      });
    } else if (
      ["member-update", "password-reset", "calendar-token", "notification-read"].includes(action)
    )
      result = await organizationAction(context, action, id, data);
    else throw new HttpError(400, "Unbekannte Aktion.");
    return NextResponse.json(result);
  });
}
