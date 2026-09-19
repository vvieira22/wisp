"use strict";

const { loadManifest, releaseNotesMarkdown } = require("../src/lib/compat");

process.stdout.write(releaseNotesMarkdown(loadManifest()));
