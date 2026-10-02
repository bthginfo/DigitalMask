"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCollapsedPreference } from "@/shared/use-collapsed-preference";

export function ChannelGroup({
  label,
  count,
  storageKey,
  defaultCollapsed = false,
  query = "",
  children,
}: {
  label: string;
  count: number;
  storageKey: string;
  defaultCollapsed?: boolean;
  query?: string;
  children: ReactNode;
}) {
  const id = useId();
  const [preferredCollapsed, setPreferredCollapsed] = useCollapsedPreference(
    storageKey,
    defaultCollapsed,
  );
  const [searchState, setSearchState] = useState({ query: "", collapsed: false });
  // Reveal new search results without changing the user's normal group preference.
  const collapsed = query
    ? searchState.query === query && searchState.collapsed
    : preferredCollapsed;

  return (
    <div className="chat-channel-group">
      <h3>
        <button
          type="button"
          className="chat-channel-group-toggle"
          aria-label={label}
          aria-expanded={!collapsed}
          aria-controls={id}
          onClick={() => {
            if (query) setSearchState({ query, collapsed: !collapsed });
            else setPreferredCollapsed(!collapsed);
          }}
        >
          {collapsed ? (
            <ChevronRight size={15} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
          <span>{label}</span>
          <span className="chat-channel-group-count" aria-hidden="true">
            {count}
          </span>
        </button>
      </h3>
      <div id={id} className="chat-channel-group-items" hidden={collapsed}>
        {children}
      </div>
    </div>
  );
}
