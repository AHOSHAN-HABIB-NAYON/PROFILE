# AI assistant

The assistant (Project → **AI assistant**) explains problems and proposes code changes as a
unified diff. It never writes files on its own: every patch is checked, shown as a diff, and only
applied when you tap **Apply patch**.

## Flow

1. **Pick context.** The files that analysis findings point at are pre-selected (up to 20 files).
   You can add analysis findings and a crash or build log.
2. **Review what will be sent.** Before any request, a dialog lists every file (with size,
   truncation and redaction counts), what was skipped and why, and can show the full text.
3. **Answer.** If the answer contains a ```` ```diff ```` block, AppFix parses it with
   `UnifiedPatch` and checks it against the current files.
4. **Review → apply or reject.** A matching patch is shown as a diff. Applying it goes through the
   same `ChangeApplier` as every other change: a backup is made first (if enabled in Settings), and
   the change can be undone from the project's History tab.
5. **Validate.** After applying, analysis runs again and shows errors before and after, findings that
   disappeared, and new ones. The app says **"not verified until a build passes"**. It never reports a
   problem as fixed because of an AI answer. Use **Build to confirm**, which runs a cloud build.

## Patch safety rules (`core/patch/UnifiedPatch.kt`)

| Rule | Behaviour |
| --- | --- |
| Absolute paths, `..`, drive letters, NUL bytes | rejected |
| Keystores, `*.p12/pem/key`, `keystore.properties`, `signing.properties`, `local.properties`, `.env` | rejected |
| Anything under `.git/` | rejected |
| Binary patches, renames | rejected |
| Hunk context or removed lines don't match the file | the whole patch is rejected (offsets of up to 60 lines are tolerated) |
| "Create" for a file that exists, "delete" that doesn't remove everything | rejected |
| More than 50 files, files over 2 MB | rejected |

Line endings (CRLF/LF) and the trailing newline are kept. All of this is covered by `UnifiedPatchTest`.

## What is never sent

* Files matching the secret patterns above are not listed in the picker, and are refused if requested.
* Lines that look like credentials (`password`, `storePassword`, `keyPassword`, `token`, `api_key`,
  `secret`, `authorization` followed by `=`, `:` or a quoted value) are replaced with
  `<redacted by AppFix>`. So are strings shaped like OpenAI/GitHub/Google keys or PEM private keys.
  Because of this, a patch that touches a redacted line will not match and is rejected, which is intended.
* Logs are trimmed to the last 16 000 characters and redacted the same way.

## Providers

No key is built into the app or stored in this repository. Pick one in the assistant's settings:

| Provider | Key handling |
| --- | --- |
| **Own backend proxy** (recommended for teams) | Your server holds the provider key. The app sends an optional per-user token as `Authorization: Bearer …`. |
| **Anthropic API** | The user's own key, sent as `x-api-key` to `api.anthropic.com/v1/messages`. |
| **OpenAI-compatible API** | The user's own key, sent as `Authorization: Bearer …` to `<base>/chat/completions`. |

Keys and tokens are encrypted on the device with an Android Keystore AES-GCM key (`SecretStore`). They are
sent only to the configured host: redirects are not followed, and error messages are scrubbed of the key.
HTTPS is required, except for `localhost` / `10.0.2.2` during development.

### Proxy contract

```
POST <proxy URL>
Authorization: Bearer <optional user token>
Content-Type: application/json

{ "system": "...", "messages": [{"role": "user", "content": "..."}], "model": "optional", "max_tokens": 4096 }

200 OK
{ "text": "assistant answer" }
```

### Reference proxy (Cloudflare Worker)

This example is not deployed by this project. Store `ANTHROPIC_API_KEY` and `APP_TOKENS` (a comma-separated
list of per-user tokens) as Worker secrets. Add rate limiting (for example, Cloudflare rate-limiting rules)
before giving the URL to anyone.

```js
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!env.APP_TOKENS.split(",").includes(token)) return new Response("Unauthorized", { status: 401 });
    const body = await request.json();
    if (JSON.stringify(body).length > 200_000) return new Response("Too large", { status: 413 });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.MODEL,                       // fixed server-side; the client's model is ignored
        max_tokens: Math.min(body.max_tokens || 4096, 8192),
        system: body.system,
        messages: body.messages,
      }),
    });
    const data = await res.json();
    if (!res.ok) return Response.json({ error: { message: data.error?.message || "Upstream error" } }, { status: 502 });
    return Response.json({ text: data.content.filter(c => c.type === "text").map(c => c.text).join("") });
  },
};
```

## Limitations

* The assistant only sees the files you share. If it needs another file, it is told to ask for it rather than guess.
* Large files are truncated to 24 000 characters, and the whole request is limited to about 90 000 characters.
* Static analysis after applying catches only what the analyzer knows about. Only a successful build
  (and, for crashes, running the app) confirms a fix.
* Requests that would help with signature bypass, licence circumvention, credential theft, malware or
  evading security controls are refused by the system prompt. The patch rules above also stop changes
  to signing files whatever the model says.
