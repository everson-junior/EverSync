---
title: "Sidebar Module Workflow"
lastUpdated: 2026-08-18
---

# Sidebar Module Workflow

EverSync uses one Git repository with three official branches: the Basic application, continuous
module sources, and the governed release line.

| Ref                     | Responsibility                                                              |
| ----------------------- | --------------------------------------------------------------------------- |
| `Basic`                 | Host runtime, installer, cache, integrity checks, and dynamic route loading |
| `modules/main`          | Continuous source and build pipeline for sidebar modules                    |
| `release/vX.Y.Z`        | Governed integration and stabilization line for one release                 |
| `vX.Y.Z` tag            | Immutable source marker for the released version                            |
| `vX.Y.Z` GitHub Release | Canonical downloadable module assets and checksums                          |

The local maintainer layout keeps only two active checkouts:

```text
Refatorar/
|-- EverSync/                 # Basic
`-- .worktrees/modules-main/ # modules/main
```

Use `git worktree list` before moving or removing a checkout. Remove registered worktrees with
`git worktree remove <path>`; do not delete their directories directly. The release branch does
not need a permanent local checkout.

Module sources live under `src/modules/` on `modules/main`. Generate release output through the
module build scripts and treat `plugin-bundles/` as disposable output on continuous branches.
Never edit generated bundles manually or commit them to `Basic` or `modules/main`. Published
bundles belong to the matching GitHub Release; the tag records the immutable source version.

Before publishing module source changes, run the focused module tests, build all strict sources
into a disposable directory, and verify the generated manifest. Publish verified binaries to the
matching GitHub Release, then create the immutable `vX.Y.Z` tag from the governed release commit.
