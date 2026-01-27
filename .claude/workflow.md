# Development Workflow

## Daily Workflow

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

## Post-Development Verification

**Always run after code changes** (before committing):

```bash
# 1. Type checking (REQUIRED)
yarn check-types

# 2. Linting (REQUIRED)
yarn lint

# 3. Unit tests (REQUIRED)
yarn test:run

# 4. Husky pre-commit simulation (RECOMMENDED)
# This simulates what will run during git commit
yarn lint-staged
```

Fix all errors before committing.

### Husky Pre-Commit Hook

The pre-commit hook (`husky - pre-commit script`) will automatically run when you commit:

- ✅ `yarn lint-staged` - formats and lints staged files
- ✅ Related tests for changed files
- ❌ Blocks commit if any checks fail

**To manually test pre-commit checks**:

```bash
# Simulate pre-commit (without committing)
yarn lint-staged
```

## Build Commands

```bash
yarn dev      # Development server (port 5173)
yarn build    # Production build
yarn preview  # Preview production build
yarn lint     # ESLint check
yarn format   # Prettier format
```

**Package manager**: yarn

## Code Comments

- **Do not use comments unless absolutely necessary**
- **All code comments must ALWAYS be in English** (TypeScript, JavaScript, JSX, TSX, CSS, etc.)
- Only meaningful comments should be added

## Chat Responses

- **All chat replies in Russian** (natural language responses to user questions)
- **Exception**: Code itself and code comments must always be in English
