/// <reference types="vite/client" />

/** ISO date (YYYY-MM-DD) of the build, injected by `vite.config.ts`. */
declare const __BUILD_STAMP__: string;

declare module "*.json" {
  const value: unknown;
  export default value;
}

declare module "@derived-catalog" {
  const value: unknown;
  export default value;
}

declare module "@dictionary-index" {
  const value: unknown;
  export default value;
}
