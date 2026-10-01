import { listValue, type RecordData } from "./contracts";

/** An empty personal selection shows no events; only explicit team mode shows all. */
export function calendarEventSelected(data: RecordData, people: string[], showAll = false) {
  return showAll || listValue(data.participantIds).some((id) => people.includes(id));
}
