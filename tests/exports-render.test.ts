import { it } from "vitest";
import { verifyExports } from "../scripts/verify-exports";
// The full raster suite is explicit because it creates print artifacts for human visual QA.
it.skipIf(process.env.EXPORT_RENDER_QA !== "1")(
  "renders every fictional print fixture and checks media boxes",
  async () => {
    await verifyExports();
  },
  120000,
);
