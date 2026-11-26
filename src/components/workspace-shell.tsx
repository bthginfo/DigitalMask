"use client";
import { BrandMark } from "./brand-mark";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Bell,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Download,
  Home,
  CircleHelp,
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
import {
  captureNavigationScroll,
  closeRecordDetail,
  navigateWorkspace,
  navigationReturn,
  restoreNavigationScroll,
  returnToContext,
  setNavigationUser,
} from "@/shared/client-navigation";
import { subscribeLocation, subscribeMobile } from "@/shared/client-storage";
import { onboardingVersion, type DomainRecord } from "@/shared/contracts";
import { initials, post } from "@/shared/client-api";
import { useWorkspace } from "./workspace-context";
import { stopPushOnLogout } from "@/modules/notifications/client";
import { chatUnreadCounts, unreadNotifications } from "@/modules/notifications/unread";
import { MarkAllReadButton } from "@/modules/notifications/components/mark-all-read";
import { NotificationRow } from "@/modules/notifications/components/notification-row";
import { Badge, Empty, Modal } from "./ui";
import { ThemeSwitch } from "./theme-switch";
import { LiveStatus } from "./live-status";
import { TodayModule } from "./modules/today";
import {
  ActorsModule,
  CalendarModule,
  ChatModule,
  DocumentationModule,
  ExportsModule,
  HelpModule,
  OnboardingTour,
  PeopleModule,
  ProductionsModule,
  RecordDetail,
  ResourceView,
  SettingsModule,
  TasksModule,
  TimeModule,
  WorkspaceSearch,
  prefetchModules,
  whenIdle,
} from "./lazy-modules";
import chatStyles from "@/modules/chat/components/chat-viewport.module.css";
import { ProfileAccent } from "@/modules/profile/components/accent-picker";
import { AppInstall } from "@/modules/pwa/components/app-install";
const nav: { id: string; label: string; icon: LucideIcon; group: string }[] = [
  { id: "today", label: "Heute", icon: Home, group: "ARBEITSRAUM" },
  { id: "productions", label: "Produktionen", icon: Theater, group: "ARBEITSRAUM" },
  { id: "calendar", label: "Kalender", icon: CalendarDays, group: "ARBEITSRAUM" },
  { id: "tasks", label: "Teamboard", icon: Layers3, group: "ARBEITSRAUM" },
  { id: "time", label: "Zeit buchen", icon: Clock3, group: "ARBEITSRAUM" },
  { id: "chat", label: "Kommunikation", icon: MessageSquare, group: "ARBEITSRAUM" },
  { id: "people", label: "Ansprechpersonen", icon: Users, group: "WISSEN & FUNDUS" },
  { id: "actors", label: "Schauspielerkatalog", icon: Users, group: "WISSEN & FUNDUS" },
  { id: "documentation", label: "Aufschriebe", icon: BookOpen, group: "WISSEN & FUNDUS" },
  { id: "inventory", label: "Fundus & Material", icon: Package, group: "WISSEN & FUNDUS" },
  { id: "handovers", label: "Dienstübergaben", icon: ClipboardCheck, group: "WISSEN & FUNDUS" },
  { id: "exports", label: "Exporte", icon: Download, group: "VERWALTUNG" },
  { id: "help", label: "Hilfe & Feedback", icon: CircleHelp, group: "VERWALTUNG" },
  { id: "settings", label: "Einstellungen", icon: Settings2, group: "VERWALTUNG" },
];
export function WorkspaceShell() {
  const { workspace, notice, notify, online, action } = useWorkspace();
  const query = useSyncExternalStore(
    subscribeLocation,
    () => location.search,
    () => "",
  );
  const params = new URLSearchParams(query);
  const requestedModule =
    params.get("module") === "productions" && params.get("tab") === "handovers"
      ? "handovers"
      : params.get("module") || "today";
  const activeModule = nav.some((item) => item.id === requestedModule) ? requestedModule : "today";
  const recordId = params.get("record") || "";
  const swapId = activeModule === "calendar" ? params.get("swapId") || "" : "";
  const leaveId = activeModule === "calendar" ? params.get("leaveId") || "" : "";
  const leaveSection = activeModule === "calendar" && params.get("section") === "leave";
  const scrollTarget = swapId
    ? `swap-${swapId}`
    : leaveId
      ? `leave-${leaveId}`
      : leaveSection
        ? "leave-requests"
        : undefined;
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [notificationSnapshot, setNotificationSnapshot] = useState<{
    items: DomainRecord[];
    knownIds: Set<string>;
  } | null>(null);
  const [tourRequested, setTourRequested] = useState(false);
  const needsTour =
    workspace.user.preferences !== undefined &&
    workspace.user.preferences.onboardingVersion < onboardingVersion;
  const main = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuOpener = useRef<HTMLElement | null>(null);
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => matchMedia("(max-width: 760px)").matches,
    () => false,
  );
  useEffect(() => {
    setNavigationUser(workspace.user.id);
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    let timeout: ReturnType<typeof setTimeout>;
    const saveScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(captureNavigationScroll, 120);
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("scroll", saveScroll);
      history.scrollRestoration = previous;
    };
  }, [workspace.user.id]);
  useEffect(() => restoreNavigationScroll(scrollTarget), [query, scrollTarget]);
  // Bottom-navigation screens load in the background so switching tabs stays instant.
  useEffect(
    () => whenIdle(() => prefetchModules(["calendar", "productions", "time", "chat", "resources"])),
    [],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
    };
  }, []);
  const openMenu = (opener: HTMLElement) => {
    menuOpener.current = opener;
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
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [mobileMenu, isMobile]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => notify(""), 7000);
    return () => clearTimeout(timeout);
  }, [notice, notify]);
  const navigate = useCallback((next: string) => {
    setMobileMenu(false);
    navigateWorkspace(next.startsWith("/") ? next : next === "today" ? "/" : `/?module=${next}`);
  }, []);
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
      await stopPushOnLogout(workspace.user.id);
      await post("/api/logout", {});
      localStorage.removeItem(`digitalmask-time-drafts:${workspace.user.id}`);
      delete document.documentElement.dataset.accent;
      location.replace("/login");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Abmelden fehlgeschlagen");
    }
  };
  const unread = unreadNotifications(workspace.records.notifications, workspace.user.id);
  const notificationsById = notificationSnapshot
    ? new Map(workspace.records.notifications.map((item) => [item.id, item]))
    : null;
  const notificationItems = notificationSnapshot
    ? [
        ...notificationSnapshot.items.map(
          (item) =>
            notificationsById?.get(item.id) ?? { ...item, data: { ...item.data, read: true } },
        ),
        ...workspace.records.notifications.filter(
          (item) =>
            item.data.userId === workspace.user.id && !notificationSnapshot.knownIds.has(item.id),
        ),
      ].sort(
        (a, b) =>
          (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
          a.id.localeCompare(b.id),
      )
    : [];
  const chatUnread = chatUnreadCounts(workspace.records.notifications, workspace.user.id).total;
  const linkedRecord = recordId
    ? Object.values(workspace.records)
        .flat()
        .find((record) => record.id === recordId)
    : undefined;
  const queryRecord = linkedRecord?.kind !== "maskPlans" ? linkedRecord : undefined;
  const missingTarget =
    (recordId && !linkedRecord) ||
    (swapId && !workspace.records.shiftSwaps.some((row) => row.id === swapId)) ||
    (leaveId && !workspace.records.leave.some((row) => row.id === leaveId));
  const closeDetail = () => {
    setDetail(null);
    closeRecordDetail();
  };
  const active = nav.find((x) => x.id === activeModule)!;
  const screen =
    activeModule === "today" ? (
      <TodayModule navigate={navigate} />
    ) : activeModule === "productions" ? (
      <ProductionsModule
        productionId={params.get("productionId") || ""}
        showStart={params.get("showStart") || ""}
        focusedMessageId={params.get("messageId") || ""}
        activeTab={params.get("tab") === "handovers" ? "overview" : params.get("tab") || "overview"}
        onNavigate={(id, tab) => {
          const next = new URLSearchParams({
            module: "productions",
            ...(id ? { productionId: id, tab } : {}),
          });
          navigateWorkspace(`/?${next}`);
        }}
      />
    ) : activeModule === "calendar" ? (
      <CalendarModule focusedLeaveId={leaveId} />
    ) : activeModule === "tasks" ? (
      <TasksModule />
    ) : activeModule === "time" ? (
      <TimeModule />
    ) : activeModule === "chat" ? (
      <ChatModule
        conversationId={params.get("conversationId") || ""}
        productionId={params.get("productionId") || ""}
        focusedMessageId={params.get("messageId") || ""}
        onNavigate={(conversationId, productionId) => {
          const query = new URLSearchParams({
            module: "chat",
            ...(conversationId ? { conversationId } : productionId ? { productionId } : {}),
          });
          navigateWorkspace(`/?${query}`);
        }}
      />
    ) : activeModule === "people" ? (
      <PeopleModule />
    ) : activeModule === "actors" ? (
      <ActorsModule />
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
    ) : activeModule === "help" ? (
      <HelpModule
        key={params.get("guide") || "default"}
        initialGuide={params.get("guide") || undefined}
        navigate={navigate}
        onStartTour={() => setTourRequested(true)}
      />
    ) : activeModule === "exports" ? (
      <ExportsModule />
    ) : (
      <SettingsModule navigate={navigate} />
    );
  return (
    <div className="workspace">
      <ProfileAccent />
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
            if (
              event.button !== 0 ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey
            )
              return;
            event.preventDefault();
            navigate("today");
          }}
        >
          <BrandMark />
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
                    aria-label={item.label}
                    aria-description={
                      item.id === "chat" && chatUnread
                        ? `${chatUnread} ungelesene Nachrichten`
                        : undefined
                    }
                  >
                    <item.icon size={18} strokeWidth={1.7} />
                    <span>{item.label}</span>
                    {item.id === "chat" && chatUnread > 0 && (
                      <span className="chat-unread-count" aria-hidden="true">
                        {chatUnread > 99 ? "99+" : chatUnread}
                      </span>
                    )}
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
      <div
        className={`workspace-content${activeModule === "chat" ? ` ${chatStyles.mobileShell}` : ""}`}
        inert={isMobile && mobileMenu}
      >
        <header className="topbar">
          <div className="breadcrumbs">
            {navigationReturn() && !recordId && (
              <button
                className="icon-button"
                onClick={() => returnToContext("/")}
                title="Zur vorherigen Ansicht"
                aria-label="Zur vorherigen Ansicht"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <button
              className="icon-button mobile-menu-button"
              onClick={(event) => openMenu(event.currentTarget)}
              aria-label="Menü öffnen"
              aria-haspopup="dialog"
              aria-expanded={mobileMenu}
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
              onClick={() => {
                setNotificationSnapshot({
                  items: unread,
                  knownIds: new Set(workspace.records.notifications.map((item) => item.id)),
                });
                if (unread.length && online)
                  void action("notifications-read", undefined, {
                    ids: unread.map((item) => item.id),
                  }).catch((error) =>
                    notify(error instanceof Error ? error.message : "Aktion fehlgeschlagen"),
                  );
              }}
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
          {missingTarget && (
            <p className="empty-inline" role="status">
              Dieser Eintrag ist nicht verfügbar.
            </p>
          )}
          {screen}
        </main>
        <footer className="workspace-footer">
          <span>DigitalMask · Gemeinsam hinter der Bühne.</span>
          <LiveStatus recovery />
          <AppInstall onOpenHelp={() => navigate("/?module=help&guide=app-install")} />
        </footer>
      </div>
      <nav className="bottom-nav" inert={isMobile && mobileMenu} aria-label="Mobile Navigation">
        {[
          ["today", "Heute", Home],
          ["calendar", "Kalender", CalendarDays],
          ["productions", "Stücke", Theater],
          ["time", "Zeit", Clock3],
          ["chat", "Chat", MessageSquare],
          ["more", "Mehr", Menu],
        ].map(([key, label, Icon]) => {
          const Component = Icon as LucideIcon;
          return (
            <button
              key={String(key)}
              className={
                activeModule === key ||
                (key === "more" &&
                  !["today", "calendar", "productions", "time", "chat"].includes(activeModule))
                  ? "active"
                  : ""
              }
              aria-current={activeModule === key ? "page" : undefined}
              aria-haspopup={key === "more" ? "dialog" : undefined}
              aria-expanded={key === "more" ? mobileMenu : undefined}
              aria-label={key === "chat" ? "Kommunikation" : String(label)}
              aria-description={
                key === "chat" && chatUnread ? `${chatUnread} ungelesene Nachrichten` : undefined
              }
              onClick={(event) =>
                key === "more" ? openMenu(event.currentTarget) : navigate(String(key))
              }
            >
              <Component size={20} />
              {key === "chat" && chatUnread > 0 && (
                <span className="chat-unread-count" aria-hidden="true">
                  {chatUnread > 99 ? "99+" : chatUnread}
                </span>
              )}
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
      {searchOpen && <WorkspaceSearch onClose={() => setSearchOpen(false)} navigate={navigate} />}
      {notificationSnapshot && (
        <Modal title="Mitteilungen" onClose={() => setNotificationSnapshot(null)}>
          <MarkAllReadButton />
          {notificationItems.length ? (
            <div className="list">
              {notificationItems.map((item) => (
                <NotificationRow
                  key={item.id}
                  notice={item}
                  navigate={navigate}
                  onOpen={() => setNotificationSnapshot(null)}
                />
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
      {(tourRequested || needsTour) && (
        <OnboardingTour
          navigate={navigate}
          onDone={() => {
            setTourRequested(false);
            // Wait for the dialog to leave the native top layer before restoring focus.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => main.current?.focus({ preventScroll: true })),
            );
          }}
        />
      )}
      {(detail || queryRecord) && (
        <RecordDetail
          key={(detail || queryRecord)!.id}
          record={(detail || queryRecord)!}
          onClose={closeDetail}
          onNavigate={() => setDetail(null)}
        />
      )}
    </div>
  );
}
