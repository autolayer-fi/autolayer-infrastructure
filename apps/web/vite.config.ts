import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("stellar-wallets-kit") || id.includes("walletconnect") || id.includes("reown") || id.includes("trezor") || id.includes("ledgerhq")) return "wallets";
          if (id.includes("stellar-sdk") || id.includes("stellar-base")) return "stellar";
          if (id.includes("react")) return "react";
        },
      },
    },
  },
});
