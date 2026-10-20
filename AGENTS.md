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

When the user says **Deploy**, treat that as a request to complete the whole production deployment—not merely build locally, push GitHub, or report that the NAS is ready. Keep the user updated while progressing through the NAS steps below, and report success only after the running NAS services and health endpoint have been checked. If blocked, investigate safe alternatives before stopping. Stage only the files intended for that deployment; leave unrelated local changes untouched.

## NAS deployment

- NAS host: `192.168.1.117`
- SSH user: `admin`
- Project directory: `/share/Container/familyhub/LunamHub`
- Production is deployed by pulling from GitHub on the NAS.

Deployment procedure:

1. Run relevant local typechecks/tests/builds, validate `docker-compose.yml`, and confirm the production images build. Review and show the exact diff; stage only the approved files.
2. Fetch GitHub and confirm the deployment commit is on `origin/main` (never force-push).
3. Connect using `ssh admin@192.168.1.117`. If SSH fails before connecting because a local SSH config file has bad permissions, retry with `ssh -F /dev/null ...` to bypass that config; don't mistake a client-config failure for a NAS outage.
4. In `/share/Container/familyhub/LunamHub`, confirm `git status --short` is empty before pulling. Stop if the NAS has working-tree changes. Preserve its existing `.env` file; don't print or copy it.
5. QNAP Container Station may not put Docker on the non-interactive SSH `PATH`. Check `command -v docker` first. On this NAS the working CLI is `/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker` and it includes Compose v2.29.1. If the command is missing, check `/share/CACHEDEV*/.qpkg/container-station/bin/docker` and verify with `docker --version` and `docker compose version`; do not install or alter the NAS Docker setup. For subsequent remote commands, prepend the discovered Container Station `bin` directory to `PATH` (for this NAS: `PATH=/share/CACHEDEV1_DATA/.qpkg/container-station/bin:$PATH`).
6. Run these commands from the NAS project directory, stopping on any failure:
   - `git fetch origin`
   - `git switch main`
   - `git pull --ff-only origin main`
   - `docker compose build`
   - `docker compose up -d`
   - `docker compose ps`
7. Confirm containers are running/healthy. Check the API from inside its container without exposing secrets, for example: `docker compose exec -T api node -e 'fetch("http://127.0.0.1:8080/api/healthz").then(async r => { console.log("healthz", r.status, await r.text()); if (!r.ok) process.exitCode = 1; }).catch(e => { console.error(e.message); process.exitCode = 1; })'`.
8. Review a bounded recent tail of API, web, and database logs (for example `docker compose logs --since=10m --tail=40 api web db`); report relevant errors, but don't expose secrets or unnecessary household data. If configured, verify the public site returns HTTP 200.
9. In the final update, give the deployed commit, container/health status, and any warnings. If a command fails or a container is unhealthy, stop before claiming success and report the blocker.

## Deployment safety

- Never display, copy, or modify NAS secrets.
- Never run `docker compose down -v`.
- Never delete or recreate database or photo volumes.
- Never overwrite NAS working-tree changes.
- Stop and report any failed command or unhealthy container.
- Ask for approval before committing, pushing, merging, or deploying to the NAS.
