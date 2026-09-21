# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-21

### Added

- `--min-completeness <0-100>` for using the CLI as a CI quality gate. The
  report is still written, and the command exits with code `1` when overall
  completeness is below the required percent.
- `--max-duplicate-rows <count>` for failing a CI job when exact duplicate rows
  exceed the allowed count.

## [0.1.0] - 2026-09-15

### Added

- `parseCsv` and `detectDelimiter`: a quote-aware reader for comma, semicolon,
  tab and pipe separated files, with an option to skip detection or keep
  surrounding whitespace.
- `analyzeCsv` and `analyzeDataset`: row and column counts, blank cells, exact
  duplicate rows, completeness, and a per-column profile with type, fill count
  and distinct values.
- `toCsvReport` and `toJsonReport` for saving the result, plus
  `reportFileName` for naming the saved file.
- A `csv-quality` command-line tool with `--json`, `--out` and `--save`.
- ESM and CommonJS builds with TypeScript declarations, and no runtime
  dependencies.

### Fixed

- `--save` writes the generated report beside the input file, including when
  the input path points to another directory.
- The clean step uses Node's file system API so the build works consistently
  on Windows, macOS and Linux.

[0.2.0]: https://github.com/vugarbbakhishov-hub/csv-quality/releases/tag/v0.2.0
