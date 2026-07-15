# LunamHub Repository Instructions

## Project

- Project name: LunamHub
- Local repository: `~/projects/lunamhub`
- GitHub remote: `origin`
- Production branch: `main`

## Local validation

Before committing or pushing:

- Run `pnpm install --frozen-lockfile` when dependencies need validation.
- Run all relevant typechecks and builds.
- Validate the production `docker-compose.yml`.
- Confirm the production Docker images build successfully.
- Never commit `.env` files, credentials, database files, or uploaded photos.

## Git workflow

- Work on a feature branch unless explicitly instructed otherwise.
- Show the diff before committing.
- Stage only intended files.
- Do not force-push.
- Push approved changes to GitHub.
- Do not deploy a branch unless its commit exists on `origin/main`.

## NAS deployment

- NAS host: `192.168.1.117`
- SSH user: `admin`
- Project directory: `/share/Container/familyhub/LunamHub`
- Production is deployed by pulling from GitHub on the NAS.

Deployment procedure:

1. Confirm the approved commit exists on `origin/main`.
2. Connect using `ssh admin@192.168.1.117`.
3. Confirm the NAS working tree is clean.
4. Preserve the existing NAS `.env` file.
5. Run:
   - `git fetch origin`
   - `git switch main`
   - `git pull --ff-only origin main`
   - `docker compose build`
   - `docker compose up -d`
   - `docker compose ps`
6. Check `/api/healthz`.
7. Review recent API, web, and database logs.

## Deployment safety

- Never display, copy, or modify NAS secrets.
- Never run `docker compose down -v`.
- Never delete or recreate database or photo volumes.
- Never overwrite NAS working-tree changes.
- Stop and report any failed command or unhealthy container.
- Ask for approval before committing, pushing, merging, or deploying to the NAS.
