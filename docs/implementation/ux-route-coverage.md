# UI route coverage, 2026-10-01

This inventory describes source changes, not manual acceptance of every route. The automated catalogue inventory scans all source JSX and both complete JSON catalogues; it does not establish individual linguistic approval of every string.

| Surface | Changes in this pass |
| --- | --- |
| Global body | Four AR/EN × light/dark workflow backgrounds; pointer, click and document/nested scroll response; reduced-motion handling; Arabic/light defaults |
| Landing | Equal cards, sequential active states, scroll/click illustrations, query-parameter section navigation, translated metadata |
| Sign-in/up | Equal interactive explanatory cards, translated copy, shared control icons, platform ZITADEL entry when configured |
| Account email/recovery/deletion | Shared schema renderer with localized validation and actual existing API actions |
| Builder, company setup | Shared visible inputs/checkboxes/radio controls; existing editor interactions retained |
| Integrations, agents, workspace settings/SSO | Shared visible controls; provider secrets retain uncontrolled handling; optional workspace ZITADEL SSO |
| Onboarding, templates, run inspector | Translated clickable help disclosures and purposeful icons |
| Admin | Owner copy draft/preview/publish UI, protected bilingual overrides; platform identity configuration |
| Design system | Translated guide, shared schema playground with conditional field/local preview |
| Remaining workspace lists, knowledge, invitations, billing | Global tokens/background and existing shared primitives apply; specialized existing behavior preserved |

E2E additions cover landing card consistency, default language/theme, query navigation, background scenes/reduced motion, client controls, schema validation/preview, owner copy editing and local ZITADEL callbacks. Existing full browser suites remain required. Real ZITADEL tenant signup, Google configuration and live-provider verification require the owner's instance configuration; local fake-provider tests are not production proof.

Native file pickers and protected secret fields are intentional specialized controls. No claim is made that every route was individually redesigned, manually visited in both languages, or verified against a live provider.
