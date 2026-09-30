import { z } from "zod";
import { auth } from "@/platform/auth";
import { readJson, route } from "@/platform/http";
import { throttle } from "@/platform/auth/throttle";
export async function POST(request: Request) {
  return route(async () => {
    const body = z
      .object({ username: z.string().min(3).max(32), password: z.string().min(1).max(128) })
      .parse(await readJson(request));
    await throttle(request, "login", 10);
    return auth.api.signInUsername({ body, headers: request.headers, asResponse: true });
  });
}
