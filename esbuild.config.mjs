import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const production = process.argv[2] === "production";
const root = process.cwd();
const calendarEventsSource = readFileSync(resolve(root, "scripts/calendar-events.js"), "utf8");

const context = await esbuild.context({
  entryPoints: [resolve(root, "src/main.ts")],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  platform: "node",
  target: "es2020",
  define: {
    __CALENDAR_EVENTS_SCRIPT__: JSON.stringify(calendarEventsSource)
  },
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: resolve(root, "main.js"),
  logLevel: "info"
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
  console.log("Watching for changes...");
}
