import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';

/* ── The help articles, for dev/help-assistant.html ──────────────────────────────────────────────
 *
 * The assistant answers with a help article's own text, and the index those articles live in is a
 * backend table that is not applied anywhere yet. So the harness reads them straight off disk —
 * chunked exactly as spattoo-api's scripts/backfill-help-index.mjs chunks them, so the harness
 * renders what the server will return rather than something written to flatter the renderer.
 *
 * Dev-server only, and silent when spattoo-docs is not checked out beside this repo. */
const HELP_DIR = resolve(__dirname, '..', 'spattoo-docs', 'help');

function helpSectionsPlugin() {
  return {
    name: 'spattoo-help-sections',
    configureServer(server) {
      server.middlewares.use('/__help-sections', (_req, res) => {
        const out = [];
        if (existsSync(HELP_DIR)) {
          for (const file of readdirSync(HELP_DIR).filter(f => f.endsWith('.md'))) {
            const text = readFileSync(resolve(HELP_DIR, file), 'utf8');
            const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
            const meta = {};
            for (const line of (fm?.[1] ?? '').split('\n')) {
              const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
              if (kv) meta[kv[1]] = kv[2].trim();
            }
            // Mirrors the backfill: help articles and the generated FAQ, both named explicitly.
            if (meta.audience !== 'baker' && meta.audience !== 'faq') continue;
            if (meta.status && meta.status !== 'live') continue;
            /* Mirrors spattoo-api scripts/backfill-help-index.mjs: the trailing *"Checked against
               the app on …"* paragraph is a note to US about how the article was verified, and 54
               of the 58 carry one. Indexed, the assistant answered a baker with it. */
            let body = text.slice(fm?.[0].length ?? 0);
            {
              const ls = body.split('\n');
              let end = ls.length; while (end > 0 && !ls[end - 1].trim()) end--;
              let start = end;    while (start > 0 && ls[start - 1].trim()) start--;
              const last = ls.slice(start, end).join(' ').trim();
              if (last.startsWith('*') && /hecked against the app/.test(last)) {
                let cut = start;
                while (cut > 0 && !ls[cut - 1].trim()) cut--;
                if (cut > 0 && ls[cut - 1].trim() === '---') cut--;
                body = ls.slice(0, cut).join('\n');
              }
            }
            let heading = null, buf = [], position = 0;
            const flush = () => {
              const b = buf.join('\n').trim();
              if (b) out.push({ doc_slug: meta.id ?? file.replace(/\.md$/, ''), doc_title: meta.title ?? file,
                                heading, body: b, position: position++, audience: meta.audience ?? null,
                                checked_against_app: meta.checked_against_app ?? null });
              buf = [];
            };
            for (const line of body.split('\n')) {
              if (/^#\s+/.test(line)) continue;
              if (/^##\s+/.test(line)) { flush(); heading = line.replace(/^##\s+/, '').trim(); continue; }
              buf.push(line);
            }
            flush();
          }
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(out));
      });
    },
  };
}

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: [react(), helpSectionsPlugin()],
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
