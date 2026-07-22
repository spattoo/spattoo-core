import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, allowedHosts: ['.localhost'] },  // pin 5173; accept <slug>.localhost subdomains
  root: isDev ? 'dev' : undefined,
  // Load .env files from the project root, not from `root` (dev/). Without this, Vite's envDir
  // defaults to `root` = dev/, so the project-root .env.local (VITE_TURNSTILE_SITE_KEY) never
  // reaches the harness and the captcha widget renders with no site key.
  envDir: __dirname,
  build: isDev ? undefined : {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'SpattooDesigner',
      fileName: 'spattoo-designer',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@react-three/fiber',
        '@react-three/drei',
        'three',
        '@supabase/supabase-js',
        'react-colorful',
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'ReactJSXRuntime',
          '@react-three/fiber': 'ReactThreeFiber',
          '@react-three/drei': 'Drei',
          three: 'THREE',
          '@supabase/supabase-js': 'Supabase',
          'react-colorful': 'ReactColorful',
        },
      },
    },
  },
});
