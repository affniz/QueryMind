# Changelog

All notable changes to QueryMind are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to project milestones rather than strict semantic releases.

---

## [Unreleased]

---

## [6.0.0] — Chat History & Data Export

### Added
- Persistent chat sessions per dataset and per folder — conversations are saved to the database and can be resumed, renamed, or deleted
- Query results can be exported as CSV or JSON with a customisable filename
- Auto-logout after one hour of inactivity (mouse, keyboard, touch, and scroll activity tracked) — distinct from JWT expiry so active users are never interrupted mid-session

### Changed
- UI layout upgraded to a resizable horizontal split between the chart and table panels
- Folder chat now shows the correct dataset count and resolves folder membership from the server rather than a stale localStorage map

---

## [5.1.0] — Folder Isolation & Config Cleanup

### Added
- Datasets can be organised into folders in the UI
- LLM context is now scoped to only the datasets within the active folder, preventing cross-folder data leakage

### Changed
- `GROQ_MODEL` is fully env-driven with no hardcoded fallback

---

## [5.0.0] — Full-Stack Release

### Added
- React + Vite + TypeScript frontend with a complete UI
- One-click Render deployment via `render.yaml` Blueprint (FastAPI backend, React frontend, PostgreSQL, Redis)
- `GET /health` endpoint for Render health checks
- `setup_readonly.py` for automated read-only user provisioning at container startup

---

## [4.0.0] — Developer Experience & API Completeness

### Added
- `GET /datasets/{id}/preview` endpoint — returns raw data rows via read-only connection
- `/ask` responses now include the raw `results` rows alongside the plain-English answer
- `User` model gains a `created_at` timestamp

### Changed
- All endpoints converted to `async def`; Groq API calls offloaded via `asyncio.to_thread` for non-blocking concurrency
- `GET /datasets/` is now paginated (`skip` / `limit`)
- SQL guard extended to accept `WITH ... AS` CTEs

---

## [3.1.0] — Security Hardening & Performance

### Added
- SQL injection protection via `sqlparse` (SELECT-only allowlist, table allowlist)
- Read-only PostgreSQL role provisioned automatically via Alembic migration
- High-speed CSV ingestion using PostgreSQL `COPY` protocol (~30× faster than row-by-row INSERT)
- Structured logging with specific exception handling throughout

---

## [3.0.0] — Multi-Table Support

### Added
- Users can upload multiple CSVs and define foreign-key relationships between them
- Cross-table JOIN queries supported
- Auto-detect relationships by matching column names across datasets

---

## [2.0.0] — Authentication & Per-User Isolation

### Added
- JWT authentication (register / login)
- Per-user dataset isolation — each user's data is stored in namespaced PostgreSQL tables and inaccessible to other accounts

---

## [1.0.0] — Initial Prototype

### Added
- Single-user, single-table CSV upload with plain-English question answering via Groq
- No authentication, no persistence layer

---

[Unreleased]: https://github.com/affniz/QueryMind/compare/v6.0.0...HEAD
[6.0.0]: https://github.com/affniz/QueryMind/compare/v5.1.0...v6.0.0
[5.1.0]: https://github.com/affniz/QueryMind/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/affniz/QueryMind/compare/v4.0.0...v5.0.0
[4.0.0]: https://github.com/affniz/QueryMind/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/affniz/QueryMind/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/affniz/QueryMind/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/affniz/QueryMind/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/affniz/QueryMind/releases/tag/v1.0.0
