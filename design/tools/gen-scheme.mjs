// Prints the M3 tonal palettes behind the colour tokens in popup/popup.css and pages/pages.css.
// Dev tool only; the extension does not use it. Needs @material/material-color-utilities
// (Apache-2.0). The package uses extensionless imports, so bundle it first:
//   mkdir /tmp/mcu && cd /tmp/mcu && npm i @material/material-color-utilities esbuild
//   npx esbuild <this file> --bundle --platform=node --format=esm --outfile=gen.out.mjs && node gen.out.mjs
import { TonalPalette, Hct, argbFromHex, hexFromArgb } from '@material/material-color-utilities';
const seed = Hct.fromInt(argbFromHex('#4338CA'));            // OwnTape indigo: tone 34.6, chroma 68.9
const show = (name, p, tones) => console.log(name.padEnd(16), tones.map((t) => `${t}:${hexFromArgb(p.tone(t))}`).join(' '));
show('primary', TonalPalette.fromHct(seed), [10, 20, 30, 35, 80, 90, 95]);
show('neutral', TonalPalette.fromHueAndChroma(seed.hue, 6), [4, 6, 10, 12, 17, 22, 90, 92, 94, 96, 98]);
show('neutral-variant', TonalPalette.fromHueAndChroma(seed.hue, 8), [30, 50, 60, 80]);
// Custom colour groups, NOT harmonized to the seed (red must stay red).
show('rec  #C81E1E', TonalPalette.fromHct(Hct.fromInt(argbFromHex('#C81E1E'))), [20, 30, 40, 80, 90]);
show('warn #B7791F', TonalPalette.fromHct(Hct.fromInt(argbFromHex('#B7791F'))), [30, 90]);
show('ok   #1E7B4A', TonalPalette.fromHct(Hct.fromInt(argbFromHex('#1E7B4A'))), [30, 40, 80, 90, 95]);
// Role mapping (M3 2025 tones): light primary T35 (= seed), on-primary white, primary-container T90,
// on-primary-container T30; dark primary T80, on-primary T20, container T30, on-container T90.
// Surfaces: neutral T98/100/96/94/92/90 (light), T6/4/10/12/17/22 (dark).
