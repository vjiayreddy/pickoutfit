const STEPS = [
  {
    number: "01",
    title: "Digitize your clothes",
    body: "Upload a photo. Choose which pieces to keep. Scanning is free — only selected items cost a credit to extract.",
  },
  {
    number: "02",
    title: "Build outfits with Eve",
    body: "Ask your stylist for looks from pieces you already own, or assemble outfits yourself in the builder.",
  },
  {
    number: "03",
    title: "Try them on",
    body: "Preview outfits on your avatar. Save favourites to the lookbook and share when you’re ready.",
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="scroll-mt-16 bg-canvas px-4 py-16 text-ink sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <p className="text-sm font-medium uppercase tracking-wide text-mute">The experience</p>
        <h2
          id="how-heading"
          className="mt-3 max-w-2xl font-display text-4xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl"
        >
          From camera roll to ready to go.
        </h2>
        <ol className="mt-12 grid gap-10 border-t border-hairline pt-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((step) => (
            <li key={step.number} className="space-y-4">
              <p className="font-mono text-xs tracking-widest text-mute uppercase">{step.number}</p>
              <h3 className="text-xl font-medium tracking-tight">{step.title}</h3>
              <p className="max-w-sm text-sm leading-relaxed text-mute">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/editorial-woman.webp"
            alt="Editorial styling reference"
            className="aspect-[4/5] w-full object-cover"
          />
          <div className="flex flex-col justify-end gap-6 bg-soft-cloud p-8 sm:p-10">
            <p className="font-display text-3xl font-medium uppercase leading-[0.95] tracking-tight sm:text-4xl">
              Your clothes.
              <br />A fresh point of view.
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-mute">
              Eve only styles from your wardrobe — never invented garments — so every suggestion is
              something you can actually wear.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
