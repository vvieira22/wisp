When publishing a GitHub release for tag `v*`, paste the output of:

```bash
npm run compat:release-notes
```

into the release description (above or below your changelog). Update [`compat.json`](../compat.json) whenever you bump `@cursor/sdk`, Electron, or re-smoke-test against new `agy` / `opencode` CLIs.
