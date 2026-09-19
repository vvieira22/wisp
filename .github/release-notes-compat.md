When publishing a GitHub release, the CI/CD pipeline runs `npm run release:notes` automatically to combine your [`CHANGELOG.md`](../CHANGELOG.md), provider diffs, and tested stack.

To preview or generate the full release notes locally:

```bash
npm run release:notes
```

Or for just the raw compatibility table:

```bash
npm run compat:release-notes
```

Update [`compat.json`](../compat.json) whenever you bump `@cursor/sdk`, Electron, or re-smoke-test against new `agy` / `opencode` CLIs.
