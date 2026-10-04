"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Theater,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { ids, value } from "@/shared/client-api";
import { canManageRecord } from "@/shared/record-permissions";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, Empty, ErrorMessage, Modal, PageHeader } from "../ui";
import { ChatChannel } from "@/modules/chat/components/chat-channel";
import { ConversationEditor } from "@/modules/chat/components/conversation-editor";
import { chatUnreadCounts } from "@/modules/notifications/unread";
import { chatChoiceKey, unreadFirstChoices, type ChatChoice } from "@/modules/chat/channel-order";
import { ChannelGroup } from "@/modules/chat/components/channel-group";
import { useCollapsedPreference } from "@/shared/use-collapsed-preference";
import styles from "@/modules/chat/components/chat-viewport.module.css";

function ChannelChoice({
  title,
  detail,
  icon: Icon,
  selected,
  kind,
  unread = 0,
  onSelect,
}: {
  title: string;
  detail: string;
  icon: LucideIcon;
  selected: boolean;
  kind: "team" | "production" | "direct" | "group";
  unread?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`channel-choice kind-${kind}${selected ? " active" : ""}`}
      aria-current={selected ? "page" : undefined}
      aria-label={
        unread
          ? `${title} · ${detail} · ${unread} ungelesene ${unread === 1 ? "Nachricht" : "Nachrichten"}`
          : undefined
      }
      onClick={onSelect}
    >
      <span className="channel-choice-icon">
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="channel-choice-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {unread > 0 && (
        <span className="chat-unread-count" aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      {selected && <ChevronRight size={15} className="channel-choice-current" aria-hidden="true" />}
    </button>
  );
}

export function conversationTitle(
  record: DomainRecord,
  members: { id: string; name: string }[],
  self: string,
) {
  return (
    value(record.data, "title") ||
    ids(record.data, "participantIds")
      .filter((id) => id !== self)
      .map((id) => members.find((person) => person.id === id)?.name || "Ehemaliges Teammitglied")
      .join(", ") ||
    "Privater Chat"
  );
}
export function ChatModule({
  productionId = "",
  conversationId = "",
  onNavigate,
}: {
  productionId?: string;
  conversationId?: string;
  onNavigate?: (conversationId: string, productionId?: string) => void;
}) {
  const { workspace, save, remove, busy } = useWorkspace();
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = viewport.current;
    if (!panel) return;
    const visual = window.visualViewport;
    const resize = () => {
      // Safari's keyboard resizes the visual viewport, independently of the page.
      const height = visual?.height || window.innerHeight;
      const navigation = document.querySelector<HTMLElement>(".bottom-nav");
      const navigationHeight = navigation?.getBoundingClientRect().height || 0;
      const bottomGap = navigationHeight ? navigationHeight + 16 : 24;
      const top = Math.min(
        Math.max(0, panel.getBoundingClientRect().top + window.scrollY),
        height * 0.4,
      );
      const available = Math.min(
        760,
        Math.max(280, height - top - bottomGap),
        Math.max(220, height - bottomGap),
      );
      panel.style.setProperty("--chat-available-height", `${Math.round(available)}px`);
      panel.dataset.chatCompact = String(height < 560);
    };
    resize();
    window.addEventListener("resize", resize);
    visual?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      visual?.removeEventListener("resize", resize);
    };
  }, []);
  const unread = chatUnreadCounts(workspace.records.notifications, workspace.user.id);
  const sidebarId = useId();
  const sidebarKey = `digitalmask:chat-sidebar:${workspace.user.id}`;
  const [collapsed, setCollapsed] = useCollapsedPreference(sidebarKey);
  const toggleSidebar = () => setCollapsed(!collapsed);
  const [selection, setSelection] = useState({ conversationId, productionId });
  const channelToggle = useRef<HTMLButtonElement>(null);
  const [channelsOpen, setChannelsOpen] = useState(false),
    [search, setSearch] = useState("");
  const [editor, setEditor] = useState<DomainRecord | "new" | "new-team" | null>(null),
    [manage, setManage] = useState(false),
    [archived, setArchived] = useState(false),
    [error, setError] = useState("");
  const locked = !!productionId && !onNavigate;
  const selectedConversation = onNavigate ? conversationId : selection.conversationId,
    selectedProduction = locked ? productionId : onNavigate ? productionId : selection.productionId;
  const selectedUnread = selectedConversation
    ? unread.conversations[selectedConversation] || 0
    : selectedProduction
      ? unread.productions[selectedProduction] || 0
      : unread.general;
  const otherUnread = Math.max(0, unread.total - selectedUnread);
  const visibleConversations = (workspace.records.conversations || []).filter(
    (record) =>
      record.data.mode === "team" || ids(record.data, "participantIds").includes(workspace.user.id),
  );
  const conversation = visibleConversations.find((record) => record.id === selectedConversation);
  const query = search.trim().toLocaleLowerCase("de");
  const matches = (text: string) => !query || text.toLocaleLowerCase("de").includes(query);
  const productions = workspace.records.productions.filter(
    (record) => record.data.status !== "archived",
  );
  const matchingProductions = productions.filter((record) => matches(value(record.data, "title")));
  const channels = visibleConversations.filter(
    (record) => archived || record.data.archived !== true,
  );
  const teamChannels = channels.filter((record) => record.data.mode === "team");
  const matchingTeamChannels = teamChannels.filter((record) =>
    matches(value(record.data, "title")),
  );
  const privateChats = channels.filter((record) => record.data.mode !== "team");
  const matchingChats = privateChats.filter((record) =>
    matches(
      [
        conversationTitle(record, workspace.members, workspace.user.id),
        ...ids(record.data, "participantIds").map(
          (id) => workspace.members.find((member) => member.id === id)?.name || "",
        ),
      ].join(" "),
    ),
  );
  const showGeneral = matches("Maske · Allgemein Teamkanal");
  const choices: ChatChoice[] = [
    ...(showGeneral
      ? [
          {
            key: "general",
            title: "Maske · Allgemein",
            detail: "Für das ganze Maskenteam",
            kind: "team" as const,
            conversationId: "",
            productionId: "",
            unread: unread.general,
          },
        ]
      : []),
    ...matchingTeamChannels.map((record): ChatChoice => ({
      key: chatChoiceKey(record.id),
      title: value(record.data, "title"),
      detail: record.data.archived === true ? "Archiviert · Teamkanal" : "Für das ganze Maskenteam",
      kind: "team",
      conversationId: record.id,
      productionId: "",
      unread: unread.conversations[record.id] || 0,
    })),
    ...matchingProductions.map((record): ChatChoice => ({
      key: chatChoiceKey("", record.id),
      title: value(record.data, "title"),
      detail: "Absprachen zum Stück",
      kind: "production",
      conversationId: "",
      productionId: record.id,
      unread: unread.productions[record.id] || 0,
    })),
    ...matchingChats.map((record): ChatChoice => ({
      key: chatChoiceKey(record.id),
      title: conversationTitle(record, workspace.members, workspace.user.id),
      detail:
        record.data.archived === true
          ? "Archiviert · privat"
          : record.data.mode === "direct"
            ? "Persönliches Gespräch · privat"
            : `${ids(record.data, "participantIds").length} Teilnehmende · privat`,
      kind: record.data.mode === "direct" ? "direct" : "group",
      conversationId: record.id,
      productionId: "",
      unread: unread.conversations[record.id] || 0,
    })),
  ];
  const ordered = unreadFirstChoices(
    choices,
    workspace.records.messages,
    workspace.records.notifications,
    workspace.user.id,
  );
  const icons = { team: Hash, production: Theater, direct: MessageCircle, group: Users };
  const renderChoice = (choice: ChatChoice) => (
    <ChannelChoice
      key={choice.key}
      title={choice.title}
      detail={choice.detail}
      icon={icons[choice.kind]}
      kind={choice.kind}
      unread={choice.unread}
      selected={
        selectedConversation === choice.conversationId &&
        (!choice.conversationId ? selectedProduction === choice.productionId : true)
      }
      onSelect={() => choose(choice.conversationId, choice.productionId)}
    />
  );
  const title = conversation
    ? conversationTitle(conversation, workspace.members, workspace.user.id)
    : selectedProduction
      ? value(
          workspace.records.productions.find((record) => record.id === selectedProduction)?.data ||
            {},
          "title",
        )
      : "Maske · Allgemein";
  const choose = (id: string, project = "") => {
    if (channelsOpen) channelToggle.current?.focus();
    setChannelsOpen(false);
    setManage(false);
    setError("");
    if (onNavigate) onNavigate(id, project);
    else setSelection({ conversationId: id, productionId: project });
  };
  const update = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Aktion fehlgeschlagen");
    }
  };
  const sidebarToggle = !locked && (
    <button
      type="button"
      className="button ghost chat-desktop-sidebar-toggle"
      aria-label={`${collapsed ? "Kanalauswahl öffnen" : "Kanalauswahl einklappen"}${collapsed && unread.total ? ` · ${unread.total} ungelesene ${unread.total === 1 ? "Nachricht" : "Nachrichten"}` : ""}`}
      title={collapsed ? "Kanalauswahl öffnen" : "Kanalauswahl einklappen"}
      aria-expanded={!collapsed}
      aria-controls={sidebarId}
      onClick={toggleSidebar}
    >
      {collapsed ? (
        <PanelLeftOpen size={20} aria-hidden="true" />
      ) : (
        <PanelLeftClose size={20} aria-hidden="true" />
      )}
      <span className="visually-hidden">Kanalauswahl</span>
      {collapsed && unread.total > 0 && (
        <span className="chat-unread-count" aria-hidden="true">
          {unread.total > 99 ? "99+" : unread.total}
        </span>
      )}
    </button>
  );
  return (
    <>
      <PageHeader
        eyebrow="KURZE WEGE. GUTE ABSPRACHEN."
        title={locked ? "Projektchat" : "Kommunikation"}
        description={
          locked
            ? "Alles zum Stück an einem gemeinsamen Ort."
            : "Allgemeine Informationen, Projektkanäle und private Gespräche."
        }
      >
        {!locked && workspace.user.role !== "user" && (
          <Button onClick={() => setEditor("new-team")}>
            <Plus size={16} />
            Teamkanal
          </Button>
        )}
        {!locked && (
          <Button variant="primary" onClick={() => setEditor("new")}>
            <Plus size={16} />
            Privater Chat
          </Button>
        )}
      </PageHeader>
      <div
        ref={viewport}
        className={
          locked
            ? `chat-layout single-channel ${styles.viewport}`
            : `chat-layout ${styles.viewport}${collapsed ? " channels-collapsed" : ""}`
        }
      >
        {!locked && (
          <aside
            id={sidebarId}
            className={`chat-channels${channelsOpen ? " is-open" : ""}`}
            aria-label="Chats auswählen"
          >
            <div className="chat-channels-heading">
              <strong>Deine Kanäle</strong>
              <span>{1 + productions.length + channels.length}</span>
            </div>
            <button
              type="button"
              className="chat-channel-toggle"
              ref={channelToggle}
              aria-expanded={channelsOpen}
              aria-controls="chat-channel-navigation"
              aria-label={
                otherUnread
                  ? `${title || "Kanal auswählen"} · Kanal wechseln · ${otherUnread} ungelesene ${otherUnread === 1 ? "Nachricht" : "Nachrichten"} in anderen Kanälen`
                  : undefined
              }
              onClick={() => setChannelsOpen(!channelsOpen)}
            >
              <span>
                <small>Kanal wechseln</small>
                <strong>{title || "Kanal auswählen"}</strong>
              </span>
              {otherUnread > 0 && (
                <span className="chat-unread-count" aria-hidden="true">
                  {otherUnread > 99 ? "99+" : otherUnread}
                </span>
              )}
              <ChevronDown size={20} aria-hidden="true" />
            </button>
            <div className="chat-channel-lists" id="chat-channel-navigation">
              <div className="chat-channel-search">
                <Search size={16} aria-hidden="true" />
                <label className="visually-hidden" htmlFor="channel-search">
                  Kanäle und Personen suchen
                </label>
                <input
                  id="channel-search"
                  type="search"
                  value={search}
                  placeholder="Kanal oder Person suchen"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <nav aria-label="Kommunikationskanäle">
                {ordered.unread.length > 0 && (
                  <ChannelGroup
                    label="Ungelesen"
                    count={ordered.unread.length}
                    storageKey={`digitalmask:chat-group:${workspace.user.id}:unread`}
                    query={query}
                  >
                    {ordered.unread.map(renderChoice)}
                  </ChannelGroup>
                )}
                {(
                  [
                    ["team", "Team"],
                    ["production", "Produktionen"],
                    ["direct", "Direktnachrichten"],
                    ["group", "Gruppen"],
                  ] as const
                ).map(([kind, label]) => {
                  const group = ordered.ordinary.filter((choice) => choice.kind === kind);
                  if (!group.length) return null;
                  return (
                    <ChannelGroup
                      key={kind}
                      label={label}
                      count={group.length}
                      storageKey={`digitalmask:chat-group:${workspace.user.id}:${kind}`}
                      defaultCollapsed={kind === "production"}
                      query={query}
                    >
                      {group.map(renderChoice)}
                    </ChannelGroup>
                  );
                })}
              </nav>
              {query &&
                !showGeneral &&
                !matchingTeamChannels.length &&
                !matchingProductions.length &&
                !matchingChats.length && (
                  <p className="channel-empty">
                    Kein passender Kanal. Probiere einen anderen Namen.
                  </p>
                )}
              {!query && !privateChats.length && (
                <div className="channel-private-note">
                  <MessageCircle size={17} aria-hidden="true" />
                  <p>
                    Ein Gespräch nur für euch?
                    <br />
                    <button type="button" className="text-button" onClick={() => setEditor("new")}>
                      Privaten Chat starten
                    </button>
                  </p>
                </div>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(event) => setArchived(event.target.checked)}
                />
                Archivierte einblenden
              </label>
            </div>
          </aside>
        )}
        {selectedConversation && !conversation ? (
          <section className="chat-unavailable">
            {sidebarToggle}
            <Empty
              title="Dieser Chat ist nicht verfügbar."
              description="Wähle einen anderen Chat aus deinen freigegebenen Gesprächen."
            />
          </section>
        ) : (
          <ChatChannel
            key={selectedConversation || `production:${selectedProduction}`}
            title={title}
            productionId={selectedProduction}
            conversation={conversation}
            sidebarToggle={sidebarToggle}
            onManage={
              conversation && canManageRecord(workspace.user, "conversations", conversation)
                ? () => setManage(true)
                : undefined
            }
          />
        )}
      </div>
      {manage && conversation && (
        <Modal
          title={
            conversation.data.mode === "team" ? "Teamkanal verwalten" : "Privaten Chat verwalten"
          }
          onClose={() => setManage(false)}
        >
          <p className="help-note">
            {conversation.data.mode === "team"
              ? "Das gesamte Maskenteam kann den Verlauf und die Dateien sehen. Admins verwalten diesen Kanal."
              : "Nur die Teilnehmenden können den Verlauf und Dateien sehen. Entfernte Personen verlieren den Zugriff."}
          </p>
          <h3>{title}</h3>
          <p>
            {conversation.data.mode === "team"
              ? "Alle aktiven Teammitglieder"
              : ids(conversation.data, "participantIds")
                  .map(
                    (id) =>
                      workspace.members.find((person) => person.id === id)?.name ||
                      "Ehemaliges Teammitglied",
                  )
                  .join(", ")}
          </p>
          {conversation.data.archived === true && <Badge>Archiviert</Badge>}
          <ErrorMessage message={error} />
          <footer className="dialog-footer">
            <Button
              disabled={busy}
              onClick={() => {
                setManage(false);
                setEditor(conversation);
              }}
            >
              Bearbeiten
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void update(async () => {
                  await save(
                    "conversations",
                    { archived: conversation.data.archived !== true },
                    conversation,
                  );
                  setManage(false);
                })
              }
            >
              {conversation.data.archived === true ? "Chat wieder öffnen" : "Archivieren"}
            </Button>
            <Button
              variant="danger-ghost"
              disabled={busy}
              onClick={() => {
                if (confirm("Leeren Chat löschen? Chats mit Nachrichten können archiviert werden."))
                  void update(async () => {
                    await remove(conversation);
                    choose("");
                  });
              }}
            >
              Löschen
            </Button>
          </footer>
        </Modal>
      )}
      {editor && (
        <ConversationEditor
          record={typeof editor === "string" ? undefined : editor}
          initialMode={editor === "new-team" ? "team" : "direct"}
          onClose={() => setEditor(null)}
          onSaved={(record) => choose(record.id)}
        />
      )}
    </>
  );
}
