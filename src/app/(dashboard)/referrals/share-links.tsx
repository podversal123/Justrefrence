import { getT } from "@/i18n/server";
import { Mail, MessageCircle, MessageSquareText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { buildShareLinks } from "@/lib/share-links";

/** Opens the member's own WhatsApp, email or SMS app with the referral link already in the message. */
export async function ShareLinks({ link }: { link: string }) {
  const t = await getT();
  const links = buildShareLinks({
    text: t("Join {name} with my referral link: {link}", { name: BRAND.name, link }),
    subject: t("Join {name}", { name: BRAND.name }),
  });
  const options = [
    { href: links.whatsapp, label: t("WhatsApp"), icon: MessageCircle, external: true },
    { href: links.email, label: t("Email"), icon: Mail, external: false },
    { href: links.sms, label: t("SMS"), icon: MessageSquareText, external: false },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ href, label, icon: Icon, external }) => (
        <a
          key={label}
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Icon />
          {t("Share on {channel}", { channel: label })}
        </a>
      ))}
    </div>
  );
}
