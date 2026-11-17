import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the API runs on :8000 (uvicorn); the built app is served by the API itself.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: { chunkSizeWarningLimit: 900 },
});
