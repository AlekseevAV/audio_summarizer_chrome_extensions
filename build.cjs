const esbuild = require("esbuild");
const fs = require("fs");

const isWatch = process.argv.includes("--watch");
const isDev = isWatch || process.argv.includes("--dev");

// Clean dist directory
if (fs.existsSync("dist")) {
  fs.rmSync("dist", { recursive: true });
}
fs.mkdirSync("dist", { recursive: true });

// esbuild options for all entry points
const buildOptions = {
  entryPoints: {
    background: "chrome-extension/background/background.js",
    content: "chrome-extension/content/content.js",
    panel: "chrome-extension/panel/panel.js",
    offscreen: "chrome-extension/offscreen/offscreen.js",
  },
  bundle: true,
  outdir: "dist",
  format: "iife", // IIFE for all scripts
  target: "es2020",
  minify: !isDev,
  sourcemap: "inline", // Always inline sourcemaps for Chrome Extensions
  logLevel: "info",
};

// Copy static files
function copyStatic() {
  const staticFiles = [
    // HTML files
    { from: "chrome-extension/panel/panel.html", to: "dist/panel.html" },
    {
      from: "chrome-extension/offscreen/offscreen.html",
      to: "dist/offscreen.html",
    },
    { from: "chrome-extension/options.html", to: "dist/options.html" },

    // CSS files
    { from: "chrome-extension/panel/panel.css", to: "dist/panel.css" },

    // AudioWorklet processor (must not be bundled)
    {
      from: "chrome-extension/offscreen/pcm-processor.js",
      to: "dist/pcm-processor.js",
    },

    // manifest.json
    { from: "chrome-extension/manifest.json", to: "dist/manifest.json" },
  ];

  // Copy icons directory
  if (fs.existsSync("chrome-extension/icons")) {
    fs.mkdirSync("dist/icons", { recursive: true });
    fs.readdirSync("chrome-extension/icons").forEach((file) => {
      fs.copyFileSync(`chrome-extension/icons/${file}`, `dist/icons/${file}`);
    });
  }

  // Copy options.js if exists (not a module)
  if (fs.existsSync("chrome-extension/options.js")) {
    fs.copyFileSync("chrome-extension/options.js", "dist/options.js");
  }

  // Copy static files
  staticFiles.forEach(({ from, to }) => {
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, to);
      console.log(`📄 Copied: ${from} -> ${to}`);
    }
  });
}

async function build() {
  try {
    console.log(
      `🔨 Building in ${isDev ? "DEVELOPMENT" : "PRODUCTION"} mode...`,
    );

    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      copyStatic();
      console.log("👀 Watching for changes...");

      // Watch for static file changes
      fs.watch(
        "chrome-extension",
        { recursive: true },
        (eventType, filename) => {
          if (
            filename &&
            (filename.endsWith(".html") ||
              filename.endsWith(".css") ||
              filename === "manifest.json")
          ) {
            console.log(`📄 Static file changed: ${filename}`);
            copyStatic();
          }
        },
      );
    } else {
      await esbuild.build(buildOptions);
      copyStatic();
      console.log("✅ Build complete!");
      console.log("📦 Extension ready in dist/ directory");
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

build();
