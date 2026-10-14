"use client";

import { useT } from "@/i18n/provider";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { AlertCircle, ImagePlus, Loader2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  uploadListingImageAction,
  deleteListingImageAction,
} from "@/server/services/catalog-actions";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import type { CatalogKind } from "@/server/domain/catalog/types";

export interface CatalogImage {
  id: string;
  storagePath: string;
}

const MAX_IMAGES = 8;

/**
 * Client-side upload UI for catalog images — see the Phase 3 brief's
 * "ImageUploader" reusable-component and "secure file upload" / "optimize
 * images" requirements. All real validation/re-encoding happens server-side
 * (src/server/lib/image-upload.ts); this component's own file-type/size
 * check is a fast-feedback convenience only, never the security boundary.
 */
export function ImageUploader({
  kind,
  itemId,
  images,
}: {
  kind: CatalogKind;
  itemId: string;
  images: CatalogImage[];
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = images.length >= MAX_IMAGES;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;

    setError(null);

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Images must be ${MAX_UPLOAD_LABEL} or smaller.`);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }

    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("itemId", itemId);
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadListingImageAction(undefined, formData);
      if (!result.success) setError(t(result.error.message));
    });
  }

  function handleDelete(imageId: string) {
    setError(null);
    setDeletingId(imageId);
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("imageId", imageId);
    startTransition(async () => {
      const result = await deleteListingImageAction(undefined, formData);
      if (!result.success) setError(t(result.error.message));
      setDeletingId(null);
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((image) => (
          <div
            key={image.id}
            className="group relative aspect-square overflow-hidden rounded-lg border"
          >
            <Image
              src={catalogImagePublicUrlClient(image.storagePath)}
              alt=""
              fill
              className="object-cover"
              sizes="200px"
            />
            <button
              type="button"
              onClick={() => handleDelete(image.id)}
              disabled={pending}
              aria-label={t("Remove image")}
              className="bg-background/90 text-foreground absolute top-1.5 right-1.5 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
            >
              {deletingId === image.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
            </button>
          </div>
        ))}

        {!atLimit ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="text-muted-foreground hover:border-foreground/40 hover:text-foreground flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs disabled:opacity-50"
          >
            {pending && deletingId === null ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ImagePlus className="size-5" />
            )}
            {t("Add image")}
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      <p className="text-muted-foreground text-xs">
        {t("{count} / {max} images · JPEG, PNG, or WebP, up to {size} each.", {
          count: images.length,
          max: MAX_IMAGES,
          size: MAX_UPLOAD_LABEL,
        })}
      </p>
    </div>
  );
}
