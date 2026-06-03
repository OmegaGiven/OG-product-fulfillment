#!/usr/bin/env node
// Usage: node scripts/release.js [patch|minor|major]
// Reads current version from apps/mobile/app.json, bumps it, tags, and pushes.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: node scripts/release.js [patch|minor|major]");
  process.exit(1);
}

const appJsonPath = path.join(__dirname, "../apps/mobile/app.json");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const [major, minor, patch] = appJson.expo.version.split(".").map(Number);

const next =
  bump === "major" ? `${major + 1}.0.0` :
  bump === "minor" ? `${major}.${minor + 1}.0` :
                     `${major}.${minor}.${patch + 1}`;

const tag = `v${next}`;

// Ensure working tree is clean
try {
  const status = execSync("git status --porcelain").toString().trim();
  if (status) {
    console.error("Working tree is dirty. Commit or stash changes first.");
    process.exit(1);
  }
} catch (e) {
  console.error("git status failed:", e.message);
  process.exit(1);
}

console.log(`Bumping ${appJson.expo.version} → ${next} (tag ${tag})`);

execSync(`git tag ${tag}`, { stdio: "inherit" });
execSync(`git push origin ${tag}`, { stdio: "inherit" });

console.log(`\nTagged and pushed ${tag}. GitHub Actions will build + submit automatically.`);
console.log(`Monitor at: https://expo.dev`);
