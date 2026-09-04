# Report fonts

PDFs embed these locally bundled static TrueType fonts. Browser typography continues to use the existing Fontsource WOFF2 packages. Static TTF avoids a compound-glyph subsetting failure in fontkit's WOFF2 decoder; no runtime font download or machine-installed font is needed.

| File | Pinned upstream source | SHA-256 |
| --- | --- | --- |
| Manrope-Regular.ttf | [Manrope](https://github.com/aaronbell/manrope/blob/6f81ebecdf65e4463b798cc07b16a4f8d5216917/fonts/ttf/manrope-regular.ttf) | 2d9a9960fd191a7f1d9060768818074dd2b76ba84a64a35efd2c22bf39030903 |
| Sora-Regular.ttf | [Sora](https://github.com/sora-xor/sora-font/blob/7f9a9c5d0ccd1c099cfac420aa27133df1c5fdc4/fonts/ttf/Sora-Regular.ttf) | 517e945dedbeeb8d700ccae77d189a6ef2a01f6dcc95ba5d032ef9a30f7f0de9 |

Both are unmodified OFL 1.1 fonts; accompanying copyright/license files must remain with redistribution. Only font binaries were retrieved, no upstream scripts were executed. Character coverage is checked before rendering: unsupported characters produce an actionable error instead of missing or substituted participant names.

`@pdf-lib/fontkit` is pinned to 1.1.1. Its registry metadata, package scripts, UMD entrypoint and transitive dependency were reviewed before installation with `pnpm install --ignore-scripts`. Package integrity is recorded in `pnpm-lock.yaml`; this was not a cryptographic signature audit.
