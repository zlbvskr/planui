/** Disposable production-mode benchmark. Never used by the application build. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  base: "/",
  plugins: [
    {
      name: "memory-performance-fixture",
      enforce: "pre",
      transform(source, id) {
        if (id.endsWith("/src/storage/db.ts"))
          return source.replace(
            "return new IndexedDbStorageEngine(dbName);",
            'return globalThis.__planuiUiFixtureEngine ??= new InMemoryTransactionalEngine("planui-ui-fixture");',
          );
        if (id.endsWith("/src/main.tsx"))
          return (
            `import {createStorageEngine} from './storage/db';import {seedUiFixture} from './test/ui-fixture';await seedUiFixture(createStorageEngine(),'filled','dark');\n` +
            source
          );
        if (id.endsWith("/src/test/ui-fixture.ts"))
          return source.replace(
            "// Tiny local PNG;",
            `snapshot.events=[];snapshot.tasks=[];snapshot.reservations=[];
      for(let d=-2;d<=2;d++)for(let i=0;i<60;i++){
        const date=new Date(Date.UTC(2026,10,5+d)).toISOString().slice(0,10);
        const start=String(Math.floor(i*24/60)).padStart(2,'0')+':'+String((i*24)%60).padStart(2,'0');
        const e=event('stress-'+d+'-'+i,'Подія '+i,'personal','dayoff',date,start,start);
        if(e.schedule.kind==='timed')e.schedule.interval.endInstant=new Date(Date.parse(e.schedule.interval.startInstant)+20*60000).toISOString();snapshot.events.push(e);
      }
      // Tiny local PNG;`,
          );
      },
    },
    react(),
    tailwind(),
  ],
  build: {
    outDir: "/tmp/planui-stage1-perf-dist",
    emptyOutDir: true,
    target: "esnext",
  },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1", port: 3050, strictPort: true },
});
