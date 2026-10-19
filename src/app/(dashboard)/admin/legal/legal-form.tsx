"use client";

import { useT } from "@/i18n/provider";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { updateLegalPagesAction } from "@/server/services/legal-actions";
import { LEGAL_PAGES, MAX_LEGAL_LENGTH } from "@/lib/legal-pages";
import type { LegalTexts } from "@/server/lib/legal-store";

export function LegalForm({ texts, canEdit }: { texts: LegalTexts; canEdit: boolean }) {
  const t = useT();
  return (
    <ActionForm
      action={updateLegalPagesAction}
      submitLabel={t("Save legal pages")}
      pendingLabel={t("Saving…")}
      successMessage={t("Legal pages saved")}
      resetOnSuccess={false}
    >
      {(errors) => (
        <fieldset disabled={!canEdit} className="space-y-8">
          {LEGAL_PAGES.map((page) => (
            <section key={page.slug} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">{t(page.title)}</h2>
                <span className="text-muted-foreground text-xs">
                  {texts[page.slug].trim()
                    ? t("Published at {path}", { path: page.path })
                    : t("Not published yet")}
                </span>
              </div>
              <FormField
                htmlFor={`legal-${page.slug}`}
                label={t("Text")}
                hint={t(
                  "Paste the final wording. A blank line starts a new paragraph. Leave this empty to keep the page unpublished.",
                )}
                error={errors[page.slug]}
              >
                <Textarea
                  id={`legal-${page.slug}`}
                  name={page.slug}
                  rows={12}
                  maxLength={MAX_LEGAL_LENGTH}
                  defaultValue={texts[page.slug]}
                />
              </FormField>
            </section>
          ))}
        </fieldset>
      )}
    </ActionForm>
  );
}
