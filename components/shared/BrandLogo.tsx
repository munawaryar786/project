import Image from "next/image";

type BrandLogoProps = {
  alt?: string;
  className?: string;
  imageClassName?: string;
  variant?: "light" | "dark";
};

export default function BrandLogo({
  alt = "Drivo",
  className = "",
  imageClassName = "",
  variant = "dark",
}: BrandLogoProps) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
      <Image
        src="/drivo-logo-transparent.png"
        alt={alt}
        width={320}
        height={167}
        className={`h-full w-full object-contain ${imageClassName}`}
      />
      {variant === "light" && (
        <span
          className="pointer-events-none absolute inset-0"
          style={{ clipPath: "inset(42% 0 0 0)" }}
          aria-hidden="true"
        >
          <Image
            src="/drivo-logo-transparent.png"
            alt=""
            width={320}
            height={167}
            className={`h-full w-full object-contain brightness-0 invert ${imageClassName}`}
          />
        </span>
      )}
    </span>
  );
}
