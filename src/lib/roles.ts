import type { Role } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  CompanyAdmin: "Company Admin",
  CEO: "CEO",
  SVP: "SVP",
  VP: "VP",
  AVP: "AVP",
  ProjectManager: "Project Manager",
  Employee: "Employee",
};

export const ALL_ROLES: Role[] = [
  "CompanyAdmin",
  "CEO",
  "SVP",
  "VP",
  "AVP",
  "ProjectManager",
  "Employee",
];

export type FeatureKey =
  | "overview"
  | "accounts"
  | "projects"
  | "resources"
  | "users"
  | "permissions"
  | "billing"
  | "status"
  | "leaves"
  | "reports"
  | "gts_report"
  | "agent"
  | "settings"
  | "workboard"
  | "quality"
  | "backlog"
  | "edit_delivery"
  | "manage_users"
  | "run_agent"
  | "edit_settings";

export type FeatureDef = {
  key: FeatureKey;
  label: string;
  description: string;
  kind: "menu" | "action";
  href?: string;
};

/** Catalog of features that can be shown/hidden per role */
export const FEATURE_CATALOG: FeatureDef[] = [
  { key: "overview", label: "Overview", description: "Company matrix dashboard", kind: "menu", href: "/dashboard" },
  { key: "accounts", label: "Accounts", description: "Client accounts", kind: "menu", href: "/dashboard/accounts" },
  { key: "projects", label: "Projects", description: "Projects & assignments", kind: "menu", href: "/dashboard/projects" },
  {
    key: "backlog",
    label: "Epic / Story / Task",
    description: "Add, update, delete epics, stories, tasks and assign resources",
    kind: "menu",
    href: "/dashboard/backlog",
  },
  { key: "resources", label: "Resources", description: "People / employee master", kind: "menu", href: "/dashboard/resources" },
  { key: "users", label: "Users & roles", description: "Assign roles to users", kind: "menu", href: "/dashboard/users" },
  {
    key: "permissions",
    label: "Feature access",
    description: "Show/hide features per role",
    kind: "menu",
    href: "/dashboard/permissions",
  },
  { key: "billing", label: "Billing", description: "Monthly billing matrix", kind: "menu", href: "/dashboard/billing" },
  {
    key: "workboard",
    label: "Work breakdown",
    description: "Epic/feature/story/task views by project or resource and period",
    kind: "menu",
    href: "/dashboard/workboard",
  },
  {
    key: "quality",
    label: "Quality / RCA",
    description: "Defect RCA and detailed review sheets",
    kind: "menu",
    href: "/dashboard/quality",
  },
  { key: "status", label: "Daily status", description: "Status submission compliance", kind: "menu", href: "/dashboard/status" },
  { key: "leaves", label: "Leaves", description: "Leaves & extra working days", kind: "menu", href: "/dashboard/leaves" },
  { key: "reports", label: "Weekly reports", description: "Weekly packs", kind: "menu", href: "/dashboard/reports" },
  {
    key: "gts_report",
    label: "GTS Report",
    description: "Month-wise GTS effort, defects, and utilization by sub-project",
    kind: "menu",
    href: "/dashboard/gts-report",
  },
  { key: "agent", label: "AI agent", description: "Run status chase / jobs", kind: "menu", href: "/dashboard/agent" },
  { key: "settings", label: "Settings", description: "Company window settings", kind: "menu", href: "/dashboard/settings" },
  {
    key: "edit_delivery",
    label: "Edit delivery data",
    description: "Create/update accounts, projects, resources, leaves, SDLC",
    kind: "action",
  },
  {
    key: "manage_users",
    label: "Manage users",
    description: "Create users and change roles",
    kind: "action",
  },
  {
    key: "run_agent",
    label: "Run agent jobs",
    description: "Open/close status window, deadlines, weekly packs",
    kind: "action",
  },
  {
    key: "edit_settings",
    label: "Edit settings",
    description: "Change company configuration",
    kind: "action",
  },
];

const almostAllMenus: FeatureKey[] = [
  "overview",
  "accounts",
  "projects",
  "backlog",
  "resources",
  "billing",
  "workboard",
  "quality",
  "status",
  "leaves",
  "reports",
  "gts_report",
  "edit_delivery",
];

/** Default show/hide matrix (used until company customizes) */
export const DEFAULT_FEATURE_MATRIX: Record<Role, FeatureKey[]> = {
  CompanyAdmin: FEATURE_CATALOG.map((f) => f.key),
  CEO: [
    ...almostAllMenus,
    "users",
    "permissions",
    "agent",
    "settings",
    "manage_users",
    "run_agent",
    "edit_settings",
  ],
  SVP: [
    ...almostAllMenus,
    "users",
    "permissions",
    "agent",
    "manage_users",
    "run_agent",
  ],
  VP: [...almostAllMenus],
  AVP: [...almostAllMenus],
  ProjectManager: [...almostAllMenus, "agent", "run_agent"],
  Employee: ["overview", "projects", "backlog", "workboard", "status"],
};

/** @deprecated use hasFeature — kept for sync helpers */
export function canAccessNav(role: Role, key: FeatureKey): boolean {
  return (DEFAULT_FEATURE_MATRIX[role] ?? []).includes(key);
}

export function canEditDelivery(role: Role): boolean {
  return (DEFAULT_FEATURE_MATRIX[role] ?? []).includes("edit_delivery");
}

export function canManageUsers(role: Role): boolean {
  return (DEFAULT_FEATURE_MATRIX[role] ?? []).includes("manage_users");
}

export function canRunAgent(role: Role): boolean {
  return (DEFAULT_FEATURE_MATRIX[role] ?? []).includes("run_agent");
}

export function canEditSettings(role: Role): boolean {
  return (DEFAULT_FEATURE_MATRIX[role] ?? []).includes("edit_settings");
}

/** Map legacy role strings from older installs */
export function migrateLegacyRole(role: string): Role {
  switch (role) {
    case "DeliveryHead":
      return "SVP";
    case "AccountManager":
      return "VP";
    case "ProjectLead":
      return "ProjectManager";
    case "Resource":
    case "Viewer":
      return "Employee";
    case "CompanyAdmin":
    case "CEO":
    case "SVP":
    case "VP":
    case "AVP":
    case "ProjectManager":
    case "Employee":
      return role as Role;
    default:
      return "Employee";
  }
}

/** Roles that receive day-to-day project status / miss / deadline emails */
export const PROJECT_ALERT_ROLES: Role[] = ["ProjectManager", "AVP", "VP"];

export const LEADERSHIP_ROLES: Role[] = ["CEO", "SVP", "VP", "CompanyAdmin"];
export const AGENT_OPERATOR_ROLES: Role[] = ["CompanyAdmin", "CEO", "SVP", "ProjectManager"];
export const USER_ADMIN_ROLES: Role[] = ["CompanyAdmin", "CEO", "SVP"];
export const SETTINGS_ROLES: Role[] = ["CompanyAdmin", "CEO"];
export const DELIVERY_EDITOR_ROLES: Role[] = [
  "CompanyAdmin",
  "CEO",
  "SVP",
  "VP",
  "AVP",
  "ProjectManager",
];

/** @deprecated alias */
export type NavKey = FeatureKey;
