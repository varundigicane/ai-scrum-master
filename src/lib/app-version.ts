import packageJson from "../../package.json";

/** Product version from package.json (single source of truth for web). */
export const APP_VERSION = packageJson.version;
