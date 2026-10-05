import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getSiteSettings } from "@/server/lib/site-settings";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";
import { FeedbackForm } from "../feedback/feedback-form";

export const metadata: Metadata = {
  title: "Contact us",
  description: `Get in touch with ${BRAND.name}.`,
};

export default async function ContactPage() {
  const [settings, session] = await Promise.all([getSiteSettings(), getAuthSession()]);

  const details = [
    {
      icon: Mail,
      label: "Email",
      value: settings.contactEmail,
      href: `mailto:${settings.contactEmail}`,
    },
    {
      icon: Phone,
      label: "Phone",
      value: settings.contactPhone,
      href: `tel:${settings.contactPhone.replace(/[^0-9+]/g, "")}`,
    },
    { icon: MapPin, label: "Office", value: settings.contactAddress },
    { icon: Clock, label: "Working hours", value: settings.contactHours },
  ].filter((detail) => detail.value);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="mb-1">Contact us</h1>
      <p className="text-muted-foreground mb-10">
        {BRAND.name}, {BRAND.headquarters}. A person on our team reads every message.
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="contact-details" className="space-y-4">
          <h2 id="contact-details" className="text-base font-semibold">
            Reach us directly
          </h2>
          {details.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Use the form to send us a message and we&apos;ll reply by email. If you already have
              an account, you can also open a support ticket from your dashboard.
            </p>
          ) : (
            <ul className="space-y-4">
              {details.map((detail) => {
                const Icon = detail.icon;
                return (
                  <li key={detail.label} className="flex items-start gap-3">
                    <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="text-sm">
                      <p className="text-muted-foreground text-xs">{detail.label}</p>
                      {detail.href ? (
                        <a href={detail.href} className="font-medium hover:underline">
                          {detail.value}
                        </a>
                      ) : (
                        <p className="font-medium whitespace-pre-line">{detail.value}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 text-base font-semibold">Send us a message</h2>
            <FeedbackForm
              defaultName={session?.fullName ?? ""}
              defaultEmail={session?.email ?? ""}
              messageLabel="Your message"
              submitLabel="Send message"
              successMessage="Thank you — we've received your message"
              showRating={false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
