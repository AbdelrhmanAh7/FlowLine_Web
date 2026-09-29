# Connecting an AI provider

Flowline runs AI on **your own provider account**. Nothing is configured on the server: each workspace owner adds
its keys in the app, and the provider bills that account directly.

## Steps (owner)

1. Open **Settings → AI Providers**.
2. Find the provider and choose **Add connection**. 20 providers can be connected (see `PROVIDERS.md`). Providers
   judged unsuitable (OpenCode Zen, Command Code, NVIDIA's trial catalogue) or deferred (Bedrock, Azure, Vertex) are
   listed with the reason and can't be connected.
3. Give the connection a **name**, paste the **API key**, fill in the provider's own fields if it has any, and choose
   **Check and save**:
   - Alibaba Model Studio needs the **region** and **workspace ID**.
   - Cloudflare needs the **account ID**.
   - OpenAI takes an optional organization or project.
   - For Z.ai, Moonshot, MiniMax and Alibaba, confirm the key is a **pay-as-you-go** API key. Their coding-plan keys
     are restricted to coding tools and can't be used.
   - Where the provider's model list needs the key, the key is checked by **listing the models** it can see. No paid
     request is made. OpenRouter's list is the public catalogue, so its key is checked with OpenRouter's free,
     authenticated key-information endpoint instead.
   - DeepInfra's and Vercel's model lists are **public**, and Z.ai and Alibaba have no model list at all (a dated
     catalogue is used). Listing models proves nothing about the key there, so the connection is saved as **Key not
     verified** until **Send a paid test…** succeeds. It is never shown as "Connected" before that.
   - It is stored encrypted and bound to this connection. You won't see it again. The page shows `••••` plus the last
     four characters for keys of 32 characters or more; for shorter keys it shows only the date the key was set.
4. The models the key can see are listed on the connection. Choose **Refresh models** at any time. If a refresh fails,
   the previous list is kept and marked out of date.
5. Pick a **workspace default model**. AI steps without their own model use it, and so do agents and Copilot.
6. Decide **who may use** the connection. By default only owners may use it. Connecting a key doesn't give members
   access: tick **Editors** to let them pick it.
7. On an AI step, open **AI model** and search the picker. You can filter by capability, provider, cost information,
   context size, and removed models. Direct and gateway routes are labelled separately.

## Costs and routing

- **Where prices come from:** your price table first (**Settings → Usage & limits**, key `ai:<provider>/<model>`),
  then Flowline's dated catalogue of official prices (the source link is in the picker). An unknown price stays
  **unknown**; it is never assumed to be free.
- **Spending cap:** with a cap set, calls whose price is unknown are **refused before anything is sent**, unless the
  owner allows them in the routing policy.
- **Routing policy:** under **AI Providers → Routing policy**, choose MANUAL, FALLBACK (explicitly listed backup
  routes), FREE_ONLY (verified zero prices only) or LOW_COST (the cheapest approved route under a price ceiling).
  Optionally add a no-training privacy rule and Copilot's planning and repair routes. See `ROUTING.md`.
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
