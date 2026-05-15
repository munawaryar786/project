import Image from "next/image";

type BrandLogoProps = {
  alt?: string;
  className?: string;
  imageClassName?: string;
};

export default function BrandLogo({
  alt = "Drivo",
  className = "",
  imageClassName = "",
}: BrandLogoProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
      <Image
        src="/drivo-logo.jpeg"
        alt={alt}
        width={320}
        height={167}
        className={`h-full w-full object-contain ${imageClassName}`}
      />
    </span>
  );
}
