# Code Quality Tools

## Prettier

**Auto-formatting** for consistent code style.

**Configuration**: [.prettierrc](../.prettierrc)

```bash
yarn format        # Format all files
yarn format:check  # Check formatting without writing
```

**Settings**:

- Single quotes
- Semicolons enabled
- 2 spaces indentation
- 100 characters line width
- Tailwind CSS class sorting

## ESLint

**Linting** for catching errors and enforcing best practices.

```bash
yarn lint  # Run linter
```

## Husky + lint-staged

**Git hooks** that automatically run on commit.

**Pre-commit hook runs**:

1. **Prettier** - Auto-formats staged files
2. **ESLint** - Fixes linting issues automatically
3. **Vitest** - Runs tests related to changed files

**Configuration**: [package.json](../package.json) `lint-staged` section

## Tips

- **Write tests** as you code - they'll run automatically on commit
- **Let Prettier format** your code - don't fight the formatter
- **Fix ESLint warnings** - they prevent bad practices
- **Don't skip hooks** - they ensure code quality
