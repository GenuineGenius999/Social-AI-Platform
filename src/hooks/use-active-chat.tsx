import { createContext, useContext, useState, type ReactNode } from "react";

export type ActiveChatState = {
  tab: "global" | "groups" | "dm" | null;
  dmUserId: string | null;
  groupId: string | null;
};

type Ctx = { state: ActiveChatState; setState: (s: ActiveChatState) => void };

const ActiveChatCtx = createContext<Ctx>({
  state: { tab: null, dmUserId: null, groupId: null },
  setState: () => {},
});

export function ActiveChatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ActiveChatState>({ tab: null, dmUserId: null, groupId: null });
  return <ActiveChatCtx.Provider value={{ state, setState }}>{children}</ActiveChatCtx.Provider>;
}

export function useActiveChat() {
  return useContext(ActiveChatCtx).state;
}

export function useSetActiveChat() {
  return useContext(ActiveChatCtx).setState;
}
