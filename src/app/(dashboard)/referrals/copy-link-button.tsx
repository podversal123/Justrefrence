"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Input value={link} readOnly className="font-mono text-xs" />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard API may be unavailable (e.g. non-HTTPS) — the link is still selectable/copyable manually.
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
