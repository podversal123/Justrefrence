"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HeroSlide } from "@/lib/brand";
import { useT } from "@/i18n/provider";

const ROTATE_MS = 7000;

/**
 * Homepage banner: full-bleed photo slides carrying the client's headlines,
 * cross-fading on a timer. Deliberately minimal: photo, headline, supporting
 * line, one button and previous/next arrows.
 *
 * Accessibility: no auto-advance for reduced motion; pauses while hovered or
 * focused (WCAG 2.2.2); photos are decorative.
 */
export function HeroStage({ slides }: { slides: readonly HeroSlide[] }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const go = useCallback(
    (next: number) => setIndex((next + slides.length) % slides.length),
    [slides.length],
  );

  const autoplay = !hovering && !reducedMotion;
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, slides.length]);

  const slide = slides[index]!;
  const Heading = index === 0 ? "h1" : "h2";
  const external = /^https?:/i.test(slide.cta.href);
  const ctaClass = buttonVariants({
    size: "touch",
    className: "mt-6 px-6 text-base",
  });
  const control =
    "flex size-9 items-center justify-center rounded-sm border border-white/40 bg-black/30 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none";

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("Justreference highlights")}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
      className="bg-ink relative isolate overflow-hidden text-white"
    >
      {slides.map((s, i) => (
        <div
          key={s.id}
          aria-hidden="true"
          className={cn(
            "absolute inset-0 -z-20 transition-opacity duration-1000 motion-reduce:transition-none",
            i === index ? "opacity-100" : "opacity-0",
          )}
        >
          <Image
            src={s.image}
            alt=""
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ))}
      {/* Scrim: dark enough behind the text, photo stays vivid on the right. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/40 to-black/5"
      />

      <div className="mx-auto flex min-h-[22rem] w-full max-w-7xl flex-col justify-center px-4 py-12 sm:min-h-[24rem] lg:min-h-[26rem]">
        <div aria-live={autoplay ? "off" : "polite"} className="max-w-2xl">
          <Heading
            key={slide.id}
            className="animate-in fade-in text-3xl leading-tight font-medium text-balance duration-500 motion-reduce:animate-none sm:text-4xl lg:text-5xl"
          >
            {t(slide.headline)}
          </Heading>
          {slide.subline ? (
            <p
              key={`${slide.id}-sub`}
              className="animate-in fade-in mt-3 max-w-xl text-lg leading-relaxed text-white/90 duration-500 motion-reduce:animate-none"
            >
              {t(slide.subline)}
            </p>
          ) : null}
          {external ? (
            <a href={slide.cta.href} target="_blank" rel="noopener noreferrer" className={ctaClass}>
              {t(slide.cta.label)}
              <ArrowRight />
            </a>
          ) : (
            <Link href={slide.cta.href as Route} className={ctaClass}>
              {t(slide.cta.label)}
              <ArrowRight />
            </Link>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto flex w-full max-w-7xl justify-end gap-2 px-4 pb-4">
          <button type="button" onClick={() => go(index - 1)} className={control}>
            <ChevronLeft className="size-5" />
            <span className="sr-only">{t("Previous slide")}</span>
          </button>
          <button type="button" onClick={() => go(index + 1)} className={control}>
            <ChevronRight className="size-5" />
            <span className="sr-only">{t("Next slide")}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
