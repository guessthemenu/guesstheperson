# Contributing

## Branch Model

- `main` is the stable branch for deployable changes.
- Create feature work from `creative/<feature-name>`.
- Open pull requests back into `main` when a branch is review-ready.

## Local Setup

1. Run `npm install --legacy-peer-deps` from the repository root.
2. Copy `backend/.env.example` to `backend/.env` and fill in PostgreSQL values.
3. Copy `frontend/.env.example` to `frontend/.env` and point `REACT_APP_API_URL` at the backend.
4. Start the backend with `npm run backend:dev`.
5. Start the frontend with `npm run frontend:dev`.

## Pull Requests

- Keep PRs focused on one feature or fix.
- Run `npm run backend:build` and `npm run frontend:build` before opening a PR.
- If you touch mobile code, run `npm --prefix frontend run cap:sync` before handing off changes.

## Native Prerequisites

- Android builds require a JDK and Android SDK.
- iOS builds require full Xcode, CocoaPods, and `xcode-select` pointed at the Xcode app.