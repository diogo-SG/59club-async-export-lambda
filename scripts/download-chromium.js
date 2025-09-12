#!/usr/bin/env node

/**
 * Cross-platform Chromium downloader for AWS Lambda
 * Forces x86_64 Linux download even when building on ARM
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const CHROMIUM_VERSION = "118.0.0";
const DOWNLOAD_HOST = "storage.googleapis.com";

// Force x86_64 Linux platform for Lambda
const TARGET_PLATFORM = "linux";
const TARGET_ARCH = "x64";

console.log("🚀 Cross-platform Chromium downloader for AWS Lambda");
console.log(`📦 Downloading Chromium ${CHROMIUM_VERSION} for ${TARGET_PLATFORM}-${TARGET_ARCH}`);
console.log(`🖥️  Current platform: ${process.platform}-${process.arch}`);

async function downloadChromium() {
  try {
    // Create node_modules/@sparticuz/chromium/bin directory
    const binDir = path.join(__dirname, "../node_modules/@sparticuz/chromium/bin");

    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
      console.log(`📁 Created directory: ${binDir}`);
    }

    // Determine download URL based on target platform
    const downloadUrl = getDownloadUrl(TARGET_PLATFORM, TARGET_ARCH);
    const zipPath = path.join(binDir, "chromium.zip");
    const extractPath = path.join(binDir, "chromium");

    console.log(`⬇️  Downloading from: ${downloadUrl}`);

    // Download the zip file
    await downloadFile(downloadUrl, zipPath);
    console.log(`✅ Downloaded to: ${zipPath}`);

    // Extract the zip file
    console.log(`📦 Extracting...`);

    // Remove existing chromium binary if it exists
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true });
    }

    // Extract using unzip (should work on macOS/Linux)
    try {
      execSync(`cd "${binDir}" && unzip -q chromium.zip`, { stdio: "inherit" });
      console.log(`✅ Extracted successfully`);

      // Remove unnecessary files to reduce size
      const unnecessaryPaths = [
        path.join(binDir, "chrome-linux", "locales"),
        path.join(binDir, "chrome-linux", "MEIPreload"),
        path.join(binDir, "chrome-linux", "ClearKeyCdm"),
        path.join(binDir, "chrome-linux", "swiftshader"),
        path.join(binDir, "chrome-linux", "xdg-settings"),
        path.join(binDir, "chrome-linux", "xdg-mime"),
        path.join(binDir, "chrome-linux", "product_logo_48.png"),
      ];

      unnecessaryPaths.forEach((pathToRemove) => {
        if (fs.existsSync(pathToRemove)) {
          if (fs.statSync(pathToRemove).isDirectory()) {
            fs.rmSync(pathToRemove, { recursive: true });
            console.log(`🗑️  Removed directory: ${path.basename(pathToRemove)}`);
          } else {
            fs.unlinkSync(pathToRemove);
            console.log(`🗑️  Removed file: ${path.basename(pathToRemove)}`);
          }
        }
      });
    } catch (error) {
      console.error(`❌ Extraction failed: ${error.message}`);
      process.exit(1);
    }

    // Clean up zip file
    fs.unlinkSync(zipPath);
    console.log(`🧹 Cleaned up zip file`);

    // Verify the binary exists
    const possiblePaths = [
      path.join(binDir, "chromium"),
      path.join(binDir, "chrome-linux", "chrome"),
      path.join(binDir, "chrome"),
    ];

    let chromiumPath = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        chromiumPath = possiblePath;
        break;
      }
    }

    if (chromiumPath) {
      // Make it executable
      fs.chmodSync(chromiumPath, "755");
      console.log(`✅ Chromium ready at: ${chromiumPath}`);
      console.log(`🎉 Cross-platform build complete!`);
    } else {
      console.error(`❌ Chromium binary not found after extraction`);
      console.log(`🔍 Available files in ${binDir}:`);
      listFilesRecursive(binDir);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

function getDownloadUrl(platform, arch) {
  // @sparticuz/chromium download URLs
  const baseUrl = `https://${DOWNLOAD_HOST}/chromium-browser-snapshots`;

  if (platform === "linux" && arch === "x64") {
    return `${baseUrl}/Linux_x64/1097615/chrome-linux.zip`;
  } else if (platform === "linux" && arch === "arm64") {
    return `${baseUrl}/Linux_ARM/1097615/chrome-linux.zip`;
  } else {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          return downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const totalSize = parseInt(response.headers["content-length"], 10);
        let downloadedSize = 0;
        let lastPercent = 0;

        response.on("data", (chunk) => {
          downloadedSize += chunk.length;
          const percent = Math.floor((downloadedSize / totalSize) * 100);

          if (percent > lastPercent && percent % 10 === 0) {
            console.log(
              `📊 Progress: ${percent}% (${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(
                totalSize / 1024 / 1024
              )}MB)`
            );
            lastPercent = percent;
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log(`📊 Progress: 100% - Download complete!`);
          resolve();
        });

        file.on("error", (err) => {
          fs.unlinkSync(destination);
          reject(err);
        });
      })
      .on("error", reject);
  });
}

function listFilesRecursive(dir, indent = "") {
  const items = fs.readdirSync(dir);
  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    console.log(`${indent}${stats.isDirectory() ? "📁" : "📄"} ${item}`);
    if (stats.isDirectory() && indent.length < 8) {
      // Limit recursion depth
      listFilesRecursive(fullPath, indent + "  ");
    }
  });
}

// Run the download
downloadChromium().catch(console.error);
