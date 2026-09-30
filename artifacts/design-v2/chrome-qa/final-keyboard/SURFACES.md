# Journey 9 individual surface results

Final checkpoint 20: `64e825709fb79ef8cffcb19c3f0791b940bf844f`. E/F exhaustively sweep cp16; G retests builder.tsx on cp18 (identical blob in cp20); H retests integration removal on cp20. All other product sources are byte-identical to cp16: see source-delta-cp16-cp20.json and REPORT.md. Every row links by session and 1-based JSON array position to checks.json.

226 recorded checks: 225 PASS, one invalid launcher attempt retained as raw FAIL. The invalid Arabic attempt opened the run row rather than navigation; `ar:phone-navigation-corrected-launcher` repeats the intended menu and passes. There is no unresolved product FAIL in the final lifecycle sweep.

For modal layers, forward/reverse Tab loops stay inside. Non-modal layers allow leaving; Escape is tested from inside the layer (outside focus belongs to the page). Menus use their own keyboard behavior. Surface activation uses Playwright keyboard Enter after focusing the real launcher. G additionally uses a pointer click to verify the mouse-selection regression. Focus labels omit input values.

| Record | Surface/check | Accessible name | Result | Evidence |
|---|---|---|---|---|
| session-e/1 | route:/ |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/2 | route:/sign-in |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/3 | route:/sign-up |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/4 | route:/forgot-password |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/5 | route:/reset-password |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/6 | route:/resend-verification |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/7 | route:/verify-email |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/8 | route:/invite/keyboard-invalid |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/9 | route:/account/delete |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/10 | route:/billing/checkout |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/11 | route:/admin/setup |  | PASS | Keyboard focus/Escape traversal; full-page form states, no app overlay. Invalid-token routes show their real invalid state. |
| session-e/12 | onboarding:three-page-wizard |  | PASS | Keyboard selected goal/template and completed. Full-page forms, no dialog. |
| session-e/13 | builder:node-drawer | Inbound lead | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/14 | builder:catalog | Add node | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/15 | builder:history | Version history | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/16 | builder:copilot | Copilot | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/17 | builder:run-dock | Run dock | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/18 | builder:publish | Triggers | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/19 | builder:triggers | Triggers | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/20 | integration:connect-0 | Connect Google Sheets | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/21 | integration:connect-1 | Connect Gmail | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/22 | integration:connect-2 | Connect Slack | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/23 | integration:connect-3 | Connect HubSpot | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/24 | integration:connect-4 | Connect Zendesk | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/25 | integration:connect-5 | Connect Airtable | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/26 | integration:connect-6 | Connect Snowflake | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/27 | integration:connect-7 | Connect GitHub | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/28 | integration:connect-8 | Connect Stripe | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/29 | integration:connect-9 | Connect Notion | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/30 | integration:connect-10 | Connect PostgreSQL | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/31 | integration:connect-11 | Connect Linear | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/32 | integration:reconnect-0 | Reconnect Google Sheets | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/33 | integration:remove-0 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/34 | integration:reconnect-1 | Reconnect Gmail | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/35 | integration:remove-1 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/36 | integration:reconnect-2 | Reconnect Slack | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/37 | integration:remove-2 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/38 | integration:reconnect-3 | Reconnect HubSpot | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/39 | integration:remove-3 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/40 | integration:reconnect-4 | Reconnect Zendesk | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/41 | integration:remove-4 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/42 | integration:reconnect-5 | Reconnect Airtable | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/43 | integration:remove-5 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/44 | integration:reconnect-6 | Reconnect Snowflake | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/45 | integration:remove-6 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/46 | integration:reconnect-7 | Reconnect GitHub | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/47 | integration:remove-7 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/48 | integration:reconnect-8 | Reconnect Stripe | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/49 | integration:remove-8 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/50 | integration:reconnect-9 | Reconnect Notion | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/51 | integration:remove-9 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/52 | integration:reconnect-10 | Reconnect PostgreSQL | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/53 | integration:remove-10 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/54 | integration:reconnect-11 | Reconnect Linear | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/55 | integration:remove-11 | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/56 | integration:reconnect-fixture-scope |  | PASS | Twelve connection LIST entries supplied via Playwright route, real app dialogs exercised, no provider submission. Persisted removal separately checked. |
| session-e/57 | ai:connect-0 | Connect OpenAI | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/58 | ai:connect-1 | Connect Anthropic | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/59 | ai:connect-2 | Connect Google Gemini API | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/60 | ai:connect-3 | Connect xAI | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/61 | ai:connect-4 | Connect Groq | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/62 | ai:connect-5 | Connect OpenRouter | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/63 | ai:connect-6 | Connect Mistral AI | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/64 | ai:connect-7 | Connect Cohere | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/65 | ai:connect-8 | Connect DeepSeek | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/66 | ai:connect-9 | Connect Z.ai (GLM) | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/67 | ai:connect-10 | Connect Moonshot AI (Kimi) | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/68 | ai:connect-11 | Connect MiniMax | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/69 | ai:connect-12 | Connect Alibaba Cloud Model Studio | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/70 | ai:connect-13 | Connect Cerebras | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/71 | ai:connect-14 | Connect Together AI | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/72 | ai:connect-15 | Connect Fireworks AI | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/73 | ai:connect-16 | Connect DeepInfra | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/74 | ai:connect-17 | Connect Hugging Face Inference Providers | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/75 | ai:connect-18 | Connect Cloudflare Workers AI | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/76 | ai:connect-19 | Connect Vercel AI Gateway | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/77 | settings:Members:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/78 | settings:Members:native-select-1 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/79 | settings:Members |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/80 | settings:General:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/81 | settings:General |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/82 | settings:AI Providers:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/83 | settings:AI Providers:native-select-1 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/84 | settings:AI Providers:native-select-2 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/85 | settings:AI Providers:native-select-3 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/86 | settings:AI Providers:native-select-4 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/87 | settings:AI Providers:native-select-5 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/88 | settings:AI Providers:native-select-6 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/89 | settings:AI Providers:native-select-7 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/90 | settings:AI Providers:native-select-8 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/91 | settings:AI Providers:native-select-9 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/92 | settings:AI Providers:native-select-10 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/93 | settings:AI Providers:native-select-11 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/94 | settings:AI Providers |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/95 | settings:API keys:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/96 | settings:API keys:native-select-1 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/97 | settings:API keys |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/98 | settings:Plan & billing |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/99 | settings:Usage & limits |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/100 | settings:Audit log |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/101 | settings:SSO:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/102 | settings:SSO |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/103 | settings:OAuth apps |  | PASS | Section keyboard activation and native picker Escape; inline page, no modal. |
| session-e/104 | oauth:google:remove | Remove this workspace app? Connections it issued stop working and must reconnect (they never move to Flowline's app silently). | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/105 | oauth:google:switch | A different client ID is a different app: connections issued by the current one must reconnect. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/106 | oauth:google:removed-focus |  | PASS | See JSON assertion |
| session-e/107 | oauth:slack:remove | Remove this workspace app? Connections it issued stop working and must reconnect (they never move to Flowline's app silently). | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/108 | oauth:slack:switch | A different client ID is a different app: connections issued by the current one must reconnect. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/109 | oauth:slack:removed-focus |  | PASS | See JSON assertion |
| session-e/110 | oauth:github:remove | Remove this workspace app? Connections it issued stop working and must reconnect (they never move to Flowline's app silently). | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/111 | oauth:github:switch | A different client ID is a different app: connections issued by the current one must reconnect. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/112 | oauth:github:removed-focus |  | PASS | See JSON assertion |
| session-e/113 | knowledge:inline-delete | Confirm delete | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/114 | knowledge:removed-focus |  | PASS | See JSON assertion |
| session-e/115 | keys:inline-revoke | Confirm revoke | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/116 | keys:revoked-focus |  | PASS | See JSON assertion |
| session-e/117 | members:inline-remove | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/118 | members:removed-focus |  | PASS | See JSON assertion |
| session-e/119 | integration:persisted-remove | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/120 | integration:removed-focus |  | PASS | See JSON assertion |
| session-e/121 | runs:desktop-details | step-panel | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/122 | runs:rerun | Re-run #1 from “Hot lead” | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/123 | runs:phone-sheet | Lead Qualifier · run #1 | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/124 | shell:phone-navigation | Workspace navigation | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/125 | ar:runs-phone-sheet | Lead Qualifier · التشغيل #1 | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/126 | ar:phone-navigation | Lead Qualifier · التشغيل #1 | INVALID ATTEMPT (raw FAIL) | modal; initial=true; Tab outside=false; Escape=true; return=false; body loss=false |
| session-e/127 | shell:account-menu | KFKeyboard final | PASS | menu; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/128 | flows:create-copilot | Copilot | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/129 | guide:dialog-0 | Dialog title | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/130 | guide:drawer-0 | Drawer title | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/131 | guide:menu-0 | Menu | PASS | menu; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/132 | guide:popover-0 |  | PASS | nonmodal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/133 | guide:dialog-1 | Dialog title | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/134 | guide:drawer-1 | Drawer title | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/135 | guide:menu-1 | Menu | PASS | menu; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/136 | guide:popover-1 |  | PASS | nonmodal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/137 | guide:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/138 | guide:native-select-1 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/139 | ar:phone-navigation-corrected-launcher | التنقّل في مساحة العمل | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/140 | ai:Replace key | Replace the key of "Keyboard AI" | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/141 | ai:Send a paid test… | Send a paid test request | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/142 | ai:Disconnect | Disconnect "Keyboard AI"? | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/143 | ai:connected-pickers:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/144 | ai:connected-pickers:native-select-1 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/145 | ai:connected-pickers:native-select-2 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/146 | ai:connected-pickers:native-select-3 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/147 | ai:connected-pickers:native-select-4 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/148 | ai:connected-pickers:native-select-5 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/149 | ai:connected-pickers:native-select-6 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/150 | ai:connected-pickers:native-select-7 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/151 | ai:connected-pickers:native-select-8 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/152 | ai:connected-pickers:native-select-9 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/153 | ai:connected-pickers:native-select-10 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/154 | ai:connected-pickers:native-select-11 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/155 | agents:new:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/156 | agents:new:native-select-1 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/157 | agents:new:native-select-2 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/158 | agents:new:native-select-3 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/159 | agents:new:native-select-4 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/160 | agent:Chat |  | PASS | Inline tab/page, no overlay controls. |
| session-e/161 | agent:Configuration:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/162 | agent:Configuration:native-select-1 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/163 | agent:Configuration:native-select-2 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/164 | agent:Configuration:native-select-3 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/165 | agent:Configuration:native-select-4 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-e/166 | agent:Configuration |  | PASS | Inline tab/page, no overlay controls. |
| session-e/167 | agent:Runs |  | PASS | Inline tab/page, no overlay controls. |
| session-e/168 | templates:catalog |  | PASS | Template cards are page actions; no dialog/menu/side panel. |
| session-e/169 | publish:trigger.webhook | Triggers | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/170 | publish:rotate-cancel-reset |  | PASS | See JSON assertion |
| session-e/171 | publish:trigger.schedule | Triggers | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/172 | builder:node-width-1024 | Inbound leadSuccess | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/173 | builder:node-width-375 | Inbound leadSuccess | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-e/174 | builder:issues | Flow issues | PASS | nonmodal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-e/175 | cleanup:session-e |  | PASS | AI connection disconnected; key revoked; member removed; OAuth apps removed; signed out. Synthetic workflow records retained in test DB. |
| session-f/1 | admin:setup-mfa-keyboard |  | PASS | Real disposable grant/enrollment/step-up through UI keyboard; secrets memory-only, no captures. |
| session-f/2 | admin:revoke:signin.google | Revoke Google sign-in? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/3 | admin:revoke:signin.github | Revoke GitHub sign-in? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/4 | admin:revoke:integration.google | Revoke Google (Gmail, Sheets)? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/5 | admin:revoke:integration.slack | Revoke Slack? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/6 | admin:revoke:integration.github | Revoke GitHub? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/7 | admin:revoke:email.resend | Revoke Resend? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/8 | admin:revoke:email.postmark | Revoke Postmark? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/9 | admin:revoke:billing.paddle.sandbox | Revoke Paddle sandbox API key? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/10 | admin:revoke:billing.paddle.sandbox.webhook | Revoke Paddle sandbox webhook secret? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/11 | admin:revoke:billing.stripe.test | Revoke Stripe test-mode key? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/12 | admin:revoke:billing.stripe.test.webhook | Revoke Stripe test-mode webhook secret? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/13 | admin:clear:signin.google | Clear Google sign-in? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/14 | admin:clear:signin.github | Clear GitHub sign-in? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/15 | admin:clear:integration.google | Clear Google (Gmail, Sheets)? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/16 | admin:clear:integration.slack | Clear Slack? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/17 | admin:clear:integration.github | Clear GitHub? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/18 | admin:clear:email.resend | Clear Resend? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/19 | admin:clear:email.postmark | Clear Postmark? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/20 | admin:clear:billing.paddle.sandbox | Clear Paddle sandbox API key? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/21 | admin:clear:billing.paddle.sandbox.webhook | Clear Paddle sandbox webhook secret? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/22 | admin:clear:billing.stripe.test | Clear Stripe test-mode key? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/23 | admin:clear:billing.stripe.test.webhook | Clear Stripe test-mode webhook secret? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/24 | admin:settings:native-select-0 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-f/25 | admin:settings:native-select-1 |  | PASS | Native select: Escape preserves value=true; return=true |
| session-f/26 | admin:credential-fixture-scope |  | PASS | All eleven real credential cards exercised in configured/revoked LIST states via route fulfillment; Escape only. Actual GitHub credential mutation separately verified. |
| session-f/27 | admin:real-revoke | Revoke GitHub? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/28 | admin:revoked-focus |  | PASS | See JSON assertion |
| session-f/29 | admin:real-clear | Clear GitHub? The configuration is removed; the security log keeps the record. | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/30 | admin:cleared-focus |  | PASS | See JSON assertion |
| session-f/31 | admin:access-revoke | Revoke platform admin access for [synthetic-test-account]? | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-f/32 | admin:self-revoke |  | PASS | Keyboard confirmed self-revocation; full document navigation to ordinary 404, privileged UI gone, API404. Document navigation starts a new focus lifecycle. |
| session-f/33 | admin:cleanup |  | PASS | Disposable credential revoked and cleared; own admin access revoked; signed out. Setup/TOTP values never recorded. |
| session-g/1 | builder:keyboard-node | Normalise lead | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-g/2 | builder:keyboard-reopen-selected-node | Normalise lead | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-g/3 | builder:pointer-keeps-node-focus |  | PASS | See JSON assertion |
| session-g/4 | builder:escape-input-retains-selection-nudge |  | PASS | See JSON assertion |
| session-g/5 | builder:keyboard-node-width-1024 | Inbound lead | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-g/6 | builder:keyboard-node-width-375 | Inbound lead | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-g/7 | builder:catalog | Add node | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-g/8 | builder:history | Version history | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-g/9 | builder:copilot | Copilot | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-g/10 | builder:run-dock | Run dock | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-g/11 | builder:publish | Triggers | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-g/12 | builder:triggers | Triggers | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-h/1 | integration:connect | Connect Google Sheets | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-h/2 | integration:reconnect | Reconnect Google Sheets | PASS | modal; initial=true; Tab outside=false; Escape=true; return=true; body loss=false |
| session-h/3 | en:integration-remove | Confirm remove | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-h/4 | en:integration-success-focus |  | PASS | See JSON assertion |
| session-h/5 | ar:integration-remove | تأكيد الإزالة | PASS | nonmodal; initial=true; Tab outside=true; Escape=true; return=true; body loss=false |
| session-h/6 | ar:integration-success-focus |  | PASS | See JSON assertion |
