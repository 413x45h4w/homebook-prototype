/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __PREVIEW_ID__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
