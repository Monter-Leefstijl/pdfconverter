CHANGELOG
=========

All notable changes to Monter PDF Converter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## UNRELEASED

### Changed

- Images are now only build and pushed to Docker Hub when a new tag is created.
- Bump `express` dependency from `^4.19.2` to `^4.21.1`.

## [0.1.2] - 2024-10-18

### Fixed

- Ensure stuck LibreOffice processes are killed when the conversion timeout is reached. Previously, a stuck LibreOffice
  process would cause any subsequent requests to that same process to also get stuck, making the instance completely
  unavailable.

## [0.1.1] - 2024-10-18

### Added

- Add identity conversion from PDF to PDF.

### Changed

- Decreased the default maximum number of concurrent jobs from `12` to `6`, as `12` caused major performance issues on 
  some machines.
- Cleaned-up the `package.json` file, which incorrectly set the license to `UNLICENSED`.

## [0.1.0] - 2024-10-11

### Added

- Add the endpoint for converting documents to PDF.
- Add the endpoint to retrieve the health of an instance.

[unreleased]: https://github.com/Monter-Leefstijl/pdfconverter/compare/0.1.2...HEAD
[0.1.2]: https://github.com/Monter-Leefstijl/pdfconverter/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/Monter-Leefstijl/pdfconverter/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/Monter-Leefstijl/pdfconverter/releases/tag/0.1.0