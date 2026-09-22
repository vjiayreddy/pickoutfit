import { Plus } from "lucide-react";

const QUESTIONS = [
  {
    question: "Do I need to buy new clothes?",
    answer:
      "Start with what you already own. Add photos of your clothes and WardrobeAI helps you find combinations in your wardrobe. You can also seed a free demo wardrobe to explore the tools.",
  },
  {
    question: "What if I only want the jacket in a photo?",
    answer:
      "Upload the photo, let WardrobeAI find the clothing, then choose exactly which pieces to keep. Scanning is free. Only the pieces you select are cut out, added to your wardrobe and charged.",
  },
  {
    question: "How do the try-ons work?",
    answer:
      "Add a photo of yourself, choose an outfit, and generate a preview of the look on you. It is an AI-generated styling preview, so fit, fabric and small details can differ from the real clothes.",
  },
  {
    question: "What happens if an image fails?",
    answer:
      "The credits for that image are refunded automatically. You can follow progress in the app, so you always know which images are ready and which are still processing.",
  },
] as const;

export function LandingFaq() {
  return (
    <div id="faq" className="mt-16 scroll-mt-16 grid gap-8 md:mt-24 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-mute">Before you get dressed</p>
        <h3 className="mt-4 font-display text-3xl font-medium uppercase leading-tight tracking-tight sm:text-4xl">
          A few good questions.
        </h3>
      </div>
      <div className="border-t border-hairline">
        {QUESTIONS.map((item) => (
          <details key={item.question} className="group border-b border-hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-sm font-medium [&::-webkit-details-marker]:hidden">
              {item.question}
              <Plus
                aria-hidden
                className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-45"
              />
            </summary>
            <p className="max-w-lg pr-8 pb-6 text-sm leading-relaxed text-mute">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
