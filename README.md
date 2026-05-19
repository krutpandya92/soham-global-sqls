# global_sqls

A multi-engine SQL MCP server: connect Claude (or any MCP client) to **Microsoft SQL Server, MySQL, PostgreSQL, and Oracle** databases through a single server, switch between connections at runtime, and audit every query.

- Multi-engine — MSSQL, MySQL, PostgreSQL, Oracle
- Switchable — pre-define named profiles, switch with `use_connection`
- Read-only by default — writes are opt-in per profile via `allow_writes`
- Audit log — one JSON-line `span` event per tool call: args, result summary, status, and per-phase timing (connect / execute / serialize)
- Offline — once installed, no internet needed at runtime

---

## Install

Requires Node.js >= 18.

```bash
git clone https://github.com/<your-org>/global_sqls.git
cd global_sqls
npm install
npm run build
```

> **Oracle note:** the bundled `oracledb` driver runs in **thin mode** by default — no extra install needed. If you have Oracle Instant Client on your PATH and want thick mode, set `"mode": "thick"` on the profile. With `"mode": "auto"` (default), thick mode is used only if Instant Client is detected.

---

## Configure

1. Copy `connections.example.json` to `connections.json`:

   ```bash
   cp connections.example.json connections.json
   ```

2. Edit `connections.json`. Each profile has an `engine` and engine-specific fields:

   ```json
   {
     "default": "local-mssql",
     "profiles": {
       "local-mssql":  { "engine": "mssql",    "host": "localhost",     "port": 1433, "database": "MyDb",      "user": "sa",   "password": "${MSSQL_PASSWORD}",  "encrypt": true, "trustServerCert": true, "allow_writes": false },
       "prod-mysql":   { "engine": "mysql",    "host": "db.example",    "port": 3306, "database": "app",       "user": "ro",   "password": "${MYSQL_PASSWORD}",  "ssl": false,                            "allow_writes": false },
       "analytics-pg": { "engine": "postgres", "host": "wh.example",    "port": 5432, "database": "warehouse", "user": "ro",   "password": "${PG_PASSWORD}",     "ssl": "require",                        "allow_writes": false },
       "legacy-oracle":{ "engine": "oracle",   "connectString": "h:1521/PDB",                                  "user": "app",  "password": "${ORACLE_PASSWORD}", "mode": "auto",                          "allow_writes": false }
     }
   }
   ```

   `${ENV_VAR}` placeholders are resolved from environment variables, so you can commit a template without secrets.

3. Set the env vars before running, e.g. in PowerShell:

   ```powershell
   $env:MSSQL_PASSWORD = "..."
   $env:PG_PASSWORD = "..."
   ```

4. (Optional) override the path:

   ```powershell
   $env:GLOBAL_SQLS_CONNECTIONS = "C:\path\to\connections.json"
   ```

---

## Hook into Claude Desktop / Claude Code

Add to your MCP config (e.g. `~/.config/claude/claude_desktop_config.json` or `.claude/mcp_servers.json`):

```json
{
  "mcpServers": {
    "global_sqls": {
      "command": "node",
      "args": ["/absolute/path/to/global_sqls/build/index.js"],
      "env": {
        "MSSQL_PASSWORD": "...",
        "MYSQL_PASSWORD": "...",
        "PG_PASSWORD": "...",
        "ORACLE_PASSWORD": "..."
      }
    }
  }
}
```

Restart your MCP client. You should see the `global_sqls` tools available.

---

## Tools

| Tool | Purpose |
|------|---------|
| `list_connections` | List all configured profiles and which is active |
| `use_connection` | Switch the active profile (`{ name }`) |
| `current_connection` | Show the active profile details |
| `ping` | Verify the active connection is alive |
| `list_databases` | List databases (engine-dependent) |
| `list_schemas` | List schemas |
| `list_tables` | List tables and views (optional `{ schema }`) |
| `describe_table` / `list_columns` | Show column definitions |
| `list_indexes` | Show indexes for a table |
| `sample_table` | Return up to N rows from a table |
| `run_query` | Run arbitrary SQL with parameters. Writes blocked unless `allow_writes=true`. |

---

## Logging

Every tool call is logged as one JSON line under `./logs/global_sqls-YYYY-MM-DD.log` (override the directory with `AUDIT_LOG_DIR`):

```json
{"ts":"2026-05-19T18:32:05.956Z","event":"span","requestId":"r-jcqxq6w4","tool":"run_query","profile":"prod-mysql","engine":"mysql","status":"ok","args":{"sql":"SELECT * FROM users WHERE id=?","params":["***REDACTED***"]},"result":{"rowCount":1,"truncated":false},"timing":{"total_ms":34,"execute_ms":29,"serialize_ms":3}}
```

Fields: `ts`, `event` (always `"span"`), `requestId`, `tool`, `profile`, `engine`, `status` (`"ok"` | `"error"`), `args` (redacted), `result` or `error`, and `timing`. The `timing` block always carries `total_ms` and includes any of `connect_ms`, `execute_ms`, `serialize_ms` that the tool measured — use it to attribute slowness to a specific stage.

Set `AUDIT_LOG_VERBOSE=true` to switch the same file to a multi-line, human-readable layout:

```
─── 2026-05-19T18:32:05.956Z ─── run_query [prod-mysql/mysql] OK
  req:    r-jcqxq6w4
  args:   {"sql":"SELECT * FROM users WHERE id=?","params":["***REDACTED***"]}
  result: rowCount=1 truncated=false
  timing: total=34ms (execute=29 serialize=3)
```

Other audit knobs:

| Env var | Default | What it does |
|---|---|---|
| `AUDIT_LOG_DIR` | `./logs` | Directory the daily log file is written to |
| `AUDIT_LOG_MAX_BYTES` | `10485760` (10 MiB) | Rotate file (rename to `*.<ts>.old`) when it exceeds this size |
| `AUDIT_LOG_VERBOSE` | `false` | Switch to multi-line human format |

The MCP server only sees tool calls. To capture **your prompts** and **Claude's rendered replies** as well, enable Claude Code hooks (separate from this server). Example `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "command": "echo \"{{prompt}}\" >> ~/claude-prompts.log" }],
    "Stop": [{ "command": "echo \"--- end of turn ---\" >> ~/claude-prompts.log" }]
  }
}
```

Correlate the two streams by timestamp.

---

## Does it need internet?

| Step | Internet? |
|------|-----------|
| `npm install` (first time) | Yes |
| `git push` | Yes |
| Oracle Instant Client install (thick mode only, optional) | Yes |
| Running the server | **No** |
| Connecting to DBs and querying | No (assuming the DB is reachable on your network) |
| Writing audit logs | No (local `./logs/`) |

---

## Development

```bash
npm run dev         # tsx watch mode
npm test            # vitest run
npm run test:watch  # vitest watch mode
npm run lint        # tsc --noEmit
```

Per-engine integration tests are gated by env vars and skipped by default:

```powershell
$env:GLOBAL_SQLS_IT_MSSQL = "1"
$env:GLOBAL_SQLS_IT_MYSQL = "1"
npm test
```

---

## License

MIT
