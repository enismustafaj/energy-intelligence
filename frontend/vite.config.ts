import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backendOrigin = process.env.HAUSWATT_API_ORIGIN ?? "http://127.0.0.1:18000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backendOrigin,
    },
  },
});
