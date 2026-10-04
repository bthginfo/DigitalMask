(() => {
  const OriginalDate = Date;
  const fixed = OriginalDate.parse("2026-10-04T10:00:00+02:00");
  window.Date = class extends OriginalDate {
    constructor(...args) {
      super(...(args.length ? args : [fixed]));
    }
    static now() {
      return fixed;
    }
  };
  try {
    localStorage.clear();
    localStorage.setItem("digitalmask-theme", "light");
  } catch {}
  if (navigator.serviceWorker)
    navigator.serviceWorker.register = async () => {
      throw new Error("Tutorial preview: service worker disabled");
    };
  const kinds = [
    "productions",
    "actors",
    "characters",
    "casting",
    "maskPlans",
    "sprints",
    "tasks",
    "events",
    "leave",
    "time",
    "looks",
    "templates",
    "messages",
    "materials",
    "handovers",
    "notifications",
    "timesheets",
    "files",
    "feedback",
    "attendance",
    "calendarCategories",
    "conversations",
    "people",
    "categories",
  ];
  const user = {
    id: "demo-mara",
    name: "Mara Beispiel",
    username: "mara.demo",
    role: "user",
    status: "active",
    preferences: { accentPalette: "green", onboardingVersion: 1 },
  };
  const workspace = {
    user,
    organization: { id: "demo-theatre", name: "Stadttheater Ingolstadt" },
    department: { id: "demo-makeup", name: "Maske" },
    members: [
      user,
      {
        id: "demo-nora",
        name: "Nora Muster",
        username: "nora.demo",
        role: "admin",
        status: "active",
      },
    ],
    records: Object.fromEntries(kinds.map((kind) => [kind, []])),
    timer: null,
    attendanceTimer: null,
    projectHours: {},
    live: null,
  };
  window.__DM_DEMO = { workspace, writes: [] };
  const actualFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.startsWith("/api/")) return actualFetch(input, init);
    const response = (body) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    if (url.pathname === "/api/workspace") return response(workspace);
    if (url.pathname === "/api/records/attendance" && init.method === "POST") {
      const data = JSON.parse(init.body).data;
      const record = {
        id: "demo-attendance",
        kind: "attendance",
        organizationId: workspace.organization.id,
        departmentId: workspace.department.id,
        createdBy: user.id,
        version: 1,
        createdAt: new OriginalDate(fixed).toISOString(),
        updatedAt: new OriginalDate(fixed).toISOString(),
        data: {
          ...data,
          userId: user.id,
          dayAllocations: [{ date: data.date, seconds: data.durationSeconds }],
        },
      };
      workspace.records.attendance.push(record);
      window.__DM_DEMO.writes.push(record);
      return response(record);
    }
    return response({});
  };
  const setup = () => {
    const style = document.createElement("style");
    style.textContent = `nextjs-portal{display:none!important}#dm-demo-cursor{position:fixed;width:20px;height:20px;box-sizing:border-box;border:2px solid #0d7056;border-radius:50%;background:#c5f1dbbb;box-shadow:0 0 0 4px #ffffffbf,0 2px 9px #003d3033;pointer-events:none;z-index:2147483647;left:0;top:0;opacity:0;transform:translate(-50%,-50%)}.dm-demo-ring{position:fixed;width:30px;height:30px;border:3px solid #0d7056;border-radius:50%;pointer-events:none;z-index:2147483646;transform:translate(-50%,-50%);animation:dm-demo-tap .7s ease-out forwards}@keyframes dm-demo-tap{to{width:72px;height:72px;opacity:0}}`;
    document.head.append(style);
    const cursor = document.createElement("div");
    cursor.id = "dm-demo-cursor";
    document.body.append(cursor);
    new MutationObserver(() => {
      if (!cursor.isConnected) document.body.append(cursor);
    }).observe(document.body, { childList: true, subtree: true });
    let position = { x: 215, y: 370 };
    window.__dmMove = (x, y, duration = 550) =>
      new Promise((resolve) => {
        // Native dialogs render in the browser's top layer. Keep tap markers there.
        const target = document.querySelector("dialog[open]") || document.body;
        if (cursor.parentElement !== target) target.append(cursor);
        const start = performance.now(),
          from = { ...position };
        cursor.style.opacity = "1";
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration),
            eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          position = { x: from.x + (x - from.x) * eased, y: from.y + (y - from.y) * eased };
          cursor.style.left = position.x + "px";
          cursor.style.top = position.y + "px";
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    window.__dmTap = (x, y) => {
      const ring = document.createElement("div");
      ring.className = "dm-demo-ring";
      ring.style.left = x + "px";
      ring.style.top = y + "px";
      (document.querySelector("dialog[open]") || document.body).append(ring);
      setTimeout(() => ring.remove(), 750);
    };
    document.addEventListener(
      "pointerdown",
      (event) => window.__dmTap(event.clientX, event.clientY),
      true,
    );
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
})();
