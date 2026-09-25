const STEPS = [
  {
    number: "01",
    title: "Bring your wardrobe in",
    body: "Upload a photo and choose the pieces you want to keep. Scanning is free; selected items cost a credit to extract.",
  },
  {
    number: "02",
    title: "Find your next combination",
    body: "Build an outfit yourself, or ask Eve for a combination using the clothes already in your wardrobe.",
  },
  {
    number: "03",
    title: "See it on you",
    body: "Preview the look on your fitting photo, then save it to your lookbook.",
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="scroll-mt-20 border-t border-hairline bg-canvas px-4 py-16 text-ink sm:px-8 md:py-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-medium tracking-wide text-mute uppercase">
              From camera roll to ready to go
            </p>
            <h2
              id="how-heading"
              className="mt-3 max-w-xl font-display text-4xl leading-[0.95] font-medium tracking-tight md:text-5xl"
            >
              Great style starts with what you own.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-mute md:pb-1 md:text-right">
            Three simple steps. A whole new way to get dressed.
          </p>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
          {STEPS.map((step) => (
            <li key={step.number} className="flex flex-col bg-soft-cloud p-6 md:p-7">
              <p className="font-mono text-[10px] tracking-widest text-mute uppercase">{step.number}</p>
              <h3 className="mt-8 text-lg font-medium tracking-tight">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mute">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
