$ErrorActionPreference = "Stop"

$codeRoot = "c:\engenharia\EverSync"
$excludedDirectories = @(
  ".git",
  ".next",
  ".build",
  ".claude",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "tests",
  "vendor",
  "workspace"
)
$sourceExtensions = @(".c", ".cc", ".cpp", ".cs", ".go", ".java", ".js", ".jsx", ".mjs", ".py", ".rb", ".rs", ".sh", ".ts", ".tsx")
$historicalLearningsPath = Join-Path $codeRoot "workspace\historical_learnings.jsonl"
$historicalLearnings = if (Test-Path $historicalLearningsPath) {
  Get-Content -Raw $historicalLearningsPath
} else {
  ""
}

function Get-SourceDirectories([string] $path) {
  $directories = Get-ChildItem -LiteralPath $path -Directory -Force |
    Where-Object { $excludedDirectories -notcontains $_.Name }

  foreach ($directory in $directories) {
    Get-SourceDirectories $directory.FullName
  }

  $hasSourceFiles = Get-ChildItem -LiteralPath $path -File -Force |
    Where-Object { $sourceExtensions -contains $_.Extension } |
    Select-Object -First 1
  if ($hasSourceFiles) {
    $path
  }
}

foreach ($directory in Get-SourceDirectories $codeRoot) {
  $files = Get-ChildItem -LiteralPath $directory -File -Force |
    Where-Object { $sourceExtensions -contains $_.Extension }
  $childSummaries = Get-ChildItem -LiteralPath $directory -Directory -Force |
    Where-Object { $excludedDirectories -notcontains $_.Name } |
    ForEach-Object { Join-Path $_.FullName "mantis-summary.md" } |
    Where-Object { Test-Path $_ }

  $fileNames = ($files | ForEach-Object Name) -join ", "
  $keywords = ($files | Get-Content -ErrorAction SilentlyContinue | Select-String -Pattern "auth|token|secret|password|fetch|http|request|response|sql|sqlite|exec|spawn|parse|crypto|encrypt|decrypt|zod" -CaseSensitive:$false | Select-Object -First 30 | ForEach-Object Line) -join "`n"
  $history = if ($historicalLearnings -and $historicalLearnings.Contains($directory.Replace($codeRoot + "\", ""))) {
    "Relevant historical learnings mention this directory. Review workspace/historical_learnings.jsonl before modifying it."
  } else {
    "No directory-specific historical learnings were available."
  }
  $childSummaryNames = ($childSummaries | ForEach-Object { Split-Path (Split-Path $_ -Parent) -Leaf }) -join ", "

  @"
# Mantis Security Summary

## Scope

Directory: `$($directory.Replace($codeRoot + "\", ""))`

## Core Components

Local source files: $fileNames

Immediate child directories with generated summaries: $childSummaryNames

## Trust Boundaries and Sensitive Operations

The following locally observed security-relevant code indicators should guide deeper review:

```
$keywords
```

Review request parsing, authentication and authorization, secrets handling, database access, external network calls, process execution, serialization, and error propagation in the listed files.

## Historical Context

$history
"@ | Set-Content -LiteralPath (Join-Path $directory "mantis-summary.md") -Encoding utf8
}