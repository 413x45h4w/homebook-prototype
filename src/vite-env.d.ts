/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
