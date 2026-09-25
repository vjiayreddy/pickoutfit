/** Prepared demonstration assets. Paths are public URLs. */
export const TRY_ON_ASSETS = {
  phoneFrame: "/images/try-on/phone-frame.png",
  userBefore: "/images/try-on/user-before.webp",
  outfitReference: "/images/try-on/outfit-reference.webp",
  shirt: "/images/try-on/shirt.webp",
  trousers: "/images/try-on/trousers.webp",
  shoes: "/images/try-on/shoes.webp",
  userAfter: "/images/try-on/user-after.webp",
} as const;

export type TryOnAssetKey = keyof typeof TRY_ON_ASSETS;

/**
 * Screen opening as a percentage of phone-frame.png, including its transparent padding.
 * Keep in sync with scripts/generate-phone-frame.ts.
 */
export const PHONE_FRAME = {
  width: 932,
  height: 1792,
  screen: {
    top: 4.129464285714286,
    left: 7.939914163090128,
    width: 84.12017167381974,
    height: 91.74107142857143,
    radiusX: 12.244897959183673,
    radiusY: 5.839416058394161,
  },
} as const;

export const TRY_ON_DIMENSIONS = {
  userBefore: { width: 720, height: 1280 },
  userAfter: { width: 720, height: 1280 },
  outfitReference: { width: 864, height: 1152 },
  shirt: { width: 819, height: 831 },
  trousers: { width: 508, height: 905 },
  shoes: { width: 932, height: 536 },
} as const;

export const GARMENT_CARDS = [
  {
    id: "shirt",
    label: "Shirt",
    src: TRY_ON_ASSETS.shirt,
    width: TRY_ON_DIMENSIONS.shirt.width,
    height: TRY_ON_DIMENSIONS.shirt.height,
    className: "top-[8%] left-[1%] w-[25%] max-sm:top-[6%] max-sm:left-0 max-sm:w-[23%]",
  },
  {
    id: "trousers",
    label: "Trousers",
    src: TRY_ON_ASSETS.trousers,
    width: TRY_ON_DIMENSIONS.trousers.width,
    height: TRY_ON_DIMENSIONS.trousers.height,
    className: "top-[34%] right-[1%] w-[25%] max-sm:top-[32%] max-sm:right-0 max-sm:w-[23%]",
  },
  {
    id: "shoes",
    label: "Shoes",
    src: TRY_ON_ASSETS.shoes,
    width: TRY_ON_DIMENSIONS.shoes.width,
    height: TRY_ON_DIMENSIONS.shoes.height,
    className: "bottom-[5%] left-[4%] w-[24%] max-sm:bottom-[3%] max-sm:left-[1%] max-sm:w-[22%]",
  },
] as const;

const MALE_PIECE = { width: 1024, height: 1024 } as const;

/** Two demonstration looks. The hero plays female, then male, then repeats. */
export const TRY_ON_LOOKS = [
  {
    id: "female",
    userBefore: TRY_ON_ASSETS.userBefore,
    userAfter: TRY_ON_ASSETS.userAfter,
    outfit: TRY_ON_ASSETS.outfitReference,
    userSize: TRY_ON_DIMENSIONS.userBefore,
    afterSize: TRY_ON_DIMENSIONS.userAfter,
    outfitSize: TRY_ON_DIMENSIONS.outfitReference,
    pieces: GARMENT_CARDS.map((card) => ({
      id: card.id,
      label: card.label,
      src: card.src,
      width: card.width,
      height: card.height,
    })),
  },
  {
    id: "male",
    userBefore: "/images/try-on/male-before.webp",
    userAfter: "/images/try-on/male-after.webp",
    outfit: "/images/try-on/male-outfit.webp",
    userSize: { width: 720, height: 1280 },
    afterSize: { width: 720, height: 1280 },
    outfitSize: { width: 864, height: 1152 },
    pieces: [
      { id: "shirt", label: "Shirt", src: "/images/try-on/male-shirt.webp", ...MALE_PIECE },
      { id: "trousers", label: "Trousers", src: "/images/try-on/male-trousers.webp", ...MALE_PIECE },
      { id: "shoes", label: "Shoes", src: "/images/try-on/male-shoes.webp", ...MALE_PIECE },
    ],
  },
] as const;

export type TryOnLookId = (typeof TRY_ON_LOOKS)[number]["id"];

export const TRY_ON_SOURCES = [
  TRY_ON_ASSETS.phoneFrame,
  ...TRY_ON_LOOKS.flatMap((look) => [
    look.userBefore,
    look.userAfter,
    look.outfit,
    ...look.pieces.map((piece) => piece.src),
  ]),
];
