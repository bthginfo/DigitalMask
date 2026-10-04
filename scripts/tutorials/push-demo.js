// Fictional notification device used only by the offline tutorial recorder.
(() => {
  const state = window.__DM_DEMO;
  let permission = "default";
  let subscribed = false;
  const subscription = {
    endpoint: "https://tutorial.invalid/push",
    toJSON: () => ({ endpoint: "https://tutorial.invalid/push", keys: {} }),
    unsubscribe: async () => {
      subscribed = false;
      return true;
    },
  };
  const worker = {
    active: { postMessage: (_message, ports) => ports?.[0]?.postMessage({ ok: true }) },
    pushManager: {
      getSubscription: async () => (subscribed ? subscription : null),
      subscribe: async () => {
        subscribed = true;
        return subscription;
      },
    },
  };
  navigator.serviceWorker.register = async () => worker;
  Object.defineProperty(navigator.serviceWorker, "ready", { get: () => Promise.resolve(worker) });
  window.Notification = class {
    static get permission() {
      return permission;
    }
    static requestPermission() {
      return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        dialog.setAttribute("aria-label", "Geräteabfrage – vereinfacht");
        dialog.style.cssText =
          "width:min(480px,90vw);padding:28px;border:1px solid #dce5de;border-radius:20px;color:#20382f;background:white;font:16px Arial,sans-serif";
        const label = document.createElement("p");
        label.textContent = "GERÄTEABFRAGE · VEREINFACHT";
        label.style.cssText = "font-size:12px;letter-spacing:.1em;color:#52645c";
        const title = document.createElement("h2");
        title.textContent = "Mitteilungen von DigitalMask?";
        title.style.cssText = "font-size:22px;line-height:1.35";
        const text = document.createElement("p");
        text.textContent = "Erlaube Mitteilungen auf diesem Gerät.";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:12px;margin-top:28px";
        for (const [name, value] of [
          ["Nicht erlauben", "denied"],
          ["Erlauben", "granted"],
        ]) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = name;
          button.style.cssText = `flex:1;min-height:48px;padding:12px;border-radius:12px;border:1px solid #dce5de;font-size:16px;background:${value === "granted" ? "#14745e" : "white"};color:${value === "granted" ? "white" : "#20382f"}`;
          button.addEventListener("click", () => {
            permission = value;
            dialog.close();
            dialog.remove();
            resolve(permission);
          });
          row.append(button);
        }
        dialog.append(label, title, text, row);
        document.body.append(dialog);
        dialog.showModal();
      });
    }
  };
  const priorFetch = window.fetch;
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.pathname !== "/api/push") return priorFetch(input, init);
    state.pushRequests ??= [];
    state.pushRequests.push(
      init.method === "POST" ? JSON.parse(init.body) : { action: "configuration" },
    );
    return new Response(
      JSON.stringify({
        configured: true,
        publicKey: btoa(String.fromCharCode(...new Uint8Array(65).fill(1))),
        active: subscribed,
        sent: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
})();
