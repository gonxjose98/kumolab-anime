import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests for the pure decision core (no DB / network). Run: `npm test`.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        // Dummy env so modules that build a Supabase client at import time load
        // cleanly. The decision-core functions under test never call Supabase;
        // these values are only there to satisfy the module-load guard.
        env: {
            NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        },
    },
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
});
