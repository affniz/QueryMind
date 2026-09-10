# Contributing to QueryMind

Thank you for your interest in contributing! This document covers everything you need to get up and running.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Code Style](#code-style)
- [Running Tests](#running-tests)

---

## Getting Started

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/QueryMind.git
   cd QueryMind
   ```

2. Set up the backend:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt -r requirements-dev.txt
   ```

3. Set up the frontend:
   ```bash
   cd frontend
   npm install
   ```

4. Copy `.env` and fill in your local values (see [README § Environment variables](./README.md#environment-variables)).

5. Run migrations:
   ```bash
   alembic upgrade head
   ```

---

## Branch Naming

Use the following prefixes:

| Prefix | When to use |
|--------|-------------|
| `feat/` | New feature or endpoint |
| `fix/` | Bug fix |
| `chore/` | Tooling, deps, CI, config changes |
| `docs/` | Documentation only |
| `refactor/` | Code restructure without behaviour change |
| `test/` | Adding or improving tests |

**Examples:**
```
feat/csv-export-api
fix/readonly-url-missing-env
docs/improve-auth-section
chore/upgrade-fastapi
```

---

## Commit Messages

QueryMind follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
```
feat(api): add CSV export endpoint
fix(auth): handle expired token on refresh
docs(readme): add architecture diagram
chore(deps): upgrade fastapi to 0.139
test(ask): add mock LLM multi-table join case
```

- Use the imperative mood in the summary ("add" not "added")
- Keep the summary under 72 characters
- Reference issues in the footer: `Closes #42`

---

## Pull Requests

- Open PRs against the `main` branch
- Fill in the PR template (description, motivation, testing steps)
- Keep PRs focused — one logical change per PR
- Add or update tests for any changed behaviour
- All CI checks must pass before merging
- At least one reviewer approval is required

---

## Code Style

### Python (backend)

- **Formatter:** [`black`](https://black.readthedocs.io/) — run before committing:
  ```bash
  black app/ tests/
  ```
- **Type hints** are expected on all public functions and route handlers
- **Docstrings** are encouraged for non-trivial logic; use Google style

### TypeScript / React (frontend)

- **Linter:** [`oxlint`](https://oxc.rs/docs/guide/usage/linter) — run before committing:
  ```bash
  cd frontend
  npm run lint
  ```
- Follow the existing component patterns (functional components, `React Query` for data fetching, `Tailwind` for styling)
- Avoid any `@ts-ignore` suppressions; fix the underlying type issue instead

---

## Running Tests

Tests use `pytest` + `testcontainers` — a real throwaway PostgreSQL container is spun up automatically. **Docker must be running.**

```bash
# From the project root (venv activated)
pytest -v
```

Individual test files:
```bash
pytest tests/test_auth.py -v
pytest tests/test_datasets.py -v
```

CI runs the same command on every push and pull request to `main` via GitHub Actions.
