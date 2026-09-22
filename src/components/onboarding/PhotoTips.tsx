"use client";

const TIPS = [
  "Stand full-length facing the camera, arms relaxed.",
  "Even daylight or soft indoor light — avoid harsh shadows on your face.",
  "Plain background if you can. Leave space above your head and below your shoes.",
];

export function PhotoTips() {
  return (
    <div className="space-y-4 bg-soft-cloud p-6">
      <p className="text-sm font-medium text-ink">Photo tips</p>
      <ul className="space-y-3 text-sm leading-relaxed text-mute">
        {TIPS.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-ink" aria-hidden />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
