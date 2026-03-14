#!/usr/bin/env node

/**
 * generate-updater-manifest.mjs
 *
 * Generates a Tauri v2 updater manifest (latest.json) from AppImage build
 * outputs. The manifest tells the in-app updater where to download the
 * latest release and how to verify its signature.
 *
 * Usage:
 *   node scripts/generate-updater-manifest.mjs --help
 *   node scripts/generate-updater-manifest.mjs \
 *     --artifacts-dir target/release/bundle/appimage \
 *     --output latest.json \
 *     --notes "Bug fixes and performance improvements"
 *
 * The script:
 * 1. Reads the app version from src-tauri/tauri.conf.json
 * 2. Finds the AppImage and .sig file in the artifacts directory
 * 3. Reads the signature from the .sig file
 * 4. Generates the updater manifest JSON with download URL and signature
 *
 * The manifest format follows the Tauri v2 updater specification:
 * https://v2.tauri.app/plugin/updater/
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const HELP_TEXT = `
generate-updater-manifest.mjs — Generate Tauri v2 updater manifest from AppImage build outputs

USAGE:
  node scripts/generate-updater-manifest.mjs [OPTIONS]

OPTIONS:
  --artifacts-dir <path>   Directory containing AppImage and .sig files
                           (default: src-tauri/target/release/bundle/appimage)
  --output <path>          Output path for the manifest JSON
                           (default: latest.json)
  --base-url <url>         Base URL for download links
                           (default: https://github.com/xenialinuxmanager/releases/latest/download)
  --notes <text>           Release notes text to include in the manifest
                           (default: empty string)
  --version <semver>       Override version (default: read from tauri.conf.json)
  --pub-date <iso8601>     Override publication date (default: current UTC time)
  --dry-run                Print manifest to stdout without writing file
  --help                   Show this help text

EXAMPLES:
  # Generate from default build output
  node scripts/generate-updater-manifest.mjs

  # Generate with custom artifacts directory and release notes
  node scripts/generate-updater-manifest.mjs \\
    --artifacts-dir ./release-artifacts \\
    --notes "Fixed save import crash on large archives"

  # Dry-run to preview manifest content
  node scripts/generate-updater-manifest.mjs --dry-run

  # Override version for CI builds
  node scripts/generate-updater-manifest.mjs --version 1.0.0 \\
    --base-url https://github.com/myorg/myrepo/releases/download/v1.0.0

OUTPUT FORMAT:
  The generated manifest follows the Tauri v2 updater specification:
  {
    "version": "0.1.0",
    "notes": "Release notes here",
    "pub_date": "2026-01-01T00:00:00Z",
    "platforms": {
      "linux-x86_64": {
        "signature": "<base64 signature from .sig file>",
        "url": "https://example.com/app_0.1.0_amd64.AppImage.tar.gz"
      }
    }
  }
`.trim();

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    artifactsDir: "src-tauri/target/release/bundle/appimage",
    output: "latest.json",
    baseUrl:
      "https://github.com/xenialinuxmanager/releases/latest/download",
    notes: "",
    version: null,
    pubDate: null,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--artifacts-dir":
        opts.artifactsDir = args[++i];
        break;
      case "--output":
        opts.output = args[++i];
        break;
      case "--base-url":
        opts.baseUrl = args[++i];
        break;
      case "--notes":
        opts.notes = args[++i];
        break;
      case "--version":
        opts.version = args[++i];
        break;
      case "--pub-date":
        opts.pubDate = args[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        console.error('Run with --help for usage information.');
        process.exit(1);
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Version reading
// ---------------------------------------------------------------------------

function readVersionFromConfig() {
  const configPath = resolve("src-tauri/tauri.conf.json");
  if (!existsSync(configPath)) {
    throw new Error(
      `tauri.conf.json not found at ${configPath}. ` +
        "Run this script from the project root or use --version to override."
    );
  }
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  const version = config.version;
  if (!version) {
    throw new Error(
      "No 'version' field found in tauri.conf.json. " +
        "Use --version to specify manually."
    );
  }
  return version;
}

// ---------------------------------------------------------------------------
// Artifact discovery
// ---------------------------------------------------------------------------

/**
 * Find AppImage artifacts in the given directory.
 *
 * Tauri v2 generates:
 * - *.AppImage (the executable)
 * - *.AppImage.tar.gz (the compressed archive for updater)
 * - *.AppImage.tar.gz.sig (the signature file)
 *
 * Returns an object with paths to each artifact found.
 */
function discoverArtifacts(artifactsDir) {
  const absDir = resolve(artifactsDir);

  if (!existsSync(absDir)) {
    return {
      dir: absDir,
      found: false,
      appimage: null,
      tarball: null,
      signature: null,
      sigContent: null,
    };
  }

  const files = readdirSync(absDir);

  const appimage = files.find(
    (f) => f.endsWith(".AppImage") && !f.endsWith(".tar.gz")
  );
  const tarball = files.find((f) => f.endsWith(".AppImage.tar.gz"));
  const sigFile = files.find((f) => f.endsWith(".AppImage.tar.gz.sig"));

  let sigContent = null;
  if (sigFile) {
    sigContent = readFileSync(join(absDir, sigFile), "utf-8").trim();
  }

  return {
    dir: absDir,
    found: !!(appimage || tarball),
    appimage: appimage ? join(absDir, appimage) : null,
    tarball: tarball ? join(absDir, tarball) : null,
    signature: sigFile ? join(absDir, sigFile) : null,
    sigContent,
    tarballName: tarball || null,
  };
}

// ---------------------------------------------------------------------------
// Manifest generation
// ---------------------------------------------------------------------------

function generateManifest(opts) {
  const version = opts.version || readVersionFromConfig();
  const pubDate = opts.pubDate || new Date().toISOString();

  const artifacts = discoverArtifacts(opts.artifactsDir);

  // Build the platform entry
  const platformKey = "linux-x86_64";
  const platform = {};

  if (artifacts.found && artifacts.sigContent) {
    // Use the actual signature from the build output
    platform.signature = artifacts.sigContent;
  } else {
    // Placeholder signature for manifest structure validation
    platform.signature = "";
  }

  if (artifacts.tarballName) {
    // Use the actual tarball filename in the download URL
    const filename = basename(artifacts.tarballName);
    platform.url = `${opts.baseUrl}/${filename}`;
  } else {
    // Construct expected filename from product name and version
    const productName = "xenia-manager-for-linux";
    const filename = `${productName}_${version}_amd64.AppImage.tar.gz`;
    platform.url = `${opts.baseUrl}/${filename}`;
  }

  const manifest = {
    version,
    notes: opts.notes,
    pub_date: pubDate,
    platforms: {
      [platformKey]: platform,
    },
  };

  return { manifest, artifacts, version };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const { manifest, artifacts, version } = generateManifest(opts);
  const json = JSON.stringify(manifest, null, 2);

  if (opts.dryRun) {
    console.log("--- Updater Manifest (dry run) ---");
    console.log(json);
    console.log("---");
    console.log(`Version: ${version}`);
    console.log(`Artifacts dir: ${artifacts.dir}`);
    console.log(`Artifacts found: ${artifacts.found}`);
    if (artifacts.appimage) {
      console.log(`AppImage: ${artifacts.appimage}`);
    }
    if (artifacts.tarball) {
      console.log(`Tarball: ${artifacts.tarball}`);
    }
    if (artifacts.signature) {
      console.log(`Signature: ${artifacts.signature}`);
    }
    if (!artifacts.found) {
      console.log(
        "\nNote: No build artifacts found. Run 'npm run tauri build -- --bundles appimage' first."
      );
      console.log(
        "The manifest was generated with placeholder values for structural validation."
      );
    }
    if (!artifacts.sigContent) {
      console.log(
        "\nNote: No signature file found. The manifest contains an empty signature."
      );
      console.log(
        "Generate signing keys and rebuild to produce signed artifacts."
      );
    }
    process.exit(0);
  }

  // Write the manifest
  const outputPath = resolve(opts.output);
  writeFileSync(outputPath, json + "\n", "utf-8");

  console.log(`Updater manifest written to: ${outputPath}`);
  console.log(`Version: ${version}`);

  if (!artifacts.found) {
    console.warn(
      "\nWarning: No build artifacts found in " + artifacts.dir
    );
    console.warn(
      "Run 'npm run tauri build -- --bundles appimage' to generate artifacts."
    );
    console.warn(
      "The manifest was generated with placeholder values."
    );
  }

  if (!artifacts.sigContent) {
    console.warn(
      "\nWarning: No signature file found. The manifest contains an empty signature."
    );
    console.warn(
      "Generate signing keys and rebuild to produce signed updater artifacts."
    );
  }
}

main();
