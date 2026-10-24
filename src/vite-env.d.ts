/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "register" bundles the private register from data/private; anything else ships the fictional showcase only */
  readonly VITE_DATASET?: "register" | "showcase";
}

declare module "@register" {
  const value: unknown;
  export default value;
}
