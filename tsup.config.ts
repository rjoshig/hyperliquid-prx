import { defineConfig } from 'tsup';

export default defineConfig([
    // Main build
    {
        entry: ['src/index.ts'],
        format: ['cjs', 'esm'],
        dts: true,
        clean: true,
        sourcemap: true,
        platform: 'node',
        minify: true,
        target: 'node16',

    },
    // Browser build
    // {
    //     entry: ['src/browser.ts'],
    //     format: ['iife'],
    //     globalName: 'HyperliquidSDK',
    //     platform: 'browser',
    //     target: 'es2020',
    //     minify: true,
    //     sourcemap: true,
    //     clean: false,
    //     outDir: 'dist',
    //     name: 'browser',
    //     external: ['http', 'https', 'tls', 'net'],
    // }
]); 