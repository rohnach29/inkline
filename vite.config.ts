import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/inkline/" : "/",
  build: { target: "es2020" },
});
