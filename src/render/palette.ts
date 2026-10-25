// GENERATED from docs/art/palette.json by scripts/gen-palette.mjs. Do not edit by hand.
// Change docs/art/palette.json, then run `npm run palette`.
// This is the only file in src/ allowed to contain hex colour literals.

export const palette = {
  "name": "Mutation Garden: Seed Packet palette",
  "version": "0.1",
  "notes": "Hex values are sRGB. In three.js set ColorManagement on and pass these as sRGB (new Color('#hex') does this by default since r152). Ramps run light to dark.",
  "ink": {
    "press-ink": "#2B1E2E",
    "faded-ink": "#5E4A5C",
    "paper-cream": "#F7EEDB",
    "paper-white": "#FFF9EC",
    "misprint-tomato": "#E5482F"
  },
  "environment": {
    "sky-day": {
      "zenith": "#7FBEDC",
      "mid": "#B9DCE3",
      "horizon": "#F4E6C4"
    },
    "sky-dusk": {
      "zenith": "#3C4579",
      "mid": "#B8657F",
      "horizon": "#F3A55C"
    },
    "cloud": {
      "lit": "#FFF6E3",
      "shade": "#E6D3B8",
      "dusk-lit": "#FFD3A8",
      "dusk-shade": "#9C6A86"
    },
    "grass": [
      "#B8D35A",
      "#8DBA43",
      "#5F9638",
      "#3C6B35"
    ],
    "soil": [
      "#A65D38",
      "#874629",
      "#61321F",
      "#3B2018"
    ],
    "soil-wet": [
      "#7A3E25",
      "#5A2C1B",
      "#3F1F15"
    ],
    "island-rock": [
      "#E2BE8F",
      "#C0895D",
      "#8E5E4E",
      "#5E4256",
      "#3A2A3E"
    ],
    "water": [
      "#E6F5EC",
      "#6FCAC6",
      "#3FA6B2",
      "#26748A"
    ],
    "wood-crate": [
      "#E0B57A",
      "#B9844E",
      "#7E5333"
    ],
    "stall": {
      "awning": [
        "#F7EEDB",
        "#E5482F"
      ],
      "wood": [
        "#E0B57A",
        "#7E5333"
      ],
      "sign": "#FFF9EC"
    }
  },
  "plants": {
    "sunny-sprout": {
      "leaf": [
        "#CFE36A",
        "#9BCB45",
        "#62A034",
        "#386B2C"
      ],
      "stem": [
        "#C3D47A",
        "#88A84C",
        "#55743A"
      ],
      "fruit": [
        "#FFE896",
        "#FFC93E",
        "#F59A1E",
        "#C45F17"
      ],
      "accent": {
        "seed-face": "#8A4A1C"
      }
    },
    "bubble-berry": {
      "leaf": [
        "#A6E0C6",
        "#5FBF9F",
        "#2F8F7C",
        "#1B5D57"
      ],
      "stem": [
        "#C792B5",
        "#93577F",
        "#5E3157"
      ],
      "fruit": [
        "#FFC6DC",
        "#FF7FAC",
        "#E23B72",
        "#9E1F50"
      ],
      "accent": {
        "highlight": "#FFF1F6"
      }
    },
    "twistroot": {
      "leaf": [
        "#D3E3BE",
        "#9FC08F",
        "#668F68",
        "#3D5E48"
      ],
      "stem": [
        "#B9C99A",
        "#7F9A6A",
        "#4F6648"
      ],
      "fruit": [
        "#CDBBFF",
        "#9472F2",
        "#5E40C8",
        "#35237E"
      ],
      "accent": {
        "growth-ring": "#E8DEFF"
      }
    },
    "puffcap": {
      "leaf": [
        "#D8EDB8",
        "#A7CF86",
        "#709E61",
        "#426A49"
      ],
      "stem": [
        "#FFF0CC",
        "#E8D5AE",
        "#B99B78"
      ],
      "fruit": [
        "#FFD2A0",
        "#F39B65",
        "#C95E53",
        "#853D51"
      ],
      "accent": {
        "spots": "#FFF0CC"
      }
    }
  },
  "mutations": {
    "giant": {
      "tint": "#FF8A3D",
      "outline-scale": 1.5
    },
    "golden": {
      "base": "#F2BC45",
      "highlight": "#FFF2BF",
      "shadow": "#8C5A14",
      "sparkle": "#FFFBEA"
    },
    "glowing": {
      "core": "#F4FFB0",
      "emissive": "#B8F55A",
      "halo": "#7EE36A",
      "soil-ring": "#D9FF8A"
    },
    "crystal": {
      "body": "#CFF3FF",
      "attenuation": "#8FDDF5",
      "edge": "#FFFFFF",
      "deep": "#3D8FB8"
    },
    "rainbow": [
      "#FF5A4E",
      "#FFC23D",
      "#9BD94A",
      "#3FC1B5",
      "#4A6CF0",
      "#C65BD8"
    ]
  },
  "ui": {
    "background": "#F7EEDB",
    "panel": "#FFF9EC",
    "panel-sunk": "#EFE2C6",
    "border": "#2B1E2E",
    "text": "#2B1E2E",
    "text-muted": "#5E4A5C",
    "text-on-accent": "#FFF9EC",
    "accent": "#C93A24",
    "accent-pressed": "#A82E1C",
    "misprint-shadow": "#CDB28A",
    "coin": {
      "face": "#F2B632",
      "rim": "#C9861C",
      "emboss": "#FFE08A",
      "outline": "#2B1E2E"
    },
    "coin-text": "#7A4B0C",
    "success": "#2F7A3A",
    "warning": "#A8461A",
    "danger": "#B3261E",
    "focus-ring": "#3B5BDB"
  },
  "lighting": {
    "day": {
      "key": "#FFE7C4",
      "fill-sky": "#A9D3EA",
      "fill-ground": "#B98A62",
      "rim": "#FFF4D6"
    },
    "dusk": {
      "key": "#FFA36E",
      "fill-sky": "#6266A6",
      "fill-ground": "#7A4A4A",
      "rim": "#FFD7A8"
    },
    "blob-shadow": "#3A2A3E"
  }
} as const;

export type Palette = typeof palette;
