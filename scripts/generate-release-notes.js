"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { loadManifest, releaseNotesMarkdown } = require("../src/lib/compat");

const root = path.join(__dirname, "..");

function getPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  return pkg.version || "0.0.1";
}

function extractChangelogSection(version) {
  const changelogPath = path.join(root, "CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) return "";

  const text = fs.readFileSync(changelogPath, "utf8");
  const regex = new RegExp(
    `##\\s*\\[?${version.replace(/\./g, "\\.")}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|\$)`,
    "i"
  );
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function getPreviousCompatManifest() {
  try {
    // Check if there is a previous git tag
    let ref = "";
    try {
      ref = execSync("git describe --tags --abbrev=0", {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // No tags found; try previous commit if available
      try {
        ref = execSync("git rev-parse HEAD~1", {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch {
        return null;
      }
    }

    if (!ref) return null;

    const raw = execSync(`git show ${ref}:compat.json`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function diffProviderVersions(currentManifest, prevManifest) {
  const currentTested = currentManifest.tested || {};
  const prevTested = (prevManifest && prevManifest.tested) || null;

  if (!prevTested) {
    return "- Initial release baseline configured in `compat.json`.";
  }

  const keys = Array.from(new Set([...Object.keys(currentTested), ...Object.keys(prevTested)]));
  const changes = [];

  for (const k of keys) {
    if (k === "wisp") continue; // wisp version is already in title
    const prev = prevTested[k];
    const curr = currentTested[k];
    if (prev && curr && prev !== curr) {
      changes.push(`- **${k}**: \`${prev}\` ➔ \`${curr}\``);
    } else if (!prev && curr) {
      changes.push(`- **${k}**: added \`${curr}\``);
    } else if (prev && !curr) {
      changes.push(`- **${k}**: removed (was \`${prev}\`)`);
    }
  }

  if (changes.length === 0) {
    return "- No provider version changes in this release (all tested stack versions remain consistent).";
  }

  return changes.join("\n");
}

function buildReleaseNotes() {
  const version = getPackageVersion();
  const manifest = loadManifest();
  const prevManifest = getPreviousCompatManifest();

  const changelog = extractChangelogSection(version);
  const providerChanges = diffProviderVersions(manifest, prevManifest);
  const testedStack = releaseNotesMarkdown(manifest);

  const parts = [
    `# Wisp v${version}`,
    "",
    changelog ? `### 📋 Changes\n\n${changelog}` : "### 📋 Changes\n\n- Maintenance and improvements.",
    "",
    "### 🔄 Provider & Component Updates",
    "",
    providerChanges,
    "",
    testedStack,
  ];

  return parts.join("\n");
}

if (require.main === module) {
  const notes = buildReleaseNotes();
  const outPath = process.argv[2];

  if (outPath) {
    const target = path.resolve(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, notes, "utf8");
    console.log(`Release notes written to ${target}`);
  } else {
    process.stdout.write(notes + "\n");
  }
}

module.exports = {
  getPackageVersion,
  extractChangelogSection,
  diffProviderVersions,
  buildReleaseNotes,
};
