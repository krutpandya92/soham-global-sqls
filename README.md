<div align="center">

# 🗄️ soham-global-sqls

### Multi-engine SQL for the Model Context Protocol

Connect Claude — and any other MCP client — to **SQL Server, MySQL, PostgreSQL, and Oracle**
through a single server. Named connection profiles, audit logging, a SQL safety guard,
and read-only access by default.

[![npm version](https://img.shields.io/npm/v/soham-global-sqls?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/soham-global-sqls)
[![CI](https://img.shields.io/github/actions/workflow/status/krutpandya92/soham-global-sqls/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/krutpandya92/soham-global-sqls/actions/workflows/ci.yml)
[![Node](https://img.shields.io/node/v/soham-global-sqls?style=flat-square&logo=nodedotjs&logoColor=white&color=339933)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/soham-global-sqls?style=flat-square&color=4c1)](./LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/soham-global-sqls?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/soham-global-sqls)

[Quick Start](#-quick-start) · [Installation](#-installation) · [Configuration](#%EF%B8%8F-configuration) · [MCP Clients](#-mcp-client-setup) · [Tools](#-available-tools) · [Security](#%EF%B8%8F-security-model) · [Troubleshooting](#-troubleshooting--faq)

</div>

---

## What is this?

The **Model Context Protocol (MCP)** lets AI assistants like Claude talk to external systems
through small, well-defined tool servers. `soham-global-sqls` is one such server: it exposes
your relational databases to the assistant so you can **explore schemas and run queries in plain
language** — "show me the five newest orders", "what columns does the `customers` table have?" —
without leaving your chat window.

One installed server handles **four database engines at once**. You describe each database once as
a named *profile*; the assistant switches between them on request.

```
┌────────────┐     MCP (stdio)      ┌────────────────────┐     SQL      ┌─────────────┐
│  Claude /  │ ───────────────────► │  soham-global-sqls │ ───────────► │  MSSQL      │
│  Cursor /  │                      │                    │              │  MySQL      │
│  Windsurf  │ ◄─────────────────── │  profiles + guard  │ ◄─────────── │  PostgreSQL │
└────────────┘     tool results     └────────────────────┘    rows      │  Oracle     │
                                                                         └─────────────┘
```

---

## ✨ Features

| | |
|---|---|
| 🧩 **Four engines, one server** | SQL Server, MySQL, PostgreSQL, and Oracle — no separate installs. |
| 📇 **Named profiles** | Define every database once in `connections.json`; switch by name at runtime. |
| 🛡️ **Read-only by default** | Writes are blocked unless a profile explicitly opts in *and* the SQL parser agrees. |
| 🔍 **Schema introspection** | List databases, schemas, tables, columns, indexes; describe and sample tables. |
| 📝 **Audit logging** | Every tool call is recorded to a daily, size-rotated log file. |
| 🔒 **Secret-safe config** | Passwords live in `${ENV_VAR}` placeholders, never in the committed file. |
| 🧪 **SQL safety guard** | Multi-statement payloads and stray write keywords are rejected before they hit the DB. |
| ⚡ **One-command setup** | `sgsql init` scaffolds your config; `--interactive` walks you through it. |

---

## 🚀 Quick Start

Your first five minutes, start to finish.

**1. Install the server**

```bash
npm install -g soham-global-sqls
```

**2. Scaffold a config file**

```bash
sgsql init
```

This creates `~/.global_sqls/connections.json` from a template and prints your next steps.

**3. Edit the config** — open `~/.global_sqls/connections.json` and fill in one real database:

```json
{
  "default": "my-db",
  "profiles": {
    "my-db": {
      "engine": "postgres",
      "host": "localhost",
      "port": 5432,
      "database": "appdb",
      "user": "readonly_user",
      "password": "${MY_DB_PASSWORD}",
      "allow_writes": false
    }
  }
}
```

**4. Register the server with Claude Code** — add this to `~/.claude.json` (Windows: `%USERPROFILE%\.claude.json`):

```json
{
  "mcpServers": {
    "soham-global-sqls": {
      "command": "sgsql",
      "env": {
        "GLOBAL_SQLS_CONNECTIONS": "C:/Users/you/.global_sqls/connections.json",
        "MY_DB_PASSWORD": "your-real-password"
      }
    }
  }
}
```

**5. Ask Claude something** — restart your MCP client and try:

> *"Using soham-global-sqls, list the tables in my-db and show me 5 rows from the largest one."*

That's it. Claude calls the server's tools, the server runs the SQL, and you get answers in chat.

> 💡 **New to MCP?** The server speaks to your client over stdio — your client launches it
> automatically. You never run `sgsql` as a long-lived process yourself; you only run
> `sgsql init` once during setup.

---

## 📦 Installation

**Requirements:** Node.js **20 or newer** (`node --version` to check).

### Path A — npm (recommended for most users)

```bash
npm install -g soham-global-sqls
sgsql init
```

`sgsql` and `soham-global-sqls` are now on your `PATH` — they are the same command (`sgsql` is a
short alias).

### Path B — git clone (for contributors or a pinned source build)

```bash
git clone https://github.com/krutpandya92/soham-global-sqls.git
cd soham-global-sqls
npm install
npm run build
npm link            # exposes `sgsql` on PATH from this checkout
sgsql init
```

> ⚠️ **Native drivers:** the `oracledb` and `mssql` packages include native components. If
> `npm install` fails, check that you have your platform's build tools installed (see each
> driver's npm page). MySQL and PostgreSQL drivers are pure JavaScript and always install cleanly.

---

## ⚙️ Configuration

Everything the server needs to reach your databases lives in **one JSON file**:
`connections.json`.

### How the file is located

At startup the server looks for the file in this order:

1. The path in the `GLOBAL_SQLS_CONNECTIONS` environment variable, if set.
2. `~/.global_sqls/connections.json`
3. `./connections.json` (current working directory)

If none exist, the server **creates a starter file at `~/.global_sqls/connections.json`** and logs
a warning — so a fresh install never hard-fails, it just hands you a template to edit.

### File shape

```json
{
  "default": "local-mssql",
  "profiles": {
    "local-mssql":   { "...": "one profile per database" },
    "prod-mysql":    { "...": "..." },
    "analytics-pg":  { "...": "..." }
  }
}
```

- **`default`** — the profile used when the server starts. Switch later with the `use_connection` tool.
- **`profiles`** — a named map. The name (e.g. `analytics-pg`) is how you and the assistant refer to each database.

### A complete, real-world example

```json
{
  "default": "analytics-pg",
  "profiles": {
    "local-mssql": {
      "engine": "mssql",
      "host": "localhost",
      "port": 1433,
      "database": "MyDb",
      "user": "sa",
      "password": "${MSSQL_PASSWORD}",
      "encrypt": true,
      "trustServerCert": true,
      "allow_writes": false
    },
    "prod-mysql": {
      "engine": "mysql",
      "host": "db.internal.example.com",
      "port": 3306,
      "database": "app",
      "user": "reporting",
      "password": "${MYSQL_PASSWORD}",
      "ssl": true,
      "allow_writes": false
    },
    "analytics-pg": {
      "engine": "postgres",
      "host": "warehouse.example.com",
      "port": 5432,
      "database": "warehouse",
      "user": "analyst",
      "password": "${PG_PASSWORD}",
      "ssl": "require",
      "allow_writes": false
    },
    "legacy-oracle": {
      "engine": "oracle",
      "connectString": "oracle.example.com:1521/ORCLPDB1",
      "user": "app_user",
      "password": "${ORACLE_PASSWORD}",
      "mode": "auto",
      "allow_writes": false
    }
  }
}
```

### Fields per engine

| Engine     | Required fields                                | Optional fields                                      |
|------------|------------------------------------------------|------------------------------------------------------|
| `mssql`    | `host`, `port`, `database`, `user`, `password`  | `encrypt`, `trustServerCert`, `allow_writes`         |
| `mysql`    | `host`, `port`, `database`, `user`, `password`  | `ssl`, `allow_writes`                                |
| `postgres` | `host`, `port`, `database`, `user`, `password`  | `ssl` (`true` / `false` / `"require"`), `allow_writes` |
| `oracle`   | `connectString`, `user`, `password`             | `mode` (`"auto"` / `"thin"` / `"thick"`), `allow_writes` |

<details>
<summary><strong>Per-engine setup notes</strong> (click to expand)</summary>

- **SQL Server** — local/dev instances usually need `"encrypt": true` with `"trustServerCert": true`
  (the default certificate is self-signed). Azure SQL needs `"encrypt": true` and a real cert, so
  drop `trustServerCert`.
- **MySQL** — set `"ssl": true` for managed/cloud databases that require TLS; omit it for local.
- **PostgreSQL** — `"ssl": "require"` is the common setting for cloud Postgres (RDS, Supabase,
  Neon, etc.). Use `false` for local.
- **Oracle** — use a full `connectString` of the form `host:port/service_name`. `"mode": "auto"`
  works for most setups; only force `"thin"` or `"thick"` if you have a specific driver need.

</details>

### Passwords: `${ENV_VAR}` placeholders

Never put a real password in `connections.json`. Use a placeholder:

```json
"password": "${MSSQL_PASSWORD}"
```

The server substitutes the value from its environment **at connect time**. Provide that variable
in your **MCP client's `env` block** (shown in the next section).

> ❗ **Important:** setting the variable in your own shell will **not** work. MCP clients launch the
> server as a child process with a clean environment — only what you list under `env` reaches it.

### Interactive setup wizard

Prefer to be guided? Run:

```bash
sgsql init --interactive
```

It prompts for engine, host, port, credentials, and write permission — for one or more profiles —
then writes a ready-to-use `connections.json`.

| `sgsql init` flag | Effect                                                        |
|-------------------|---------------------------------------------------------------|
| *(none)*          | Copy the template to `~/.global_sqls/connections.json`.       |
| `--interactive`   | Run the guided wizard instead of copying the template.        |
| `--path <file>`   | Write to a custom location instead of the default.            |
| `--force`         | Overwrite an existing file (otherwise the command refuses).   |
| `--print`         | Print the template to stdout without writing any file.        |

---

## 🔌 MCP Client Setup

The server is configured the same way everywhere — a small JSON block naming the command and its
`env`. Only the **file you put it in** changes per client.

### Claude Code

Claude Code supports three *scopes*, depending on who should see the server:

| Scope       | Config file                                  | Visible to                          |
|-------------|-----------------------------------------------|-------------------------------------|
| **User**    | `~/.claude.json`                              | You, in every project on this machine |
| **Project** | `.mcp.json` at the repo root (commit it)      | Everyone who clones the repo        |
| **Local**   | `.claude/settings.local.json` (git-ignored)   | Only you, only in that project      |

**User scope** — add to `~/.claude.json` (Windows: `%USERPROFILE%\.claude.json`):

```json
{
  "mcpServers": {
    "soham-global-sqls": {
      "command": "sgsql",
      "env": {
        "GLOBAL_SQLS_CONNECTIONS": "C:/Users/you/.global_sqls/connections.json",
        "MSSQL_PASSWORD": "your-password-here",
        "AUDIT_LOG_DIR": "C:/Users/you/.global_sqls/logs"
      }
    }
  }
}
```

Or let the CLI do it:

```bash
claude mcp add soham-global-sqls -s user -- sgsql      # user scope
claude mcp add soham-global-sqls -s project -- sgsql   # project scope (.mcp.json)
claude mcp add soham-global-sqls -s local -- sgsql     # local scope
```

### Other MCP clients

The same JSON block works in every client below — drop it under their `mcpServers` key.

| Client            | Config file                                          |
|-------------------|-------------------------------------------------------|
| Claude Desktop    | `%APPDATA%\Claude\claude_desktop_config.json`         |
| Cursor            | `%USERPROFILE%\.cursor\mcp.json`                      |
| Windsurf          | `%USERPROFILE%\.codeium\windsurf\mcp_config.json`     |
| VS Code (Copilot) | `<repo>/.vscode/mcp.json`                             |

> 🔁 Restart (or reload the window of) your client after editing its config so it picks up the
> new server.

---

## 🧰 Available Tools

Once connected, the assistant can call these tools on your behalf.

### Connection management

| Tool                 | What it does                                              |
|----------------------|-----------------------------------------------------------|
| `list_connections`   | List every profile defined in `connections.json`.         |
| `current_connection` | Show which profile is currently active.                   |
| `use_connection`     | Switch the active profile by name.                        |
| `ping`               | Verify the active connection is alive.                    |

### Schema exploration

| Tool             | What it does                                              |
|------------------|-----------------------------------------------------------|
| `list_databases` | List databases on the server.                             |
| `list_schemas`   | List schemas in the current database.                     |
| `list_tables`    | List tables in a schema.                                  |
| `list_columns`   | List columns of a table.                                  |
| `list_indexes`   | List indexes of a table.                                  |
| `describe_table` | Full structure of a table — columns, types, keys.         |
| `sample_table`   | Return the first N rows of a table.                       |

### Querying

| Tool        | What it does                                                                  |
|-------------|-------------------------------------------------------------------------------|
| `run_query` | Run a `SELECT` (or a write, if the profile has `allow_writes: true`).         |

### Example: a real conversation

You don't call tools directly — you ask in natural language and the assistant picks the right
ones. For example:

> **You:** *"Switch to the analytics-pg profile and describe the `orders` table."*
>
> **Claude** *(calls `use_connection` → `describe_table`)*: "`orders` has 8 columns: `id` (integer,
> primary key), `customer_id` (integer, FK), `total` (numeric), `status` (text), `created_at`
> (timestamp)…"
>
> **You:** *"Show me the 5 most recent orders over $500."*
>
> **Claude** *(calls `run_query`)*: runs `SELECT * FROM orders WHERE total > 500 ORDER BY
> created_at DESC LIMIT 5` and shows the rows.

---

## 🛡️ Security Model

This server is built to be **safe to point at production data**.

- **🔒 Read-only by default.** A query that writes is allowed *only* when both are true: the
  profile has `"allow_writes": true`, **and** the SQL parser classifies the statement as a write
  you intended. Miss either and you get a clear `WRITE_DENIED` error.
- **🧪 SQL safety guard.** `node-sql-parser` inspects every statement. Multi-statement payloads
  (a classic injection vector) and unexpected write keywords are rejected before reaching the
  database.
- **📝 Audit logging.** Every tool invocation is appended to
  `${AUDIT_LOG_DIR}/audit-YYYY-MM-DD.log`, rotated by size. Set `AUDIT_LOG_VERBOSE=true` to record
  full request/response bodies.
- **🙈 PII redaction.** With `PII_SCRUB=true`, values that look like emails, SSNs, and similar
  patterns are masked in the audit log.
- **🔑 No secrets in config.** Passwords are `${ENV_VAR}` placeholders, so `connections.json` is
  safe to share or commit (without the env values).
- **⏱️ Rate limiting & timeouts.** Per-minute query caps and per-query timeouts contain runaway
  workloads.

---

## 🔧 Environment Variables

All optional — sensible defaults apply. Set them in your MCP client's `env` block.

| Variable                    | Default                           | Purpose                                          |
|-----------------------------|-----------------------------------|--------------------------------------------------|
| `GLOBAL_SQLS_CONNECTIONS`   | `~/.global_sqls/connections.json` | Path to your profiles file.                      |
| `MAX_ROWS`                  | `1000`                            | Maximum rows returned by `run_query`.            |
| `QUERY_TIMEOUT_MS`          | `30000`                           | Per-query timeout, in milliseconds.              |
| `AUDIT_LOG_DIR`             | `./logs`                          | Directory for audit log files.                   |
| `AUDIT_LOG_MAX_BYTES`       | `10485760`                        | Size threshold (10 MB) before a log rotates.     |
| `AUDIT_LOG_VERBOSE`         | `false`                           | Log full request/response bodies when `true`.    |
| `RATE_LIMIT_QUERY_PER_MIN`  | `60`                              | Max `run_query` calls per minute.                |
| `LOG_LEVEL`                 | `info`                            | `debug` · `info` · `warn` · `error`.             |
| `PII_SCRUB`                 | `false`                           | Mask common PII patterns in audit output.        |
| `PERMISSION_PROBE`          | `warn`                            | `off` · `warn` · `enforce`.                      |

Plus one `${VAR}` per password placeholder you use in `connections.json`.

---

## 🩺 Troubleshooting & FAQ

| Symptom                                          | Cause & fix                                                                          |
|--------------------------------------------------|--------------------------------------------------------------------------------------|
| *"Connections file not found"*                   | Run `sgsql init`, or point `GLOBAL_SQLS_CONNECTIONS` at your file in the `env` block. |
| *"WRITE_DENIED: profile is read-only"*           | Set `"allow_writes": true` on that profile — and confirm you meant to write.          |
| *"Unresolved env var: `${MSSQL_PASSWORD}`"*      | The variable isn't in the client `env` block. Put it there — your shell won't reach the server. |
| *Server won't start in the client*               | Run `sgsql init --print` in a terminal to confirm the install works, then check the client's MCP log. |
| *`npm install` fails on `oracledb` / `mssql`*    | Native build tools missing — see each driver's npm page for prerequisites.            |
| *Connection times out*                           | Check host/port, firewall, and (for cloud DBs) that `ssl` / `encrypt` is set correctly. |
| *Path errors on Windows*                         | Use forward slashes in JSON paths (`C:/Users/you/...`) — they work everywhere.         |

<details>
<summary><strong>Frequently asked questions</strong> (click to expand)</summary>

**Do I need to keep `sgsql` running?**
No. Your MCP client starts and stops the server automatically. You only run `sgsql init` once.

**Can I connect to several databases at once?**
Yes — add a profile per database. The assistant switches with `use_connection`; the `default`
profile is active at startup.

**Is it safe to commit `connections.json`?**
Yes, *if* every password is a `${ENV_VAR}` placeholder and you don't commit the env values. The
default `.gitignore` also excludes a literal `connections.json` to be safe.

**Does it support writes / `INSERT` / `UPDATE`?**
Only when a profile sets `"allow_writes": true`. Leave it `false` for anything you care about.

**Which Node version do I need?**
Node 20 or newer.

</details>

---

## 🤝 Contributing

Contributions are welcome. Before opening a pull request:

```bash
npm install
npm run build
npm run lint          # type-check
npm run lint:eslint   # linter
npm test              # test suite
npm run format:check  # formatting
```

CI runs the same checks on Node 20 & 22 across Linux, Windows, and macOS — green CI is required
to merge.

---

## 📄 License

Released under the [MIT License](./LICENSE). © krutpandya92

<div align="center">
<sub>Built for the <a href="https://modelcontextprotocol.io">Model Context Protocol</a> · made with care for safe database access.</sub>
</div>
