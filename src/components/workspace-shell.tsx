"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Download,
  Home,
  Layers3,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Search,
  Settings2,
  Theater,
  Users,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { subscribeLocation, subscribeMobile } from "@/shared/client-storage";
import type { DomainRecord, RecordKind } from "@/shared/contracts";
import { initials, post, value } from "@/shared/client-api";
import { useWorkspace } from "./workspace-context";
import { Badge, Empty, Modal } from "./ui";
import { ThemeSwitch } from "./theme-switch";
import { RecordDetail, ResourceView } from "./resource-view";
import { TodayModule } from "./modules/today";
import { ProductionsModule, CastingModule } from "./modules/productions";
import { TasksModule } from "./modules/tasks";
import { CalendarModule } from "./modules/calendar";
import { TimeModule } from "./modules/time";
import { ChatModule } from "./modules/chat";
import { SettingsModule } from "./modules/settings";
import { labels } from "./resource-fields";
import { ExportDialog } from "./export-dialog";
const nav: { id: string; label: string; icon: LucideIcon; group: string }[] = [
  { id: "today", label: "Heute", icon: Home, group: "ARBEITSRAUM" },
  { id: "productions", label: "Produktionen", icon: Theater, group: "ARBEITSRAUM" },
  { id: "calendar", label: "Kalender", icon: CalendarDays, group: "ARBEITSRAUM" },
  { id: "tasks", label: "Aufgaben & Sprints", icon: Layers3, group: "ARBEITSRAUM" },
  { id: "time", label: "Zeit buchen", icon: Clock3, group: "ARBEITSRAUM" },
  { id: "chat", label: "Kommunikation", icon: MessageSquare, group: "ARBEITSRAUM" },
  { id: "actors", label: "Schauspielerkatalog", icon: Users, group: "WISSEN & FUNDUS" },
  { id: "casting", label: "Figuren & Besetzung", icon: Theater, group: "WISSEN & FUNDUS" },
  { id: "documentation", label: "Aufschriebe", icon: BookOpen, group: "WISSEN & FUNDUS" },
  { id: "inventory", label: "Fundus & Material", icon: Package, group: "WISSEN & FUNDUS" },
  { id: "handovers", label: "Dienstübergaben", icon: ClipboardCheck, group: "WISSEN & FUNDUS" },
  { id: "exports", label: "Exporte", icon: Download, group: "VERWALTUNG" },
  { id: "settings", label: "Einstellungen", icon: Settings2, group: "VERWALTUNG" },
];
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function WorkspaceShell() {
  const { workspace, notice, notify, online, action, refresh, busy } = useWorkspace();
  const query = useSyncExternalStore(
    subscribeLocation,
    () => location.search,
    () => "",
  );
  const params = new URLSearchParams(query);
  const requestedModule = params.get("module") || "today";
  const activeModule = nav.some((item) => item.id === requestedModule) ? requestedModule : "today";
  const recordId = params.get("record") || "";
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const main = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuOpener = useRef<HTMLElement | null>(null);
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => matchMedia("(max-width: 760px)").matches,
    () => false,
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    const installer = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeinstallprompt", installer);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeinstallprompt", installer);
    };
  }, []);
  const openMenu = () => {
    menuOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMobileMenu(true);
  };
  useEffect(() => {
    if (!mobileMenu || !isMobile) return;
    const previousFocus = menuOpener.current || document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.setProperty("overflow", "hidden");
    const items = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") || [],
      ).filter((element) => element.getClientRects().length);
    items()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenu(false);
      }
      if (event.key === "Tab") {
        const focusable = items();
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.setProperty("overflow", previousOverflow);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [mobileMenu, isMobile]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => notify(""), 7000);
    return () => clearTimeout(timeout);
  }, [notice, notify]);
  const navigate = (next: string) => {
    setMobileMenu(false);
    history.pushState({}, "", next === "today" ? "/" : `/?module=${next}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const logout = async () => {
    let drafts: unknown[] = [];
    try {
      drafts = JSON.parse(
        localStorage.getItem(`digitalmask-time-drafts:${workspace.user.id}`) || "[]",
      );
    } catch {}
    if (
      drafts.length &&
      !confirm(
        "Es gibt lokale Zeitentwürfe. Beim Abmelden werden sie auf diesem Gerät gelöscht. Trotzdem abmelden?",
      )
    )
      return;
    try {
      await post("/api/logout", {});
      localStorage.removeItem(`digitalmask-time-drafts:${workspace.user.id}`);
      location.replace("/login");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Abmelden fehlgeschlagen");
    }
  };
  const unread = workspace.records.notifications.filter(
    (x) => !x.data.read && x.data.userId === workspace.user.id,
  );
  const results =
    search.length >= 2
      ? Object.values(workspace.records)
          .flat()
          .filter(
            (record) =>
              !["files", "notifications", "timesheets", "messages", "time"].includes(record.kind) &&
              JSON.stringify(record.data).toLowerCase().includes(search.toLowerCase()),
          )
          .slice(0, 30)
      : [];
  const queryRecord = recordId
    ? Object.values(workspace.records)
        .flat()
        .find((record) => record.id === recordId)
    : undefined;
  const closeDetail = () => {
    setDetail(null);
    const next = new URL(location.href);
    next.searchParams.delete("record");
    history.replaceState({}, "", next.pathname + next.search);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const active = nav.find((x) => x.id === activeModule)!;
  const screen =
    activeModule === "today" ? (
      <TodayModule navigate={navigate} />
    ) : activeModule === "productions" ? (
      <ProductionsModule />
    ) : activeModule === "calendar" ? (
      <CalendarModule />
    ) : activeModule === "tasks" ? (
      <TasksModule />
    ) : activeModule === "time" ? (
      <TimeModule />
    ) : activeModule === "chat" ? (
      <ChatModule />
    ) : activeModule === "actors" ? (
      <ResourceView
        kind="actors"
        description="Kontakte, Perückenmaße, Hinweise und Fotos. Das Wissen über eure Schauspieler an einem Ort."
      />
    ) : activeModule === "casting" ? (
      <CastingModule />
    ) : activeModule === "documentation" ? (
      <DocumentationModule />
    ) : activeModule === "inventory" ? (
      <ResourceView
        kind="materials"
        description="Perücken, Produkte und Werkzeuge. Lagerorte, Bestand und Einkaufsbedarf im Blick."
      />
    ) : activeModule === "handovers" ? (
      <ResourceView
        kind="handovers"
        description="Was bei der nächsten Vorstellung wichtig ist: Checklisten, offene Punkte und klare Übergaben."
      />
    ) : activeModule === "exports" ? (
      <ExportsModule />
    ) : (
      <SettingsModule />
    );
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>
      {mobileMenu && <div className="sidebar-backdrop" onClick={() => setMobileMenu(false)} />}
      <aside
        ref={sidebar}
        inert={isMobile && !mobileMenu}
        aria-hidden={isMobile && !mobileMenu ? true : undefined}
        role={isMobile && mobileMenu ? "dialog" : undefined}
        aria-modal={isMobile && mobileMenu ? true : undefined}
        aria-label="Navigation"
        className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}
      >
        <Link
          className="brand"
          href="/"
          prefetch={false}
          onClick={(event) => {
            event.preventDefault();
            navigate("today");
          }}
        >
          <span className="brand-symbol">M</span>
          <span>
            digitalmask<span className="brand-sub">STADTTHEATER INGOLSTADT</span>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          onClick={() => setMobileMenu(false)}
          aria-label="Menü schließen"
        >
          <X size={20} />
        </button>
        <div className="department-switch">
          <span className="department-icon">
            <Theater size={19} />
          </span>
          <div>
            <strong>{workspace.department.name}</strong>
            <span className="small muted">{workspace.organization.name}</span>
          </div>
          <Badge tone="green">Team</Badge>
        </div>
        <nav aria-label="Hauptnavigation">
          {["ARBEITSRAUM", "WISSEN & FUNDUS", "VERWALTUNG"].map((group) => (
            <div className="nav-group" key={group}>
              <p className="eyebrow">{group}</p>
              {nav
                .filter((x) => x.group === group)
                .map((item) => (
                  <button
                    className={`nav-item ${activeModule === item.id ? "active" : ""}`}
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    aria-current={activeModule === item.id ? "page" : undefined}
                  >
                    <item.icon size={18} strokeWidth={1.7} />
                    <span>{item.label}</span>
                    {item.id === "chat" && <span className="nav-dot" />}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <div className="user-summary">
            <span className="avatar">{initials(workspace.user.name)}</span>
            <div>
              <strong>{workspace.user.name}</strong>
              <span className="small muted">
                {workspace.user.role === "superadmin"
                  ? "Superadmin"
                  : workspace.user.role === "admin"
                    ? "Admin"
                    : "Teammitglied"}
              </span>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={() => void logout()}
            aria-label="Abmelden"
            title="Abmelden"
          >
            <LogOut size={17} />
          </button>
        </footer>
      </aside>
      <div className="workspace-content" inert={isMobile && mobileMenu}>
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu-button"
              onClick={openMenu}
              aria-label="Menü öffnen"
            >
              <Menu size={19} />
            </button>
            <span>Maske</span>
            <span className="crumb-separator">/</span>
            <strong>{active.label}</strong>
          </div>
          <div className="topbar-actions">
            <button className="global-search-button" onClick={() => setSearchOpen(true)}>
              <Search size={16} />
              <span>Alles durchsuchen</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button search-mobile"
              onClick={() => setSearchOpen(true)}
              aria-label="Globale Suche"
            >
              <Search size={19} />
            </button>
            <ThemeSwitch />
            <button
              className="icon-button notification-button"
              onClick={() => setNotificationOpen(true)}
              aria-label={`${unread.length} ungelesene Mitteilungen`}
            >
              <Bell size={19} />
              {unread.length > 0 && <span>{unread.length}</span>}
            </button>
            <span className="avatar topbar-avatar">{initials(workspace.user.name)}</span>
          </div>
        </header>
        {!online && (
          <div className="connectivity-banner" role="status">
            <WifiOff size={17} />
            Du bist offline. Zeitentwürfe kannst du lokal speichern und später synchronisieren.
          </div>
        )}
        <main ref={main} id="main" className="main-content" key={activeModule} tabIndex={-1}>
          {screen}
        </main>
        <footer className="workspace-footer">
          <span>DigitalMask · Gemeinsam hinter der Bühne.</span>
          <button className="text-button" disabled={busy || !online} onClick={() => void refresh()}>
            Daten aktualisieren
          </button>
          {install && (
            <button
              className="text-button"
              onClick={async () => {
                await install.prompt();
                await install.userChoice;
                setInstall(null);
              }}
            >
              App installieren
            </button>
          )}
        </footer>
      </div>
      <nav className="bottom-nav" inert={isMobile && mobileMenu} aria-label="Mobile Navigation">
        {[
          ["today", "Heute", Home],
          ["calendar", "Kalender", CalendarDays],
          ["tasks", "Aufgaben", Layers3],
          ["time", "Zeit", Clock3],
          ["more", "Mehr", Menu],
        ].map(([key, label, Icon]) => {
          const Component = Icon as LucideIcon;
          return (
            <button
              key={String(key)}
              className={
                activeModule === key ||
                (key === "more" && !["today", "calendar", "tasks", "time"].includes(activeModule))
                  ? "active"
                  : ""
              }
              onClick={() => (key === "more" ? openMenu() : navigate(String(key)))}
            >
              <Component size={20} />
              <span>{String(label)}</span>
            </button>
          );
        })}
      </nav>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => notify("")} aria-label="Hinweis schließen">
            <X size={15} />
          </button>
        </div>
      )}
      {searchOpen && (
        <Modal
          title="Im Arbeitsraum suchen"
          onClose={() => {
            setSearchOpen(false);
            setSearch("");
          }}
          wide
        >
          <div className="global-search-field">
            <Search size={20} />
            <input
              autoFocus
              placeholder="Produktion, Figur, Schauspieler, Material …"
              aria-label="Suchbegriff"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search.length < 2 ? (
            <p className="empty-inline">
              Mindestens 2 Zeichen eingeben. Die Suche verwendet die bereits geladenen, für dich
              freigegebenen Daten.
            </p>
          ) : results.length ? (
            <div className="search-results">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => {
                    setDetail(result);
                    setSearchOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="small muted">{labels[result.kind][1]}</span>
                  <strong>
                    {value(result.data, "title") || value(result.data, "name") || "Eintrag"}
                  </strong>
                  <span className="small muted">
                    {value(result.data, "description") || value(result.data, "notes")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Nichts Passendes gefunden."
              description="Versuche einen anderen Namen oder Begriff."
            />
          )}
        </Modal>
      )}
      {notificationOpen && (
        <Modal title="Mitteilungen" onClose={() => setNotificationOpen(false)}>
          {workspace.records.notifications.length ? (
            <div className="list">
              {workspace.records.notifications.map((item) => (
                <button
                  className="notification-row"
                  key={item.id}
                  onClick={async () => {
                    try {
                      await action("notification-read", item.id);
                      setNotificationOpen(false);
                      const link = value(item.data, "link");
                      if (link.startsWith("/")) location.href = link;
                    } catch (e) {
                      notify(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
                    }
                  }}
                >
                  <span className={item.data.read ? "notice-dot read" : "notice-dot"} />
                  <div>
                    <strong>{value(item.data, "title")}</strong>
                    <p className="small muted">{value(item.data, "body")}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Alles ruhig hinter der Bühne."
              description="Neue Aufgaben und wichtige Änderungen erscheinen hier."
            />
          )}
        </Modal>
      )}
      {(detail || queryRecord) && (
        <RecordDetail record={(detail || queryRecord)!} onClose={closeDetail} />
      )}
    </div>
  );
}
function DocumentationModule() {
  const { workspace } = useWorkspace();
  const [tab, setTab] = useState("looks");
  const [project, setProject] = useState("");
  return (
    <>
      <div className="tabs compact-tabs">
        <button className={tab === "looks" ? "active" : ""} onClick={() => setTab("looks")}>
          Sammelordner
        </button>
        <button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>
          Vorlagen
        </button>
      </div>
      <ResourceView
        key={`${tab}:${project}`}
        kind={tab === "looks" ? "looks" : "templates"}
        defaults={{ productionId: project }}
        filter={tab === "looks" && project ? (x) => x.data.productionId === project : undefined}
        description={
          tab === "looks"
            ? "Ein gemeinsames Schema für Vorbereitung, Material, Ablauf und Wechsel. Mit Bildern, Entwürfen und veröffentlichten Aufschrieben."
            : "Eure Dokumentationsstandards als wiederverwendbare, versionierte Vorlagen."
        }
      >
        {tab === "looks" && (
          <div className="toolbar">
            <label className="inline-label">
              Sammelordner
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">Alle Produktionen</option>
                {workspace.records.productions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {value(x.data, "title")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </ResourceView>
    </>
  );
}
function ExportsModule() {
  const [kind, setKind] = useState<RecordKind | null>(null);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">DIE RICHTIGE ANSICHT FÜR JEDEN ZWECK</p>
          <h1>Exporte & Ausdrucke</h1>
          <p className="muted">
            Kalender, Arbeitszeit und Theaterwissen als PDF, Excel oder offene Daten.
          </p>
        </div>
      </header>
      <div className="export-options">
        {(
          [
            "events",
            "time",
            "productions",
            "actors",
            "casting",
            "looks",
            "tasks",
            "materials",
            "handovers",
          ] as RecordKind[]
        ).map((item) => (
          <button key={item} onClick={() => setKind(item)}>
            <Download size={22} />
            <div>
              <h3>{labels[item][0]}</h3>
              <p className="small muted">
                {item === "events"
                  ? "Monat, Woche, Tag, Agenda & Team · PDF, ICS, Excel"
                  : "PDF für Ausdrucke · Excel, CSV & JSON für Daten"}
              </p>
            </div>
            <span>Exportieren →</span>
          </button>
        ))}
      </div>
      {kind && <ExportDialog kind={kind} onClose={() => setKind(null)} />}
    </>
  );
}
