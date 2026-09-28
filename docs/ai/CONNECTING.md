# Connecting an AI provider

Flowline runs AI on **your own provider account**. Nothing is configured on the server: each workspace owner adds
its keys in the app, and the provider bills that account directly.

## Steps (owner)

1. Open **Settings → AI Providers**.
2. Find the provider and choose **Add connection**. Only providers marked **Available** can be connected today
   (Wave A: OpenAI, Chat Completions). The others are listed as **Not available yet**.
3. Give the connection a **name**, paste the **API key**, and choose **Check and save**.
   - The key is checked by **listing the models** it can see. No paid request is made.
   - It is stored encrypted and bound to this connection. You won't see it again: the page shows only `••••` and the
     last four characters.
4. The models the key can see are listed on the connection. Choose **Refresh models** at any time. If a refresh fails,
   the previous list is kept and marked out of date.
5. Pick a **workspace default model**. AI steps without their own model use it, and so do agents and Copilot.
6. Decide **who may use** the connection. By default only owners may use it. Connecting a key doesn't give members
   access: tick **Editors** to let them pick it.
7. On an AI step, open **AI model** and search the picker. You can filter by capability, provider, cost information,
   context size, and removed models. Direct and gateway routes are labelled separately.

## Costs

- Prices come from your price table (**Settings → Usage & limits**, key `ai:<provider>/<model>`). An unknown price
  stays **unknown**; it is never assumed to be free.
- With a spending cap set, calls whose price is unknown are **refused before anything is sent**, unless the owner
  allows them under **AI Providers → Unknown prices**.
- **Send a paid test…** sends one tiny request, but only if you explicitly confirm it.

## Changing or removing a key

- **Replace key** checks the new key first. Everything uses it from the next call, with no restart. The dialog lists
  what uses the connection before you confirm.
- **Disconnect** deletes the key. Anything that used the connection fails with a clear error until you pick another
  model. Flowline never falls back to another key.

## What Flowline never does

- It never reads AI keys from server environment variables. It never uses a developer or platform key for your
  workspace.
- It never shows, logs or stores the key outside the encrypted connection. That covers run details, usage records,
  audit entries and the browser.
- It never runs local models. Older workspaces that used local Ollama keep their settings and are listed in a
  migration banner. See `MIGRATION.md`.
