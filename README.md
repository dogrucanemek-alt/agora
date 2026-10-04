# Agora by openforallofus

Search for MCP servers, ranked by what was measured instead of what was voted.

Live at **https://openforallofus.com**. Agents can use it directly as an MCP server at `https://openforallofus.com/api/mcp`.

## What it does

- Reads every entry in the [official MCP registry](https://registry.modelcontextprotocol.io).
- Checks each server that runs as a remote Streamable HTTP endpoint: one MCP handshake and one `tools/list`, nothing else. No tool is ever called.
- Reads GitHub signals for linked repositories: stars, last push, licence, archived, missing.
- Accepts **signed reports**: "this server works / is broken / is unsafe", backed by a signed decision record in the open [Cedulon](https://www.npmjs.com/package/@cedulon/core) format. Signed reports outrank everything measured here.
- Publishes the measurements as open data (`/data/servers.csv`, CC BY 4.0).

Every number on the site is derived from the data files at build time; no page carries a hand-typed count.

## Layout

```
scripts/katalog.mjs      read the official MCP registry          -> data/katalog.json
scripts/github.mjs       repository signals (GitHub GraphQL)     -> data/github.json
scripts/probe.mjs        handshake + tools/list per remote server -> data/probe.json
scripts/build-index.mjs  join, flag, derive counts               -> data/index.json, data/facts.json
web/                     Next.js site, MCP endpoint, REST API
tests/                   report verification, claim guard, count consistency
```

`data/` is not in git; rebuild it with the scripts.

## Run it

```sh
npm install && npm --prefix web install
npm run catalog                                   # ~6 min
node scripts/github.mjs                           # needs a logged-in GitHub CLI
UV_THREADPOOL_SIZE=64 node scripts/probe.mjs --fresh && UV_THREADPOOL_SIZE=64 node scripts/probe.mjs --retry
node scripts/build-index.mjs
npm test
npm run dev                                       # http://localhost:3000
```

`UV_THREADPOOL_SIZE` matters: Node resolves DNS on a four-thread pool by default, and thousands of dead domains starve it until live servers start timing out.

## The check, and how to opt out

The probe sends `agora-probe/0.1 (+https://openforallofus.com/probe)`, holds at most one connection per host, and gives each server 12 seconds. To stop the check against your endpoint or correct your page, open an issue or write to the address on [/method](https://openforallofus.com/method#opt-out).

## Licence

Code: Apache-2.0 (see `LICENSE`). Measurements published on the site: CC BY 4.0. Registry descriptions belong to their publishers.
