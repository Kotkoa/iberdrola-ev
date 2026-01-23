# Development Guide

## Code Quality Tools

This project uses several tools to ensure code quality and consistency.

### Prettier

**Auto-formatting** for consistent code style across the project.

**Configuration:** [.prettierrc](.prettierrc)

```bash
# Format all files
yarn format

# Check formatting without writing
yarn format:check
```

**Settings:**

- Single quotes
- Semicolons enabled
- 2 spaces indentation
- 100 characters line width
- Tailwind CSS class sorting

### ESLint

**Linting** for catching errors and enforcing best practices.

```bash
# Run linter
yarn lint
```

### Vitest

**Testing framework** for unit and component tests.

```bash
# Run tests in watch mode
yarn test

# Run tests once
yarn test:run

# Run tests with UI
yarn test:ui

# Run tests with coverage
yarn test:coverage
```

See [src/test/README.md](src/test/README.md) for testing guide.

### Husky + lint-staged

**Git hooks** that automatically run on commit.

**Pre-commit hook** runs:

1. **Prettier** - Auto-formats staged files
2. **ESLint** - Fixes linting issues automatically
3. **Vitest** - Runs tests related to changed files

**Configuration:** [package.json](package.json) `lint-staged` section

**How it works:**

When you commit files:

```bash
git add .
git commit -m "Your message"
```

The pre-commit hook will:

- ✅ Format your code with Prettier
- ✅ Fix linting issues with ESLint
- ✅ Run tests for files you modified
- ❌ Block the commit if tests fail

**Skip hooks** (not recommended):

```bash
git commit -m "Your message" --no-verify
```

## Development Workflow

### 1. Make changes

Edit your code as usual.

### 2. Run tests

```bash
yarn test
```

### 3. Commit

```bash
git add .
git commit -m "feat: add new feature"
```

The pre-commit hook will automatically:

- Format your code
- Fix linting issues
- Run related tests

### 4. Push

```bash
git push
```

## Build

```bash
# Development server
yarn dev

# Production build
yarn build

# Preview production build
yarn preview
```

## Tips

- **Write tests** as you code - they'll run automatically on commit
- **Let Prettier format** your code - don't fight the formatter
- **Fix ESLint warnings** - they prevent bad practices
- **Don't skip hooks** - they ensure code quality
