# Iberdrola EV Charger Monitor - AI Coding Instructions

## Project Overview

React + TypeScript PWA for monitoring Iberdrola EV charging stations. Real-time status tracking via Supabase, with push notifications and location-based features.

**Stack**: Vite 7, React 19, TypeScript 5.9, Material-UI 7, Tailwind CSS 4, Supabase

## 📚 Documentation Structure

Detailed instructions are organized in [.claude/](.claude/) directory:

### Architecture

- **[Data Flow](.claude/data-flow.md)** - Supabase schema, real-time subscriptions, data fields
- **[Search Feature](.claude/search-feature.md)** - Two-stage loading, CORS proxy, free/paid filtering

### Features

- **[PWA & Notifications](.claude/pwa-notifications.md)** - Push notifications, service worker setup
- **[Error Handling](.claude/error-handling.md)** - ErrorBoundary, common gotchas

### Development

- **[TypeScript Rules](.claude/typescript-rules.md)** - Strict mode, type checking
- **[Component Conventions](.claude/component-conventions.md)** - React patterns, styling, constants
- **[Code Quality](.claude/code-quality.md)** - Prettier, ESLint, Husky hooks
- **[Testing](.claude/testing.md)** - Vitest setup and patterns
- **[Workflow](.claude/workflow.md)** - Daily workflow, build commands, commit guidelines

### Tools

- **[MCP Servers](.claude/mcp-servers.md)** - MUI, Context7, Chrome DevTools, Supabase, Playwright
- **[E2E Test Plan](.claude/e2e-test-plan.md)** - Playwright MCP test scenarios

## Quick Reference

### Key Files

| File                                                                           | Purpose                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [src/App.tsx](src/App.tsx)                                                     | Main component, orchestrates all features              |
| [api/charger.ts](api/charger.ts)                                               | Supabase data fetching + subscriptions                 |
| [hooks/useStationData.ts](hooks/useStationData.ts)                             | **TTL-based station data loading** (primary station)   |
| [src/hooks/useStationSearch.ts](src/hooks/useStationSearch.ts)                 | **Search with batch cache lookup** (search enrichment) |
| [src/services/stationApi.ts](src/services/stationApi.ts)                       | Supabase cache functions + **TTL-based batch lookup**  |
| [src/services/iberdrola.ts](src/services/iberdrola.ts)                         | Iberdrola API client + **TTL-aware enrichment**        |
| [src/utils/time.ts](src/utils/time.ts)                                         | TTL freshness checking utility                         |
| [src/context/PrimaryStationContext.tsx](src/context/PrimaryStationContext.tsx) | Primary station state management                       |
| [src/constants/index.ts](src/constants/index.ts)                               | All constants, API endpoints                           |
| [types/charger.ts](types/charger.ts)                                           | Core data model + state machine types                  |

### Build Commands

```bash
yarn dev      # Development server (port 5173)
yarn build    # Production build
yarn preview  # Preview production build
yarn lint     # ESLint check
yarn format   # Prettier format
yarn test     # Run tests in watch mode
```

### Essential Rules

1. **TypeScript**: Strict mode, no `any` types
2. **Comments**: Only in English, minimal usage
3. **Chat**: Responses in Russian, code in English
4. **Package manager**: yarn
5. **Always run before committing**:
   - `yarn check-types` - TypeScript validation (REQUIRED)
   - `yarn lint` - ESLint check (REQUIRED)
   - `yarn test:run` - Unit tests (REQUIRED)
   - `yarn lint-staged` - Simulates pre-commit hook (RECOMMENDED)
   - Husky pre-commit hook will auto-run on `git commit`
6. **Data Loading**: Use `useStationData` for station data (TTL-based freshness)
7. **State Management**: Use state machines, not boolean flags
8. **Cache Strategy**: Always use batch cache lookup before enrichment loops
   - Prevents N database queries
   - Use `getStationsFromCache(cpIds, ttlMinutes)` for batch lookup
   - Pass cachedMap to `enrichStationDetails(station, cachedMap)`
