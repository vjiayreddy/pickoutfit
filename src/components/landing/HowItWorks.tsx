import { ChevronRight } from "lucide-react";

const PHOTO = "/images/try-on/user-before.webp";
const LOOK = "/images/try-on/user-after.webp";
const OUTFIT = "/images/try-on/outfit-reference.webp";

const PIECES = [
  { src: "/images/try-on/shirt.webp", label: "Shirt" },
  { src: "/images/try-on/trousers.webp", label: "Trousers" },
  { src: "/images/try-on/shoes.webp", label: "Shoes" },
] as const;

const STEPS = [
  {
    number: "01",
    title: "Bring your wardrobe in",
    body: "Upload a photo and choose the pieces you want to keep. Scanning is free; selected items cost a credit to extract.",
    graphic: "extract",
  },
  {
    number: "02",
    title: "Find your next combination",
    body: "Build an outfit yourself, or ask Eve for a combination using the clothes already in your wardrobe.",
    graphic: "combine",
  },
  {
    number: "03",
    title: "See it on you",
    body: "Preview the look on your fitting photo, then save it to your lookbook.",
    graphic: "preview",
  },
] as const;

type GraphicId = (typeof STEPS)[number]["graphic"];

function PieceTile({ src, label }: { src: string; label: string }) {
  return (
    <figure className="flex min-h-0 min-w-0 flex-col bg-canvas">
      <img src={src} alt="" className="min-h-0 w-full flex-1 object-contain p-1.5" />
      <figcaption className="pb-1.5 text-center text-[11px] font-medium">{label}</figcaption>
    </figure>
  );
}

function Portrait({ src, label }: { src: string; label: string }) {
  return (
    <figure className="relative min-h-0 min-w-0 overflow-hidden bg-canvas">
      <img src={src} alt="" className="h-full w-full object-cover object-top" />
      <figcaption className="absolute inset-x-2 top-2 mx-auto w-fit rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium">
        {label}
      </figcaption>
    </figure>
  );
}

function ExtractGraphic() {
  return (
    <div className="grid h-full grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2">
      <Portrait src={PHOTO} label="Your photo" />
      <div className="grid min-h-0 grid-rows-3 gap-2">
        {PIECES.map((piece) => (
          <PieceTile key={piece.label} src={piece.src} label={piece.label} />
        ))}
      </div>
    </div>
  );
}

function CombineGraphic() {
  return (
    <figure className="relative h-full bg-canvas">
      <img src={OUTFIT} alt="" className="h-full w-full object-contain p-3" />
      <figcaption className="absolute top-2 left-2 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium ring-1 ring-hairline">
        One outfit
      </figcaption>
    </figure>
  );
}

function PreviewGraphic() {
  return (
    <div className="grid h-full grid-cols-2 gap-2">
      <Portrait src={PHOTO} label="Before" />
      <Portrait src={LOOK} label="After" />
    </div>
  );
}

function StepGraphic({ id }: { id: GraphicId }) {
  if (id === "extract") return <ExtractGraphic />;
  if (id === "combine") return <CombineGraphic />;
  return <PreviewGraphic />;
}

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
          <p className="max-w-xs text-base leading-relaxed text-ink md:pb-1 md:text-right">
            Three simple steps. A whole new way to get dressed.
          </p>
        </div>
        <ol className="mt-12 grid list-none gap-4 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.number} className="flex flex-col bg-soft-cloud">
              <div className="relative h-80 border-b border-hairline p-3 sm:h-[22rem]">
                <StepGraphic id={step.graphic} />
                {index < STEPS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -right-3 z-10 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-canvas md:flex"
                  >
                    <ChevronRight className="size-3.5" strokeWidth={2} />
                  </span>
                ) : null}
              </div>
              <div className="flex h-12 items-center gap-2 border-b border-hairline px-6">
                {step.graphic === "extract" ? (
                  <span className="text-xs font-medium text-mute">Photo in, pieces out</span>
                ) : null}
                {step.graphic === "combine" ? (
                  <>
                    <span className="inline-flex h-7 items-center rounded-full border border-hairline bg-canvas px-3 text-xs font-medium">
                      You build it
                    </span>
                    <span className="inline-flex h-7 items-center rounded-full bg-ink px-3 text-xs font-medium text-canvas">
                      Eve suggests
                    </span>
                  </>
                ) : null}
                {step.graphic === "preview" ? (
                  <span className="text-xs font-medium text-mute">The same photo, in the outfit</span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col p-6 md:p-7">
                <p className="font-mono text-[10px] tracking-[0.16em] text-mute uppercase">{step.number}</p>
                <h3 className="mt-4 text-lg font-medium tracking-tight">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-mute">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
