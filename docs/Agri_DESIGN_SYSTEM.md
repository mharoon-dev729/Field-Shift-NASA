# Agri — Design System

## Color Palette — Premium Agricultural Technology

These colors are refined from the suggested palette for a sophisticated, cohesive appearance:

| Variable | Hex | Usage |
|---|---|---|
| `--agri-primary` | `#2F7650` | Primary actions, navigation accents |
| `--agri-primary-dark` | `#20563A` | Hover states, active items |
| `--agri-soft-green` | `#E8F3E9` | Subtle backgrounds, section dividers |
| `--agri-mint` | `#DDF1E2` | Success states, mild highlights |
| `--agri-background` | `#F7FAF5` | Page background |
| `--agri-surface` | `#FFFFFF` | Card surfaces, modals |
| `--agri-text` | `#1F3026` | Primary body text |
| `--agri-secondary-text` | `#718076` | Secondary/metadata text |
| `--agri-border` | `#E5ECE4` | Input borders, dividers |
| `--agri-risk` | `#C0392B` | Unavailable/critical warnings |
| `--agri-success` | `#27AE60` | Available/positive states |
| `--agri-neutral` | `#95A5A6` | Disabled/neutral states |

## Typography

- **Font family**: System font stack for maximum compatibility and performance
  - `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`
- **Base size**: 16px (default browser)
- **Heading hierarchy**:
  - `h1`: 2rem, font-weight 600, line-height 1.25
  - `h2`: 1.75rem, font-weight 600, line-height 1.3
  - `h3`: 1.5rem, font-weight 600, line-height 1.4
  - `h4`: 1.25rem, font-weight 600, line-height 1.4
- **Body**: 1rem, line-height 1.6
- **Small text**: 0.875rem, line-height 1.5
- **Monospaced**: UI monospace for numbers/technical values

## Sparkline / Chart Style

- Stroke: `currentColor` with opacity 0.8
- Fill: none
- Figure background: transparent
- Figcaption: 0.75rem, color `var(--agri-secondary-text)`
- SVG viewBox: `0 0 300 56`

## Component Styling Conventions

- **Cards**: `background: var(--agri-surface)`, border `1px solid var(--agri-border)`, border-radius `8px`, padding `1.5rem`
- **Alert variants**:
  - `error`: border `2px solid var(--agri-risk)`, background `#FDF2F2`
  - `warning`: border `2px solid #E67E22`, background `#FEF9E7`
  - `info`: border `2px solid var(--agri-primary)`, background `#EBF5FB`
  - `success`: border `2px solid var(--agri-success)`, background `#F0FDF4`
- **Button styling**:
  - Primary: `background: var(--agri-primary)`, color `var(--agri-surface)`, border-radius `6px`, padding `0.875rem 1.5rem`, font-weight 500, hover `background: var(--agri-primary-dark)`, transition `background 0.2s ease`
  - Secondary: `background: transparent`, color `var(--agri-primary)`, border `1px solid var(--agri-primary)`, same padding/radius, hover `background: var(--agri-primary-dark)`
  - Neutral: `background: var(--agri-surface)`, color `var(--agri-text)`, border `1px solid var(--agri-border)`, hover `background: var(--agri-soft-green)`
- **Input/Field**: `background: var(--agri-surface)`, border `1px solid var(--agri-border)`, border-radius `6px`, padding `0.75rem 1rem`, font-size `1rem`, color `var(--agri-text)`, focus ring `0 0 0 3px var(--agri-primary)`, transition `border-color 0.2s ease`
- **Select**: Same border as input, appearance none, padding right 2rem + custom arrow icon
- **Badge**: `padding 0.25rem 0.75rem`, border-radius `4px`, font-size 0.75rem, font-weight 500
- **Progressive disclosure**: Elements hidden by default, revealed on interaction

## Data Presentation Rules (Non-Negotiable)

- Missing values: `NOT_AVAILABLE = "Not available"` — never rendered as `0`
- Quality flags: Always visible when present, shown in muted small text
- Source provenance: Visible but de-emphasized compared to values
- Spatial resolution caveat: Always shown approximately ("~50 km cell")
- Climate vs current: Clearly distinguished with dataClass labels
- GIBS imagery: Labeled "visual context only; not used in comparison"
- No fabricated observations, no zero-fill, no hidden unavailable data

## Animation Policy

- All transitions: `0.2s ease` default
- `prefers-reduced-motion` respected: reduced to instant/fade-only
- Hover states: subtle background color change or border change
- Press states: 0.95 scale transform
- Page transitions: 0.3s crossfade
- Selection feedback: 0.15s scale + color change
- Loading indicators: Spinner with ARIA status, no meaningful content animation

## Icon Library

- **Primary**: Lucide React (tree-shakeable, consistent style)
- **Set**: `LucideIcon` components for: Map, Location, Weather, Rain, Soil, Water, Crop, Priority, Evidence, Comparison, Sources, Retry, Close, Check, ArrowDown, ArrowUp
- SVG paths are the standard Lucide shapes — no custom icon design needed

## Empty States

- Always have an illustration or meaningful graphic
- Include a friendly headline
- Provide a clear next-action callout
- Use `var(--agri-soft-green)` background or `var(--agri-mint)` accent
- Never just "No data" without explanation

## Spatial Resolution Disclaimer (Persistent)

Displayed in small muted text near the top of every evidence/comparison screen:
> "Environmental values describe the area around your farm (NASA POWER ~50 km grid). Soil is a digital prediction, not a field test."

This stays visible across all states as a constant, honest reminder.