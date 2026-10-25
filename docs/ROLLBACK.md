# Arbitrary-item search rollback

The pushed Git tag `checkpoint/catalog-only-20261025` points to `ad8f570`, the
working catalog-only code before arbitrary-item search. It covers web, desktop
and Pi source. Pi code/protocol is unchanged by this rollout.

Desktop private backups on `raymond@100.121.133.88`:
`/home/raymond/.local/state/ctrlf-arbitrary-items/checkpoint-20261025/`.
This directory contains a verified custom-format `database.dump`, private env
copy, service unit and checkpoint/hash record. Do not copy these into Git.

## Roll back code

Stop local Next.js, then run on this web computer from the repository:

```sh
git fetch origin --tags
git switch --detach checkpoint/catalog-only-20261025
cd web
env -u NODE_OPTIONS node -e 'require("node:module").createRequire(require.resolve("next/package.json"))("@next/env").loadEnvConfig(".."); const env = {...process.env}; delete env.NODE_OPTIONS; require("node:child_process").spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], {stdio: "inherit", env}).on("exit", code => process.exit(code ?? 1))'
```

The web launcher must load the root `.env`; ordinary `pnpm dev` only loads env
files in `web/`. Keep the existing root configuration private.

On the processing desktop, from `/home/raymond/Ctrl-F`:

```sh
git fetch origin --tags
systemctl --user stop ctrlf-worker.service
git switch --detach checkpoint/catalog-only-20261025
systemctl --user start ctrlf-worker.service
systemctl --user is-active ctrlf-worker.service
```

Use the existing `.venv/worker`, `.env`, Postgres and flock-protected user unit.
The rollback changes source only; no migration is needed. New category rows and
sightings are additive and compatible with old code, so they remain in the
catalog after a code rollback. Historical result objects remain readable.

## Full data rollback

Restoring the dump also restores the exact old item list, but discards database
changes since the checkpoint. Stop the worker and web first and take a new backup
before a deliberate restore. Use the existing `ctrlf-desktop-hermes-postgres-1`
Postgres 16 container and configured application database, never the separate test
or unrelated databases. S3 outputs are not included in the SQL dump and must be
reconciled before restarting. Do not restore the database merely to roll back code.

## Return to latest dev

With the appropriate service stopped, use `git switch dev` then
`git pull --ff-only origin dev` and start the same service/launcher.
