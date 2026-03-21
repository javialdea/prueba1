/*
 * Copyright (c) 2026 Javier Aldea
 * Todos los derechos reservados.
 * Este software es propiedad de Javier Aldea - Aldea Mas Innovación y Periodismo.
 * Queda prohibida su reproducción, distribución o uso sin autorización expresa.
 */
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: 'localhost',
    },
    base: '/',
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
