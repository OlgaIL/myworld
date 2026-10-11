// Preload BEFORE app imports. Never read server/.env or connect a configured production DB.
globalThis.__myworldEnvLoaded = true;
process.env.DATABASE_URL = "";
process.env.DATABASE_SSL = "false";
for (const name of ["OPENAI_API_KEY", "YANDEX_API_KEY", "YANDEX_FOLDER_ID", "TIMEWEB_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLIENT_SECRET", "YANDEX_CLIENT_SECRET"]) process.env[name] = "";
process.env.DOTENV_CONFIG_QUIET = "true";
process.env.GOOGLE_CLOUD_PROJECT = "synthetic-local-tests";
process.env.GCE_METADATA_HOST = "127.0.0.1:9";
