import type { RecordData, RecordKind } from "@/shared/contracts";
import { actorSeasons, seasonForDate, teamTaskSeason } from "@/shared/period-filter";

/** Persist default membership once, rather than moving old records at the next season boundary. */
export function applySeasonDefaults(
  kind: RecordKind,
  data: RecordData,
  existingCreatedAt?: string,
) {
  if (kind === "actors" && data.ensembleSeasons === undefined)
    return { ...data, ensembleSeasons: actorSeasons(data) };
  if (kind === "tasks" && !data.productionId && (data.season === undefined || data.season === ""))
    return {
      ...data,
      season: existingCreatedAt
        ? teamTaskSeason(data, existingCreatedAt) || seasonForDate()
        : seasonForDate(),
    };
  return data;
}
