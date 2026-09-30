import { auth } from "@/platform/auth";
import { assertOrigin, route } from "@/platform/http";
export async function POST(request: Request) {
  return route(async () => {
    assertOrigin(request);
    return auth.api.signOut({ headers: request.headers, asResponse: true });
  });
}
