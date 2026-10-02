"use client";
import { api, post } from "@/shared/client-api";

export type PushDeviceState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  active: boolean;
  needsHomeScreen: boolean;
  configured: boolean;
};
const ownerKey = "digitalmask-push-owner";
function capabilities() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    supported:
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      window.isSecureContext,
    needsHomeScreen: ios && !standalone,
  };
}
export async function registerPushWorker() {
  if (!("serviceWorker" in navigator)) return null;
  await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}
async function workerState(userId: string | null, count: number) {
  const registration = await registerPushWorker();
  if (!registration?.active) return;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      resolve();
    }, 2000);
    channel.port1.onmessage = () => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve();
    };
    registration.active!.postMessage(
      { type: "DIGITALMASK_BADGE", userId, count, timestamp: Date.now() },
      [channel.port2],
    );
  });
}
export async function syncAppBadge(userId: string, count: number) {
  const owner = localStorage.getItem(ownerKey);
  if (owner && owner !== userId) {
    localStorage.removeItem(ownerKey);
    await workerState(null, 0);
    const registration = await registerPushWorker();
    await (await registration?.pushManager.getSubscription())?.unsubscribe().catch(() => false);
  }
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (count: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count && badgeNavigator.setAppBadge) await badgeNavigator.setAppBadge(count);
    else if (badgeNavigator.clearAppBadge) await badgeNavigator.clearAppBadge();
  } catch {
    /* Optional OS capability; never interrupt the app. */
  }
  // Only an explicitly enabled account may accept notifications on this device.
  if (localStorage.getItem(ownerKey) === userId) await workerState(userId, count);
}
export async function getPushDeviceState(userId: string): Promise<PushDeviceState> {
  const support = capabilities();
  const initial: PushDeviceState = {
    ...support,
    permission: "Notification" in window ? Notification.permission : "unsupported",
    active: false,
    configured: false,
  };
  if (!support.supported || support.needsHomeScreen) return initial;
  const config = await api<{ configured: boolean; publicKey: string }>("/api/push");
  initial.configured = config.configured;
  const registration = await registerPushWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (
    subscription &&
    localStorage.getItem(ownerKey) === userId &&
    Notification.permission === "granted"
  ) {
    initial.active = (
      await post<{ active: boolean }>("/api/push", {
        action: "status",
        endpoint: subscription.endpoint,
      })
    ).active;
  }
  return initial;
}
export async function enablePush(userId: string) {
  const support = capabilities();
  if (support.needsHomeScreen)
    throw new Error("Füge DigitalMask zuerst zum Home-Bildschirm hinzu und öffne die App dort.");
  if (!support.supported) throw new Error("Dieser Browser unterstützt keine Gerätemitteilungen.");
  // Permission must be requested directly from the user's click, before any network await (iOS).
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Mitteilungen wurden nicht erlaubt. Du kannst sie in den Browser- oder Geräteeinstellungen freigeben.",
    );
  const config = await api<{ configured: boolean; publicKey: string }>("/api/push");
  if (!config.configured)
    throw new Error("Mitteilungen werden gerade eingerichtet. Bitte versuche es später erneut.");
  const bytes = Uint8Array.from(
    atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
    (character) => character.charCodeAt(0),
  );
  const registration = await registerPushWorker();
  if (!registration) throw new Error("Die App konnte nicht für Mitteilungen vorbereitet werden.");
  let subscription = await registration.pushManager.getSubscription();
  // An explicit enable on a shared device transfers only this browser's subscription.
  if (subscription && localStorage.getItem(ownerKey) !== userId) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ||= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes,
  });
  try {
    localStorage.setItem(ownerKey, userId);
    await workerState(userId, 0);
    await post("/api/push", { action: "subscribe", subscription: subscription.toJSON() });
  } catch (error) {
    localStorage.removeItem(ownerKey);
    await workerState(null, 0);
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}
export async function disablePush(userId: string) {
  const registration = await registerPushWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (localStorage.getItem(ownerKey) !== userId) return;
  try {
    if (subscription)
      await post("/api/push", { action: "unsubscribe", endpoint: subscription.endpoint });
  } finally {
    localStorage.removeItem(ownerKey);
    await workerState(null, 0);
    await subscription?.unsubscribe();
    await syncAppBadge(userId, 0);
  }
}
export async function testPush() {
  const registration = await registerPushWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) throw new Error("Aktiviere zuerst Mitteilungen auf diesem Gerät.");
  await post("/api/push", { action: "test", endpoint: subscription.endpoint });
}
export async function stopPushOnLogout(userId: string) {
  if ("serviceWorker" in navigator && localStorage.getItem(ownerKey) === userId)
    await disablePush(userId).catch(() => undefined);
  await syncAppBadge(userId, 0);
}
