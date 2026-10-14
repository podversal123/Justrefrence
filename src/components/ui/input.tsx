"use client";

import { useT } from "@/i18n/provider";
import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "cn";

const INPUT_CLASSES =
  "border-input file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm";

/** A password field with an eye button that shows or hides what was typed. */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const t = useT();
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative w-full">
      <InputPrimitive
        {...props}
        type={visible ? "text" : "password"}
        data-slot="input"
        className={cn(INPUT_CLASSES, "pr-9", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        disabled={props.disabled}
        aria-label={visible ? t("Hide password") : t("Show password")}
        aria-pressed={visible}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  if (type === "password") return <PasswordInput className={className} {...props} />;
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(INPUT_CLASSES, className)}
      {...props}
    />
  );
}

export { Input };
