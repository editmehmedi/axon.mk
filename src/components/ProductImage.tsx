"use client";

import { useEffect, useState } from "react";

type Props = {
  src: string;
  alt: string;
  /** square | wide | tall */
  ratio?: "square" | "wide" | "tall";
  className?: string;
  priority?: boolean;
};

const ratioClass = {
  square: "aspect-square",
  wide: "aspect-[4/3]",
  tall: "aspect-[3/4]",
};

/**
 * Consistent product photo frame: clipped so images never bleed into neighbors.
 */
export function ProductImage({ src, alt, ratio = "square", className = "" }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImg = Boolean(src) && !failed;

  return (
    <div
      className={`relative isolate overflow-hidden rounded-xl bg-white ${ratioClass[ratio]} ${className}`}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain p-2 transition duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] leading-snug text-black/40">
          {alt}
        </div>
      )}
    </div>
  );
}
