import { Logo } from "@/components/brand/logo";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { BRAND } from "@/lib/brand";
import { getT } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="bg-muted/40 relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <LanguageSwitch className="absolute top-4 right-4" />
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <Logo size={40} withWordmark />
        <p className="text-muted-foreground max-w-xs text-sm">{t(BRAND.tagline)}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
