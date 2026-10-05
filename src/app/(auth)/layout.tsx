import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <Logo size={40} withWordmark />
        <p className="text-muted-foreground max-w-xs text-sm">{BRAND.tagline}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
