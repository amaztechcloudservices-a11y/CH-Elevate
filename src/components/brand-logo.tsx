import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <Image
      className={className}
      src="/images/ch-elevate-logo.png"
      alt="CH Elevate Consultancy Limited"
      width={543}
      height={134}
      priority={priority}
      unoptimized
    />
  );
}
