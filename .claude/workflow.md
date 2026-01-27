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

**Always run after code changes**:

```bash
npm run check-types
```

Fix all errors before committing.

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
