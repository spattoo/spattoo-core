import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: [react()],
  server: {
    /* ⚠️ 5190, NOT 5173 — the web app took 5173 and `strictPort` turns that into a hard failure, so
       `npm run dev` in this repo simply stopped working and everyone passed `--port` by hand instead.
       A default nobody can use is a default that lies. Kept strict on purpose: silently landing on a
       different port is how a harness ends up being judged in one tab while a stale build serves
       another. `allowedHosts` accepts <slug>.localhost subdomains. */
    port: 5190, strictPort: true, allowedHosts: ['.localhost'],
    /* ⚠️ THE CDN, PROXIED, SO A HARNESS IS LIT BY THE REAL FILES. A dev harness cannot fetch the
       assets CDN directly — its CORS allowlist holds the app's ports, not the harness's, and a WebGL
       texture load with no `access-control-allow-origin` fails. `SafeEnvironment` then swallows the
       failure and falls back to a drei preset, silently, so the harness renders a DIFFERENT
       ENVIRONMENT from the one every customer sees.
       That is not hypothetical: three parameter sweeps were run, reported and written into the docs
       against drei's `apartment` before anyone noticed the shipped map is an outdoor sky. Proxying
       makes the request same-origin, so there is no CORS to satisfy and no fallback to hide it.
       Preferred over keeping local copies (which go stale) or widening the CDN allowlist (which is a
       production config change to serve a dev need). */
    proxy: {
      '/cdn': {
        target: 'https://dev.spattoocdn.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cdn/, ''),
      },
    },
  },
  root: isDev ? 'dev' : undefined,
  // Load .env files from the project root, not from `root` (dev/). Without this, Vite's envDir
  // defaults to `root` = dev/, so the project-root .env.local (VITE_TURNSTILE_SITE_KEY) never
  // reaches the harness and the captcha widget renders with no site key.
  envDir: __dirname,
  publicDir: resolve(__dirname, 'public'),  // brand assets (favicons, manifest) live at the repo root, not under dev/
  build: isDev ? undefined : {
    copyPublicDir: false,                   // dist is the library bundle; consuming apps copy public/ themselves
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
