# HireD frontend design references

Start with the [UI/UX specification](../docs/ui-ux-specification.md) and [application workflows](../docs/workflows.md), then use these references to build the admin portal, business portal and driver mobile app.

| File | Purpose |
| --- | --- |
| [Shared CSS tokens](shared/tokens.css) | Colours, typography, spacing, radii and control sizes extracted from the designs |
| [Admin implementation guide](admin/README.md) | Admin screens, components and action rules |
| [Business implementation guide](business/README.md) | Business screens, company scope and trip/statement rules |
| [Admin screen index](admin/screens.json) | All 102 designed screens with dimensions and available reference paths |
| [Driver mobile app guide](mobile/README.md) | Driver onboarding, trip execution, expenses, closure and earnings |
| [Mobile screen index](mobile/screens.json) | Driver screens, priorities, reference sizes and image paths |
| [Business screen index](business/screens.json) | All 64 designed screens with dimensions and available reference paths |

Each design's `references/` folder contains one full-size image per available screen. PNG is preferred when both PNG and SVG exports existed; SVG is retained for additional screens and states. A `null` reference in the index means no local image is available. Use the specification or the saved Penpot design for those states.

For web apps, import `shared/tokens.css` into the frontend's global stylesheet entry and use its custom properties in components. The font file is not bundled; configure Inter in the application and retain the system fallback. For the mobile app, map these design values into the framework’s theme/style system. Screen images are implementation references and should not replace interactive React UI.

Build shared primitives for the shell/navigation, buttons, status badges, fields, metrics, filters, tables, record cards, dialogs/drawers, empty states and error notices. Keep portal-specific routes, permissions and API commands separate. Use semantic controls with labels and visible keyboard focus; status labels must accompany colours.

Desktop references use a 1440 px canvas. Responsive examples use 768, 390 and 320 px widths. These are reference widths, not prescribed CSS breakpoints. Let content determine layout changes: collapse navigation, wrap actions, turn wide operational rows into record cards and keep financial totals visible. Allow vertical scrolling instead of fixing pages to screenshot heights. Use 48 px touch targets and 16 px input text on narrow layouts. Format amounts in INR and operational dates in IST.

The design examples contain synthetic data. The HireD wordmark is a typographic placeholder. Use the workflow contracts for API behaviour and state transitions; screenshot values and prototype journeys are not backend logic. Exact failure retry/lockout policy comes from the server.
