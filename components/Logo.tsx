import Image from "next/image";
import Link from "next/link";

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center bg-black rounded-lg shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo-mark.png"
        alt="BowPay"
        width={size}
        height={size}
        className="w-full h-full object-contain"
        priority
      />
    </div>
  );
}

export function LogoLockup({
  size = 34,
  textSize = "text-xl",
  href = "/",
}: {
  size?: number;
  textSize?: string;
  href?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`${textSize} font-semibold tracking-tight`}>
        <span className="text-neutral-900 dark:text-neutral-50">Bow</span>
        <span className="text-brand">Pay</span>
      </span>
    </Link>
  );
}
