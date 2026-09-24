"use client";

import { useAction } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { DropZone, describeRejection, type FileRejection } from "@/components/upload/DropZone";
import { Button } from "@/components/ui/button";
import { useUpload } from "@/hooks/use-upload";
import { toClientError } from "@/lib/client-errors";
import { routes } from "@/lib/routes";

type GridResult = {
  boardUrl: string;
  columns: number;
  crops: Array<{ label: string; url: string }>;
  usage: {
    inputTextTokens: number;
    inputImageTokens: number;
    outputTokens: number;
    estimatedUsd: number;
  };
};

export function GridExtractDemo() {
  const extractGrid = useAction(api.gridDemo.extractGrid);
  const { upload, isUploading } = useUpload();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GridResult | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleDrop(accepted: File[], rejections: FileRejection[]) {
    setError(rejections[0] ? describeRejection(rejections[0]) : null);
    const next = accepted[0];
    if (!next) return;
    setFile(next);
    setResult(null);
  }

  async function handleExtract() {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    try {
      const storageId = await upload(file);
      const next = await extractGrid({ storageId });
      setResult(next);
    } catch (caught) {
      setError(toClientError(caught).message);
    } finally {
      setRunning(false);
    }
  }

  const busy = running || isUploading;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <AppHeaderTitle title="Grid demo" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          Cost demo
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:mt-2 sm:text-5xl">
          One call, every piece.
        </h1>
        <p className="mt-2 max-w-lg text-sm text-mute sm:mt-4 sm:text-base">
          Drop any outfit photo. The app detects the garments and accessories in it, then one image edit lays those pieces on a grid and crops them. Nothing is saved to your wardrobe.
        </p>
        <Link href={routes.add} className="mt-3 inline-block text-sm font-medium text-ink underline">
          Back to Add clothes
        </Link>
      </div>

      <DropZone
        onDrop={handleDrop}
        multiple={false}
        maxFiles={1}
        disabled={busy}
        size="lg"
        title="Drop an outfit photo"
        description="Shirts, jeans, shoes, sunglasses, jewellery, watches — whatever is actually worn."
        buttonLabel={busy ? "Working…" : "Choose photo"}
      />

      {previewUrl ? (
        <div className="flex items-end gap-4">
          <img
            src={previewUrl}
            alt="Selected photo"
            className="h-40 w-32 bg-soft-cloud object-cover"
          />
          <Button onClick={handleExtract} disabled={busy}>
            {busy ? "Extracting…" : "Extract grid"}
          </Button>
        </div>
      ) : null}

      {busy ? (
        <p className="text-sm text-mute">Detecting the pieces, then one image call. This usually takes 30–50 seconds.</p>
      ) : null}
      {error ? <p className="text-sm text-sale">{error}</p> : null}

      {result ? (
        <div className="space-y-6">
          <p className="text-sm font-medium text-ink">
            Estimated cost ${result.usage.estimatedUsd.toFixed(4)} · text {result.usage.inputTextTokens} · image in{" "}
            {result.usage.inputImageTokens} · image out {result.usage.outputTokens}
          </p>
          <figure>
            <img src={result.boardUrl} alt="Generated garment board" className="w-full max-w-xl bg-soft-cloud" />
            <figcaption className="mt-2 text-sm font-medium text-mute">
              One generated board · {result.crops.length} pieces
            </figcaption>
          </figure>
          <ul
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${result.columns}, minmax(0, 1fr))` }}
          >
            {result.crops.map((crop, index) => (
              <li key={`${crop.label}-${index}`}>
                <img src={crop.url} alt={crop.label} className="aspect-square w-full bg-soft-cloud object-contain" />
                <p className="mt-2 text-sm font-medium text-ink">{crop.label}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
