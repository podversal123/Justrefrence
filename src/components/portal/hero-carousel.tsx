"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HeroSlide } from "@/lib/brand";

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
  const control =
    "flex size-10 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Justreference highlights"
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
            style={
              i === index
                ? { animation: `hero-zoom ${ROTATE_MS + 2500}ms ease-out forwards` }
                : undefined
            }
          />
        </div>
      ))}
      {/* Light scrim: dark enough behind the text, photo stays vivid on the right. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/40 to-black/5"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-black/50 to-transparent"
      />

      <div className="mx-auto flex min-h-[30rem] w-full max-w-7xl flex-col justify-center px-4 pt-16 pb-24 sm:min-h-[34rem] lg:min-h-[36rem]">
        <div aria-live={autoplay ? "off" : "polite"} className="max-w-2xl">
          <Heading
            key={slide.id}
            className="font-display animate-in fade-in slide-in-from-bottom-2 text-4xl leading-[1.1] font-medium tracking-[-0.02em] text-balance duration-700 motion-reduce:animate-none sm:text-5xl lg:text-[3.5rem]"
          >
            {slide.headline}
          </Heading>
          {slide.subline ? (
            <p
              key={`${slide.id}-sub`}
              className="animate-in fade-in mt-5 max-w-xl text-lg leading-relaxed text-white/90 delay-150 duration-700 motion-reduce:animate-none sm:text-xl"
            >
              {slide.subline}
            </p>
          ) : null}
          <Link
            href={slide.cta.href}
            className={buttonVariants({
              size: "touch",
              className: "mt-8 px-6 text-base shadow-lg shadow-black/30",
            })}
          >
            {slide.cta.label}
            <ArrowRight />
          </Link>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto flex w-full max-w-7xl justify-end gap-2 px-4 pb-8">
          <button type="button" onClick={() => go(index - 1)} className={control}>
            <ChevronLeft className="size-5" />
            <span className="sr-only">Previous slide</span>
          </button>
          <button type="button" onClick={() => go(index + 1)} className={control}>
            <ChevronRight className="size-5" />
            <span className="sr-only">Next slide</span>
          </button>
        </div>
      </div>
    </section>
  );
}
