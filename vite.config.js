import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, allowedHosts: ['.localhost'] },  // accept <slug>.localhost storefront subdomains
  root: isDev ? 'dev' : undefined,
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
