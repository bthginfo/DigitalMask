import * as Y from "yjs";
import { liveRedis, permissionEpochKey } from "@/platform/realtime/redis";
import { HttpError } from "@/platform/http";
import { decodeState, encodeDocument, mergedDocument } from "./state";
import type { DocumentClaims } from "./ticket";
import { MAX_DOCUMENT_BYTES } from "./contracts";

export const dirtyDocumentsKey = "dm:documents:dirty";
export const documentKeys = (id: string) => ({
  base: `dm:document:${id}:base`,
  log: `dm:document:${id}:log`,
  counter: `dm:document:${id}:counter`,
});
export const initializeScript = `
  if redis.call('EXISTS', KEYS[1]) == 0 then
    redis.call('HSET', KEYS[1], 'state', ARGV[1], 'revision', ARGV[2])
  elseif tonumber(redis.call('HGET', KEYS[1], 'revision') or '-1') < tonumber(ARGV[2]) then
    redis.call('HSET', KEYS[1], 'state', ARGV[1], 'revision', ARGV[2])
  end
  local counter = tonumber(redis.call('GET', KEYS[2]) or '0')
  if counter < tonumber(ARGV[2]) then redis.call('SET', KEYS[2], ARGV[2]) end
  local base = tonumber(redis.call('HGET', KEYS[1], 'revision') or '0')
  redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', base)
  local bytes = 0
  for _, entry in ipairs(redis.call('ZRANGE', KEYS[3], 0, -1)) do bytes = bytes + string.len(cjson.decode(entry)[2]) end
  redis.call('HSET', KEYS[1], 'pendingBytes', bytes)
  redis.call('EXPIRE', KEYS[1], 604800)
  return 1
`;
// Dirty logs NEVER expire. The cached base always equals a committed SQL snapshot.
// Thus a cache expiry can be repaired from SQL without losing acknowledged edits.
export const readScript = `
  if ARGV[1] ~= '*' and (redis.call('GET', KEYS[4]) or '') ~= ARGV[1] then return {'expired'} end
  local state = redis.call('HGET', KEYS[1], 'state')
  if not state then return {'expired'} end
  local base = redis.call('HGET', KEYS[1], 'revision') or '0'
  local floor = tonumber(base)
  local since = tonumber(ARGV[2])
  if since then
    floor = math.max(floor, since)
    if since >= tonumber(base) then state = '' end
  end
  local updates = redis.call('ZRANGEBYSCORE', KEYS[2], '(' .. floor, '+inf')
  return {'ok', state, redis.call('GET', KEYS[3]) or base, base, updates}
`;
export const appendScript = `
  if (redis.call('GET', KEYS[4]) or '') ~= ARGV[1] then return {'expired'} end
  local state = redis.call('HGET', KEYS[1], 'state')
  if not state then return {'expired'} end
  if tonumber(redis.call('ZCARD', KEYS[2])) >= 2000 then return {'checkpoint'} end
  local bytes = tonumber(redis.call('HGET', KEYS[1], 'pendingBytes') or '0')
  if string.len(state) + bytes + string.len(ARGV[2]) > 3978000 then
    if bytes == 0 then return {'full'} end
    return {'checkpoint'}
  end
  local revision = redis.call('INCR', KEYS[3])
  local entry = cjson.encode({revision, ARGV[2], ARGV[3]})
  redis.call('ZADD', KEYS[2], revision, entry)
  redis.call('HINCRBY', KEYS[1], 'pendingBytes', string.len(ARGV[2]))
  redis.call('EXPIRE', KEYS[1], 604800)
  redis.call('SADD', KEYS[5], ARGV[4])
  local baseRevision = tonumber(redis.call('HGET', KEYS[1], 'revision') or '0')
  local delta = redis.call('ZRANGEBYSCORE', KEYS[2], '(' .. math.max(tonumber(ARGV[5]), baseRevision), '+inf')
  local baseState = ''
  if tonumber(ARGV[5]) < baseRevision then baseState = state end
  return {'ok', tostring(revision), baseState, delta}
`;
// Only discard updates already durably committed; concurrent appended updates survive.
export const acknowledgeScript = `
  local existing = tonumber(redis.call('HGET', KEYS[1], 'revision') or '-1')
  if existing > tonumber(ARGV[2]) then return 0 end
  redis.call('HSET', KEYS[1], 'state', ARGV[1], 'revision', ARGV[2])
  redis.call('EXPIRE', KEYS[1], 604800)
  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[2])
  local bytes = 0
  local remaining = redis.call('ZRANGE', KEYS[2], 0, -1)
  for _, entry in ipairs(remaining) do bytes = bytes + string.len(cjson.decode(entry)[2]) end
  redis.call('HSET', KEYS[1], 'pendingBytes', bytes)
  if redis.call('ZCARD', KEYS[2]) == 0 then redis.call('SREM', KEYS[3], ARGV[3]) end
  return 1
`;
type LogEntry = [number, string, string];
const parseLog = (entries: unknown[]) =>
  entries.map((entry) => (typeof entry === "string" ? JSON.parse(entry) : entry) as LogEntry);
function expired() {
  return new HttpError(409, "Der Dokumentzugang muss erneuert werden.", {
    code: "document_session_expired",
  });
}
export async function initializeDocumentCache(fileId: string, state: string, revision: number) {
  const keys = documentKeys(fileId);
  await liveRedis().eval(initializeScript, [keys.base, keys.counter, keys.log], [state, revision]);
}
export async function readDocumentLog(
  fileId: string,
  departmentId: string,
  epoch?: string,
  sinceRevision?: number,
) {
  const keys = documentKeys(fileId);
  const result = (await liveRedis().eval(
    readScript,
    [keys.base, keys.log, keys.counter, permissionEpochKey(departmentId)],
    [epoch === undefined ? "*" : epoch, sinceRevision === undefined ? "full" : sinceRevision],
  )) as [string, string, string, string, unknown[]];
  if (result[0] !== "ok") throw expired();
  const entries = parseLog(result[4]);
  return {
    state: result[1],
    revision: Number(result[2]),
    baseRevision: Number(result[3]),
    entries,
  };
}
export async function readDocumentState(claims: DocumentClaims, sinceRevision?: number) {
  const log = await readDocumentLog(
    claims.fileId,
    claims.departmentId,
    claims.epoch,
    sinceRevision,
  );
  if (sinceRevision !== undefined) {
    const updates = log.entries.map((entry) => decodeState(entry[1]));
    if (log.state) updates.unshift(decodeState(log.state));
    return {
      state: Buffer.from(Y.mergeUpdates(updates)).toString("base64"),
      revision: log.revision,
    };
  }
  const document = mergedDocument([log.state, ...log.entries.map((entry) => entry[1])]);
  try {
    return { state: encodeDocument(document), revision: log.revision };
  } finally {
    document.destroy();
  }
}
export async function appendDocumentUpdate(
  claims: DocumentClaims,
  update: string,
  sinceRevision = 0,
) {
  if (!claims.canEdit) throw new HttpError(403, "Dieses Dokument kannst du nur ansehen.");
  decodeState(update, 256_000);
  const keys = documentKeys(claims.fileId);
  const result = (await liveRedis().eval(
    appendScript,
    [keys.base, keys.log, keys.counter, permissionEpochKey(claims.departmentId), dirtyDocumentsKey],
    [claims.epoch, update, claims.userId, claims.fileId, Math.max(0, sinceRevision)],
  )) as [string, string, string, unknown[]];
  if (result[0] === "checkpoint")
    throw new HttpError(409, "Bitte sichere den Dokumentstand und versuche es erneut.", {
      code: "document_checkpoint_required",
    });
  if (result[0] === "full")
    throw new HttpError(
      413,
      "Dieses Dokument ist zu groß für weitere Änderungen. Lade den aktuellen Stand herunter und teile ihn in kleinere Dokumente auf.",
    );
  if (result[0] !== "ok") throw expired();
  const delta = parseLog(result[3]).map((entry) => decodeState(entry[1]));
  if (result[2]) delta.unshift(decodeState(result[2], MAX_DOCUMENT_BYTES));
  return {
    revision: Number(result[1]),
    state: Buffer.from(Y.mergeUpdates(delta)).toString("base64"),
  };
}
export async function acknowledgeCheckpoint(fileId: string, state: string, revision: number) {
  const keys = documentKeys(fileId);
  await liveRedis().eval(
    acknowledgeScript,
    [keys.base, keys.log, dirtyDocumentsKey],
    [state, revision, fileId],
  );
}
export async function clearDocumentCache(fileId: string) {
  const keys = documentKeys(fileId);
  await liveRedis()
    .pipeline()
    .del(keys.base, keys.log, keys.counter)
    .srem(dirtyDocumentsKey, fileId)
    .exec();
}
