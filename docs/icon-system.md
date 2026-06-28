# Icon system

MacroLeague uses [Lucide](https://lucide.dev/) for interface and semantic icons.
Lucide provides a consistent 24×24 SVG grid, React Native support, tree-shakable
imports, and an ISC license suitable for commercial applications.

All Lucide usage is routed through `src/components/ui/AppIcon.tsx`, which gives
the product one controlled semantic vocabulary instead of platform-dependent
emoji. The CC0 pixel flame in `assets/game-art` remains the intentional exception
for animated streak moments.

Rules:

- Use Lucide outlines for navigation, settings, stats, empty states, and status.
- Use the pixel flame only for streak/fire identity.
- Use color semantically; do not introduce multicolor emoji or one-off icon sets.
- Store semantic icon keys in data (`meal`, `trophy`, `gift`), never Unicode emoji.

## Motion vocabulary

- `ElectricBolt` uses layered strokes and irregular pulses for XP.
- `RotatingTrophy` uses a perspective Y-axis turn while remaining anchored.
- `ClashingUtensils` animates separate fork and knife paths for meal totals.
- `PixelFlame` advances the sourced six-frame sprite for streaks.

All decorative icon loops respect the operating system's reduced-motion setting.
