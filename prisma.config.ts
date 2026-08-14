// Prisma CLI configuration (migrations, db push, etc.).
// Loads the direct (non-pooled) Neon connection string.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
});
