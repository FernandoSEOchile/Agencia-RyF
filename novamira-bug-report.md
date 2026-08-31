# Bug report: Windows credential backend is unusable (novamira-cli 1.1.0)

**Environment**

| | |
|---|---|
| CLI | `@novamira/cli` 1.1.0 (npm global) |
| OS | Windows 11 Home Single Language 10.0.26200 |
| Node | v24.14.0 |
| npm | 11.9.0 |
| WordPress plugin | Novamira 1.11.6 |
| Site | WordPress 6.9.7, PHP 8.3.30, Hostinger |

Four distinct defects in the Windows credential subsystem, in the order they surfaced. Together they make `novamira auth login` unusable on Windows: the default backend cannot store a token at all, and the documented fallback corrupts itself on the first refresh.

---

## Bug 1 — `CredWrite` blob exceeds the Windows 2560-byte limit

`WindowsCredentialManagerBackend` (`dist/auth/keychain-backends.js`) writes the serialized credential through `advapi32.dll!CredWriteW` using `Encoding.Unicode.GetBytes(secret)`.

Windows caps `CredentialBlobSize` at `CRED_MAX_CREDENTIAL_BLOB_SIZE` = 2560 bytes. UTF-16 spends 2 bytes per character, so the effective ceiling is ~1280 characters. A serialized OAuth record (JWT access token + refresh token + metadata) exceeds it, and `CredWrite` fails.

**Reproduction** — extracting the CLI's own `WINDOWS_CREDENTIAL_SCRIPT` and calling it directly:

| Secret length | UTF-16 bytes | Result |
|---|---|---|
| 500 chars | 1000 | OK |
| 1200 chars | 2400 | OK |
| **1300 chars** | **2600** | **FAILS** |
| 2000 chars | 4000 | FAILS |
| 4000 chars | 8000 | FAILS |

The failure surfaces to the user as:

```
Error [auth_required]: The OS credential service could not complete the operation.
```

This message points at the OS, not at the CLI, which sends users diagnosing WordPress, hosting firewalls, and user permissions. In this case it cost hours before the real cause was found.

**Suggested fix:** chunk the blob across multiple credentials, or store a DPAPI-protected file and keep only a key in Credential Manager.

---

## Bug 2 — file fallback truncates the credential to 1 byte on token refresh

With `NOVAMIRA_CREDENTIAL_BACKEND=file`, the first login succeeds. After the access token expires (~24h) and the CLI refreshes it, the credential store is left corrupt.

Observed state:

```
C:\Users\<user>\AppData\Local\Novamira\Credentials\v1    1 byte
```

`v1` is supposed to be a **directory** containing `<account>.json` (see `FileCredentialBackend.read` / `.replace` in `dist/auth/credentials.js`, which both do `join(credentialsDir, "v1", account + ".json")`). Instead a 1-byte **file** named `v1` occupied that path, so every subsequent write targeted a path inside a non-directory.

From that point every command fails — including `novamira auth status`, which performs no network I/O:

```
Error [internal_error]: An unexpected internal error occurred.
```

`doctor --offline` is the only command that explains anything:

```json
{"id":"oauth.token","status":"fail",
 "summary":"Stored credentials are corrupt or cannot be read safely.",
 "evidence":{"credentialState":"invalid"}}
```

**Suggested fix:** validate that `v1` is a directory before writing; on a corrupt record, self-heal (unlink and re-authorize) instead of failing every command with `internal_error`.

---

## Bug 3 — `internal_error` swallows ACL failures with no actionable message

After deleting the corrupt `v1` file, login still failed. `secureDirectory` does `mkdir(path, {recursive:true, mode:0o700})` and then hardens the ACL by spawning `powershell.exe`. When that hardening fails, the exception propagates as a bare `internal_error`.

Critically, this happens **after** the OAuth flow has fully succeeded. The verbose trace shows the token was issued and authenticated calls worked:

```
POST /wp-json/novamira/v1/oauth/token                      -> 200
GET  /wp-json/wp-abilities/v1/abilities                    -> 200
POST /wp-json/novamira/v1/abilities/novamira/agent-context/run -> 200
Diagnostic: {"error":{"code":"[REDACTED]","remoteCode":"[REDACTED]","name":"CliError"}}
Error [internal_error]: An unexpected internal error occurred.
```

So the user approves in the browser, the server issues a valid token, and the CLI discards it with a message that names neither the path nor the operation. `--verbose` does not help: it redacts both `code` and `remoteCode`, the two fields that would identify the failure.

**Suggested fix:** include the failing path and operation in the error. Do not redact the error code under `--verbose` — redaction should cover secrets, not error identifiers.

---

## Bug 4 — `Set-Acl` requires `SeSecurityPrivilege` that ordinary accounts lack

Manually applying the exact ACL the CLI expects, replicating `ACL_TARGET_BODY` from `dist/config/file-security.js`:

```
Set-Acl : El proceso no tiene el privilegio 'SeSecurityPrivilege'
          que se necesita para esta operación.
```

The code comments show this was anticipated for the `apply` path, which falls back to verification. But the same privilege issue in adjacent paths still aborts login. Note that after the failure the ACL verified as correct anyway:

```
Credentials       protegida=True reglas=1 SEGURA=True
Credentials\v1    protegida=True reglas=1 SEGURA=True
```

Calling the CLI's own `secureDirectory` / `atomicWriteFile` in isolation then succeeded on all five directories:

```
configFile dir   secure: OK | verify: true | write: OK
stateDir         secure: OK | verify: true | write: OK
cacheDir         secure: OK | verify: true | write: OK
credentialsDir   secure: OK | verify: true | write: OK
credentials v1   secure: OK | verify: true | write: OK
atomicWriteFiles OK
```

Yet a subsequent `auth login` still failed to persist. The storage layer verifies healthy in isolation but the login path does not survive it — suggesting the failure is elsewhere in the login sequence, still reported as `internal_error`.

---

## Impact

On this machine, `novamira auth login` never persisted a working credential across a session. The one credential that did persist survived a single day, then corrupted on refresh and bricked every command until the file was deleted by hand.

## Unrelated observation

`novamira/run-wp-cli` fails on Hostinger:

```
Error [remote_execution_failed]: Process execution (proc_open or exec) is disabled in PHP configuration.
```

`proc_open`/`exec` are disabled by many shared hosts. Consider detecting this during `doctor` and marking the WP-CLI abilities unavailable, rather than failing at call time.
