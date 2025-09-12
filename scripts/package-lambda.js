#!/usr/bin/env node

/**
 * Smart Lambda packaging script
 * Creates optimized zip by excluding unnecessary files
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("📦 Smart Lambda packaging...");

// Files and directories to exclude (patterns)
const excludePatterns = [
  // Test files
  "*.test.js",
  "*/test/*",
  "*/tests/*",
  "*/spec/*",
  "*/specs/*",

  // Documentation
  "*/docs/*",
  "*/doc/*",
  "*/example/*",
  "*/examples/*",
  "*.md",
  "*/README*",
  "*/CHANGELOG*",
  "*/HISTORY*",
  "*/AUTHORS*",
  "*/CONTRIBUTORS*",

  // License and meta files
  "*/LICENSE*",
  "*/LICENCE*",
  "*/COPYING*",
  "*.txt",

  // Development files
  "*.map",
  "*/.git/*",
  "*/.github/*",
  "*/.vscode/*",
  "*/coverage/*",
  "*/.nyc_output/*",

  // TypeScript source files (keep .d.ts)
  "*/lib/esm/*",
  "*/lib/types/*",

  // Puppeteer test files (be specific, don't exclude all src)
  "*/puppeteer-core/src/*",
  "*/chromium-bidi/src/*",
  "*/@puppeteer/browsers/src/*",

  // Unnecessary binaries and assets
  "**/MEIPreload/*",
  "**/ClearKeyCdm/*",
  "**/swiftshader/*",
  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.ico",

  // Platform-specific files we don't need
  "**/prebuilds/darwin-*/*",
  "**/prebuilds/win32-*/*",
  "**/prebuilds/android-*/*",
  "**/prebuilds/ios-*/*",
];

// Create exclude arguments for zip
const excludeArgs = excludePatterns.map((pattern) => `-x "${pattern}"`).join(" ");

try {
  // Remove existing zip
  if (fs.existsSync("function.zip")) {
    fs.unlinkSync("function.zip");
    console.log("🗑️  Removed existing function.zip");
  }

  // Create optimized zip
  const zipCommand = `zip -r function.zip src/ node_modules/ ${excludeArgs}`;

  console.log("🔧 Creating optimized zip...");
  console.log("⏳ This may take a moment...");

  execSync(zipCommand, { stdio: "pipe" }); // Hide zip output

  // Check final size
  const stats = fs.statSync("function.zip");
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const maxSizeMB = 250;

  console.log(`📊 Package size: ${sizeMB}MB`);

  if (stats.size > maxSizeMB * 1024 * 1024) {
    console.log(`⚠️  Warning: Package size (${sizeMB}MB) exceeds Lambda limit (${maxSizeMB}MB)`);
    console.log("💡 Consider using Lambda Layers or Container Images");
  } else {
    console.log(`✅ Package size OK (under ${maxSizeMB}MB limit)`);
  }

  console.log("🎉 Packaging complete!");
} catch (error) {
  console.error(`❌ Packaging failed: ${error.message}`);
  process.exit(1);
}
