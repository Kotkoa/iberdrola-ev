# Claude AI Documentation

This directory contains detailed coding instructions for AI assistants working on this project.

## File Structure

All documentation files are organized in a flat structure for easy maintenance:

```
.claude/
├── README.md                    # This file
├── data-flow.md                 # Database schema, real-time subscriptions
├── search-feature.md            # Two-stage loading, CORS proxy
├── pwa-notifications.md         # Push notifications setup
├── error-handling.md            # ErrorBoundary, common gotchas
├── typescript-rules.md          # TypeScript strict mode rules
├── component-conventions.md     # React patterns, styling
├── code-quality.md              # Prettier, ESLint, Husky
├── testing.md                   # Vitest setup and patterns
├── workflow.md                  # Daily workflow, build commands
└── mcp-servers.md               # MCP servers configuration
```

## Usage

Each file contains specific rules and conventions for a particular aspect of development. Files are self-contained and can be updated independently.

## Maintenance

- Keep each file focused on a single topic
- Use relative paths for file references (e.g., `../src/App.tsx`)
- Update files when architecture or conventions change
- Duplicate information is acceptable if it improves clarity
