# Connecting Google, Slack and GitHub (OAuth apps)

Everything here is done **in the app**. No OAuth client id or secret is read from server environment variables at
runtime (design: `docs/security/CREDENTIALS_DESIGN.md`).

## 1. Flowline's shared apps (platform admin)

1. Sign in as a platform admin and open **`/admin`** (anyone else gets the ordinary 404 page).
2. Enter a code from your authenticator app under **Unlock changes**. Changes stay unlocked for 10 minutes on this
   session only.
3. Copy the redirect URI shown under **Redirect URIs to register** into each provider's app settings:
   - Integrations (Google, Slack, GitHub): `<FLOWLINE_PUBLIC_URL>/api/oauth/callback`
   - Google sign-in: `<BETTER_AUTH_URL>/api/auth/callback/google`; GitHub sign-in: `<BETTER_AUTH_URL>/api/auth/callback/github`
4. Under **Integration apps** (or **Sign-in apps**), enter the **Client ID** and paste the **Secret**, then **Save**.
   - The secret is write-only: it is encrypted (platform key ring) and never shown again. For secrets of 32+
     characters the panel shows only the last 4.
   - Leave the secret empty to keep the current one. An empty value never clears anything.
5. **Test** only rejects obviously wrong client credentials (`invalid_client`). The app shows **Verified** only after a
   real Connect (or sign-in) succeeds with that revision.

### Rotating, switching, revoking

- **Same client id, new secret** = rotation. Google and GitHub keep the previous secret working for 7 days, so nothing
  is interrupted. Slack invalidates the old secret immediately — save the new one right after regenerating it.
- **Different client id** = a different app. Only the connections issued by the old app must reconnect; the panel
  shows how many before you confirm. New Connects use the new app at once.
- **Revoke** stops Flowline using the secret immediately, fails closed (even if an old env var is still set) and sends
  the app's connections to reconnect. It can't recall requests already in progress, and it can't disable the secret at
  the provider: revoke it in the provider's console too. **Clear** then removes the configuration.
- A running web or worker process picks up every change on its next operation. No restart is needed.

## 2. A workspace's own OAuth app (workspace owner)

1. Open **Settings → OAuth apps** (owners only).
2. For Google, Slack or GitHub, enter your app's **Client ID** and **Client secret**, then **Save app**. Register the
   redirect URI shown on the card in your app.
3. New Connects in this workspace now use your app. Existing connections keep refreshing with the app that issued
   them.
4. Changing the client id, or **Remove**, sends exactly the connections issued by that app to reconnect (the count is
   shown first). They never move to Flowline's app silently.

## 3. Members

Before the provider opens, the Connect dialog says whose app will ask for consent: Flowline's app, or the workspace's
own app (with its client id and the owner who configured it). A workspace app may show a different name on the
provider's consent screen than "Flowline".

## If something fails

| What you see | Meaning |
|---|---|
| "…sign-in isn't configured by an administrator yet" | No app for this provider (or it was revoked). |
| A step fails with "…rejected the OAuth app's client credentials" | The **app's** secret is wrong or rotated at the provider. Connections stay active and flows keep their schedule; a platform admin is alerted. |
| "The OAuth app changed — reconnect it" | The connection's issuing app was switched, removed or revoked. |
| "Authorized before Flowline recorded its OAuth app — reconnect it" | A connection from before this release; see the runbook's backfill step. |
