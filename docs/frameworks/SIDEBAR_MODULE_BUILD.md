---
title: "Sidebar Module Build Contract"
version: 3.8.50
lastUpdated: 2026-08-18
---

# Sidebar Module Build Contract

Sidebar module sources live in `src/modules/<module-id>/index.tsx`. A strict entry must
default-export a React component function. The release build wraps that implementation in the
runtime `SidebarPluginEnvelope`; source entries do not construct or export the envelope directly.

The generated envelope factory receives the Basic host object and returns the entry component.
`react`, `react/jsx-runtime`, and `@eversync/plugin-host` imports are rewritten to absolute,
same-origin runtime ESM routes. The browser host initializes those routes with its React, JSX
runtime, and host singletons before importing a plugin. Normal named React exports, including
hooks and top-level `createContext`, therefore work without bundling or loading a second React
instance. Relative imports must resolve within the module directory or
`src/modules/shared`. Node built-ins, private aliases, and all other package dependencies fail the
build, including through transitive source imports. Non-literal dynamic imports are rejected, and
the emitted asset is checked again so no bare or unexpected static import remains.

The `@eversync/plugin-host` source contract exports stable `React`, `fetch`, and `host` bindings,
plus `getHost()`, `getRoute()`, `getLocale()`, `getNavigation()`, and `getPrimitives()`. Route,
locale, navigation, and the concrete host object are runtime values: module source must read them
through a getter when handling or rendering, or access a property on the default `host` proxy.
The adapter intentionally does not export named `route`, `locale`, or `navigation` constants,
because browser native ESM caches the adapter module while Basic reinitializes its global runtime
as navigation changes. Do not capture a getter result in module scope. React remains a singleton
binding so hooks, contexts, and JSX retain Basic's React identity.

`npm run build:sidebar-modules` is the release command and requires every catalog source entry.
`npm run build:sidebar-modules:validation` intentionally emits contract-validation placeholders;
its manifest records `sourceMode: "validation"` and must not be treated as a functional release.

Every manifest records `sourceSha`. The build reads the current Git commit by default. Reproducible
tests and controlled source archives can set `EVERSYNC_SIDEBAR_MODULE_SOURCE_SHA` to a lowercase
40-64 character SHA. Verification checks provenance, catalog metadata, headers, file names, sizes,
checksums, and the complete output file set.

The build writes and verifies a sibling staging directory before promotion. Promotion renames any
existing output to a backup, renames staging into place, and restores the backup if promotion
fails. This keeps the previous output intact on Windows, where replacing a populated directory
with a single rename is not supported.

## GitHub Release publication

`modules/main` is the official release source for sidebar modules. The
`sidebar-modules-release.yml` workflow runs when a GitHub Release is published and also supports a
manual recovery run. The selected tag must point to a commit reachable from `modules/main`, and
its semantic version must match `PLUGIN_RELEASE_VERSION`.

The workflow installs dependencies with pnpm, runs the focused module tests, builds all strict
bundles, verifies `manifest.json`, and uploads every `.mjs` file plus the manifest to the existing
GitHub Release. Re-running the workflow replaces same-name assets with the verified output from
the tagged commit. Versioned `release/vX.Y.Z` branches are historical backups and are not module
publication sources.
