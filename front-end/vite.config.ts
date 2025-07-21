import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    include: [
        "echarts-for-react", 
        "echarts", 
        "@massalabs/massa-web3",
        "@massalabs/wallet-provider"
    ],
    esbuildOptions: { 
      target: "es2020"
    }  
  },

  build: {
    target: "es2020",                       
    outDir: "dist",
    sourcemap: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: [],
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          massa: ['@massalabs/massa-web3', '@massalabs/wallet-provider'],
          charts: ['echarts', 'echarts-for-react']
        }
      }
    }
  },

  define: { 
    "process.env": {},
    global: "globalThis"
  },
  
  server: { 
    port: 3000, 
    open: true 
  },

  preview: {
    port: 3000
  }
});