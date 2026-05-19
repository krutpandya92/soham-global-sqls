# soham-global-sqls

Multi-engine SQL Model Context Protocol (MCP) server. One process, four engines: **MSSQL · MySQL · PostgreSQL · Oracle**. Profile-based connections, audit logging, SQL parser guard, read-only by default.

---

## Install

### Path A — npm (most users)

```bash
npm install -g soham-global-sqls
sgsql init          # creates ~/.global_sqls/connections.json
```

Then edit `~/.global_sqls/connections.json` and add the MCP client block shown below.

### Path B — git clone (contributors / pinned source)

```bash
git clone https://github.com/krutpandya92/soham-global-sqls.git
cd soham-global-sqls
npm install
npm run build
npm link            # exposes `sgsql` and `soham-global-sqls` on PATH from this checkout
sgsql init
```

---

## Configure `connections.json`

`sgsql init` copies `connections.example.json` to `~/.global_sqls/connections.json`. Edit it. Each profile is one database; the `default` field picks the one used at startup.

```json
{
  "default": "local-mssql",
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
    }
  }
}
```

### Required fields per engine

| Engine    | Required                                    | Optional                              |
|-----------|---------------------------------------------|---------------------------------------|
| mssql     | host, port, database, user, password        | encrypt, trustServerCert, allow_writes|
| mysql     | host, port, database, user, password        | ssl, allow_writes                     |
| postgres  | host, port, database, user, password        | ssl (true/false/"require"), allow_writes |
| oracle    | connectString, user, password               | mode ("auto"/"thin"/"thick"), allow_writes |

### `${ENV_VAR}` placeholders

Passwords use `${VAR_NAME}` syntax. The server resolves them from `process.env` at connect time. Set the variables in your **MCP client's `env` block** (see next section) — setting them in your shell will NOT work, because the MCP client spawns the server with a clean environment.

### Interactive wizard

```bash
sgsql init --interactive
```
Prompts engine, host, port, etc., for one or more profiles. Writes the same file format.

---

## Add to your MCP client

### Claude Code — user scope

Add to `~/.claude.json` (Windows: `%USERPROFILE%\.claude.json`) under `mcpServers`:

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

Or use the CLI:
```bash
claude mcp add soham-global-sqls -s user -- sgsql
```

### Claude Code — project scope

Commit a `.mcp.json` at your repo root with the same block. Every teammate who clones and opens the repo in Claude Code gets the server.

### Claude Code — local scope (private to you, this project)

```bash
claude mcp add soham-global-sqls -s local -- sgsql
```
Writes to `.claude/settings.local.json` (gitignored).

### Other clients

| Client                | Config file                                                |
|-----------------------|------------------------------------------------------------|
| Claude Desktop        | `%APPDATA%\Claude\claude_desktop_config.json`              |
| Cursor                | `%USERPROFILE%\.cursor\mcp.json`                           |
| Windsurf              | `%USERPROFILE%\.codeium\windsurf\mcp_config.json`          |
| VS Code (Copilot)     | `<repo>/.vscode/mcp.json`                                  |

---

## Available tools

- `list_connections` / `current_connection` / `use_connection` — switch profiles at runtime
- `ping` — quick aliveness check on the active connection
- `list_databases` / `list_schemas` / `list_tables` / `list_columns` / `list_indexes`
- `describe_table` / `sample_table` — schema + first N rows
- `run_query` — execute SELECT (or writes when `allow_writes: true`)

---

## Security model

- **Read-only by default.** Writes require `allow_writes: true` on the profile AND the SQL parser must classify the statement as a write.
- **Audit log.** Every tool invocation is appended to `${AUDIT_LOG_DIR}/audit-YYYY-MM-DD.log`. Set `AUDIT_LOG_VERBOSE=true` for full request/response bodies.
- **SQL guard.** `node-sql-parser` rejects multi-statement payloads and write keywords unless explicitly allowed.
- **PII redaction.** `PII_SCRUB=true` masks values matching common patterns (email, SSN-like, etc.) in audit output.

---

## Environment variables

| Variable                       | Default                            | Purpose                                     |
|--------------------------------|------------------------------------|---------------------------------------------|
| `GLOBAL_SQLS_CONNECTIONS`      | `~/.global_sqls/connections.json`  | Path to your profiles file                  |
| `MAX_ROWS`                     | `1000`                             | Cap on rows returned by `run_query`         |
| `QUERY_TIMEOUT_MS`             | `30000`                            | Per-query timeout                           |
| `AUDIT_LOG_DIR`                | `./logs`                           | Where audit logs are written                |
| `AUDIT_LOG_MAX_BYTES`          | `10485760`                         | Rotate threshold per file                   |
| `AUDIT_LOG_VERBOSE`            | `false`                            | Log full request/response bodies            |
| `RATE_LIMIT_QUERY_PER_MIN`     | `60`                               | Cap on `run_query` calls per minute         |
| `LOG_LEVEL`                    | `info`                             | debug / info / warn / error                 |
| `PII_SCRUB`                    | `false`                            | Mask values matching common PII patterns    |
| `PERMISSION_PROBE`             | `warn`                             | off / warn / enforce                        |

Plus connection-file `${VAR}` placeholders for passwords (whatever names you use).

---

## Troubleshooting

| Symptom                                              | Likely cause / fix                                                                 |
|------------------------------------------------------|------------------------------------------------------------------------------------|
| "Connections file not found"                         | `sgsql init`, or set `GLOBAL_SQLS_CONNECTIONS` in the MCP client `env` block.      |
| "WRITE_DENIED: profile is read-only"                 | Set `"allow_writes": true` on that profile.                                        |
| "Unresolved env var: ${MSSQL_PASSWORD}"              | The variable isn't in the MCP client `env` block. Put it there, not in your shell. |
| "ENOENT: no such file" on a path that exists         | Forward slashes work everywhere on Windows JSON; check the path you put in `env`.  |
| Driver install errors (oracledb, mssql)              | Some drivers need native build tools; see each driver's npm page for prerequisites.|

---

## Contributing

PRs welcome. Run the test suite before pushing:
```bash
npm install
npm test
npm run lint
```

## License

MIT © krutpandya92
