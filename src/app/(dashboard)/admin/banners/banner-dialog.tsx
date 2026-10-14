"use client";

import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, ImagePlus, Pencil, Plus } from "lucide-react";
import { createBannerAction, updateBannerAction } from "@/server/services/banner-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FULL_ROW } from "@/components/ui/form-grid";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/provider";
import { msg } from "@/i18n/locales";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";
import type { ApiResult } from "@/lib/api-response";
import type { FieldErrors } from "@/components/ui/action-form";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

export interface EditableBanner {
  id: string;
  headline: string;
  subline: string | null;
  ctaLabel: string;
  ctaHref: string;
}

type Noun = "banner" | "ad";

/** The words that change with what is being added; written out whole so each one can be translated. */
const WORDS: Record<
  Noun,
  { add: string; addA: string; edit: string; saved: string; added: string }
> = {
  banner: {
    add: msg("Add banner"),
    addA: msg("Add a banner"),
    edit: msg("Edit banner"),
    saved: msg("Banner saved"),
    added: msg("Banner added"),
  },
  ad: {
    add: msg("Add ad"),
    addA: msg("Add an ad"),
    edit: msg("Edit ad"),
    saved: msg("Ad saved"),
    added: msg("Ad added"),
  },
};

type SaveAction = (prev: ApiResult<null>, formData: FormData) => Promise<ApiResult<null>>;

/** What differs between a home page banner and a vendor's ad; the form itself is the same. */
export interface BannerDialogOptions {
  /** "banner" or "ad": used in the button, title and messages. */
  noun?: Noun;
  createAction?: SaveAction;
  updateAction?: SaveAction;
  description?: string;
  /** Text under the photo field. */
  photoHint?: string;
  /** Shown after a save, e.g. to say an edited ad goes back for approval. */
  savedMessage?: string;
}

function SubmitButton({ editing, noun }: { editing: boolean; noun: Noun }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Saving…") : editing ? t("Save changes") : t(WORDS[noun].add)}
    </Button>
  );
}

/** Add a banner, or edit one. When editing, a new photo is optional: without one the current photo stays. */
export function BannerDialog({
  banner,
  options = {},
}: {
  banner?: EditableBanner;
  options?: BannerDialogOptions;
}) {
  const t = useT();
  const noun = options.noun ?? "banner";
  const createAction = options.createAction ?? createBannerAction;
  const updateAction = options.updateAction ?? updateBannerAction;
  const editing = Boolean(banner);
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (prev: ApiResult<null>, formData: FormData): Promise<ApiResult<null>> => {
      const result = await (editing ? updateAction : createAction)(prev, formData);
      if (result.success) {
        setOpen(false);
        toast.success(
          t(editing ? WORDS[noun].saved : WORDS[noun].added),
          options.savedMessage ? t(options.savedMessage) : undefined,
        );
      }
      return result;
    },
    initialState,
  );
  const submitted = state !== initialState;
  const errors: FieldErrors =
    submitted && !state.success
      ? ((state.error.details as { fieldErrors?: FieldErrors } | undefined)?.fieldErrors ?? {})
      : {};

  function checkFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && file.size > MAX_UPLOAD_BYTES) {
      event.target.setCustomValidity(
        t("This photo is too large. Use one up to {size}.", { size: MAX_UPLOAD_LABEL }),
      );
      event.target.reportValidity();
      event.target.value = "";
    } else {
      event.target.setCustomValidity("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          editing ? (
            <Button variant="outline" size="sm">
              <Pencil />
              {t("Edit")}
            </Button>
          ) : (
            <Button>
              <Plus />
              {t(WORDS[noun].add)}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-xl">
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t(editing ? WORDS[noun].edit : WORDS[noun].addA)}</DialogTitle>
            <DialogDescription>
              {t(
                options.description ??
                  "Shown on the home page. The words appear on the left of the photo, so choose a photo that is calm on that side.",
              )}
            </DialogDescription>
          </DialogHeader>

          {submitted && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{t(state.error.message)}</AlertDescription>
            </Alert>
          ) : null}

          {banner ? <input type="hidden" name="id" value={banner.id} /> : null}

          <FormGrid>
            <FormField
              htmlFor="bn-headline"
              label={t("Headline")}
              error={errors["headline"]}
              className={FULL_ROW}
            >
              <Input id="bn-headline" name="headline" defaultValue={banner?.headline} required />
            </FormField>
            <FormField
              htmlFor="bn-subline"
              label={t("Line below it (optional)")}
              error={errors["subline"]}
              className={FULL_ROW}
            >
              <Input id="bn-subline" name="subline" defaultValue={banner?.subline ?? ""} />
            </FormField>
            <FormField htmlFor="bn-cta" label={t("Button text")} error={errors["ctaLabel"]}>
              <Input
                id="bn-cta"
                name="ctaLabel"
                defaultValue={banner?.ctaLabel}
                placeholder={t("Browse products")}
                required
              />
            </FormField>
            <FormField
              htmlFor="bn-href"
              label={t("Button goes to")}
              hint={t("A page like /products, or a link starting with https://")}
              error={errors["ctaHref"]}
            >
              <Input
                id="bn-href"
                name="ctaHref"
                defaultValue={banner?.ctaHref}
                placeholder="/products"
                required
              />
            </FormField>
            <FormField
              htmlFor="bn-image"
              label={editing ? t("Replace the photo (optional)") : t("Photo")}
              hint={
                options.photoHint
                  ? t(options.photoHint)
                  : t("A wide photo at least 1200px across. JPEG, PNG or WebP, up to {size}.", {
                      size: MAX_UPLOAD_LABEL,
                    })
              }
              className={FULL_ROW}
            >
              <div className="flex items-center gap-2">
                <ImagePlus className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <input
                  id="bn-image"
                  name="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required={!editing}
                  onChange={checkFile}
                  className="file:bg-secondary file:text-secondary-foreground w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
              </div>
            </FormField>
          </FormGrid>

          <DialogFooter>
            <SubmitButton editing={editing} noun={noun} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
