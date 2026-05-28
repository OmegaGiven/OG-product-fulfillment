export type NavKey =
  | "home"
  | "orders"
  | "history"
  | "workflows"
  | "templates"
  | "integrations"
  | "user";

export type PageAccessLevel = "hidden" | "read" | "action";

export type OrgPosition = {
  id: string;
  name: string;
  description: string;
  pageAccess: Record<NavKey, PageAccessLevel>;
};

export type AccessControlState = {
  isOrgAdmin: boolean;
  activePositionId: string | null;
  personalNavVisibility: Record<NavKey, boolean>;
  positions: OrgPosition[];
};

export const NAV_PAGE_LABELS: Record<NavKey, string> = {
  home: "Home",
  orders: "Orders",
  history: "Fulfillments",
  workflows: "Workflows",
  templates: "Templates",
  integrations: "Integrations",
  user: "User"
};

export const NAV_KEYS: NavKey[] = [
  "home",
  "orders",
  "history",
  "workflows",
  "templates",
  "integrations",
  "user"
];

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}

function buildPageAccess(level: PageAccessLevel) {
  return NAV_KEYS.reduce<Record<NavKey, PageAccessLevel>>((accumulator, key) => {
    accumulator[key] = level;
    return accumulator;
  }, {} as Record<NavKey, PageAccessLevel>);
}

export const defaultAccessControlState: AccessControlState = {
  isOrgAdmin: true,
  activePositionId: "position_owner",
  personalNavVisibility: NAV_KEYS.reduce<Record<NavKey, boolean>>((accumulator, key) => {
    accumulator[key] = true;
    return accumulator;
  }, {} as Record<NavKey, boolean>),
  positions: [
    {
      id: "position_owner",
      name: "Owner",
      description: "Full access to configure workflows, integrations, and users.",
      pageAccess: buildPageAccess("action")
    },
    {
      id: "position_operator",
      name: "Operator",
      description: "Can work fulfillment flows and review orders with limited admin access.",
      pageAccess: {
        ...buildPageAccess("read"),
        home: "action",
        orders: "action",
        history: "action",
        workflows: "read",
        templates: "read",
        integrations: "read",
        user: "read"
      }
    }
  ]
};

export function normalizeAccessControlState(
  state: Partial<AccessControlState> | null | undefined
): AccessControlState {
  const personalNavVisibility = NAV_KEYS.reduce<Record<NavKey, boolean>>((accumulator, key) => {
    accumulator[key] =
      key === "user"
        ? true
        : normalizeBoolean(state?.personalNavVisibility?.[key], true);
    return accumulator;
  }, {} as Record<NavKey, boolean>);

  const positions =
    state?.positions?.map((position) => ({
      id: position.id,
      name: position.name,
      description: position.description ?? "",
      pageAccess: NAV_KEYS.reduce<Record<NavKey, PageAccessLevel>>((accumulator, key) => {
        const nextLevel = position.pageAccess?.[key] ?? "read";
        accumulator[key] = key === "user" && nextLevel === "hidden" ? "read" : nextLevel;
        return accumulator;
      }, {} as Record<NavKey, PageAccessLevel>)
    })) ?? defaultAccessControlState.positions;

  const activePositionId =
    state?.activePositionId && positions.some((position) => position.id === state.activePositionId)
      ? state.activePositionId
      : positions[0]?.id ?? null;

  return {
    isOrgAdmin: normalizeBoolean(state?.isOrgAdmin, defaultAccessControlState.isOrgAdmin),
    activePositionId,
    personalNavVisibility,
    positions
  };
}
