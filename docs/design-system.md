# Design system

## Colour

Colours are tokens defined once at the top of [`src/styles.css`](../src/styles.css). Components never use literals.

| Token | Role |
|---|---|
| `--rta-red` `#c8102e` | Brand band, primary buttons, section rules |
| `--rta-red-deep` `#9b0a22` | Band edge, hover |
| `--rta-navy` `#0b3c6e` | Decisions, accent |
| `--rta-charcoal`, `--rta-grey` | Text and neutral surfaces |
| `--metro-red`, `--tram-teal` | Asset badges |

The values approximate the public RTA identity. Replace them with the codes in the official Corporate Identity Manual and every component follows, in light, dark and print.

Status colours are **separate from the brand** so that meaning never competes with identity:

| Meaning | Colour |
|---|---|
| On track | green |
| At risk | amber (dark text for contrast) |
| Delayed, overdue | red |
| Needs a decision | navy |
| Waiting for others | slate |

Status is never carried by colour alone: every state also has a label.

## Themes

Light, dark and system. The choice is stored per device. Dark mode uses its own tokens, with lighter brand text so links and hovers keep contrast on dark surfaces. Print forces the light palette and keeps the red band.

## Language and direction

English and Arabic are first-class. Switching language sets `lang` and `dir` on the document; layout uses logical properties (`inline-start`, `inline-end`) so nothing is mirrored by hand. The timeline mirrors its time axis for Arabic. Numbers stay Latin so figures match reports and spreadsheets.

## Typography

System font stack with Noto Naskh Arabic and Tahoma fallbacks, so there are no network font requests and the page works offline and under a strict Content Security Policy.

## Accessibility

Skip link, visible focus ring, keyboard access for every action including timeline bars, `aria-live` for confirmations, `prefers-reduced-motion` respected, status communicated by text as well as colour.

## Icons and images

`public/favicon.svg` is the source of the app icons. The two illustrations in `docs/assets/` are generated from `docs/assets/src/make-illustrations.mjs`, so they are reproducible and editable.
