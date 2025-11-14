# Changelog

All notable changes to the FASTR Analytics Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.6.13] - 2025-11-14

### Changed

- Enhanced AI chatbot components: improved markdown rendering with dedicated utilities
- Updated AI tool engine for better error handling and type safety

### Fixed

- Updated Anthropic Claude API model identifier to use current naming convention (dashes instead of dots)

### Removed

- DHIS2 documentation files and example scripts (streamlined integration codebase)
- Obsolete MarkdownTextRenderer component in chatbot v2

## [1.6.8] - 2025-11-07

### Major Changes (September 1 - November 7, 2025)

#### Added

- Offline development mode for working without internet connectivity
- Consistent error message system across application
- Drag-and-drop functionality for dashboard element organization
- Code review tracking and security issue documentation

#### Changed

- **Architecture**: Consolidated separate `wb-hmis-client` and `wb-hmis-server` repositories into unified monorepo
- **Frontend**: Migrated from SolidStart to Vite for improved build performance and DX
- **Module System**: Complete redesign of R-based data processing pipeline
- **Visualization**: Upgraded Panther library integration for enhanced chart rendering
- **Data Layer**: Refactored query system for complex health indicator calculations
- **i18n**: Improved translation system architecture (EN/FR)

#### Fixed

- Critical time series data handling issues
- Nigeria administrative area data structure compatibility
- Security vulnerabilities identified in code review
- Query performance bottlenecks in presentation object generation

#### Removed

- Dead code cleanup (1000+ lines)
- Outdated comments and documentation
- Legacy SolidStart dependencies
- Stale refactor planning documents

#### Technical Debt

- Modernized build tooling and deployment pipeline
- Enhanced developer documentation and guidelines
- Improved TypeScript type coverage
- Standardized error handling patterns

---

## Pre-consolidation History

Prior to October 25, 2025, development occurred across two repositories:

- `wb-hmis-client`: SolidJS frontend application
- `wb-hmis-server`: Deno/Hono backend services

These repositories were consolidated into the current monorepo structure.
