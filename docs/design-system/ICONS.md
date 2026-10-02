# Icon use

FlowLine uses Lucide for interface icons. Reuse the existing `NAV_ICONS`, `NODE_ICONS`, and
`CATEGORY_ICONS` mappings from `src/components/ui/icons.tsx` for navigation, canvas nodes, and node
categories. Import a Lucide icon directly for a small, component-specific action or meaning that is
not part of those registries; do not create a second icon set or add decorative icons without a
clear purpose.

Icons that sit beside visible text should be hidden from assistive technology with `aria-hidden`.
Keep the text as the accessible name. Give icon-only controls an accessible name through their
existing label or an `aria-label`. Use the semantic color tokens and logical layout utilities already
used by the surrounding component.
