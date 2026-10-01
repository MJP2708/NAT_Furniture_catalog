/** NAT Furniture logo (cut from the company letterhead, transparent background). */
export function Logo({ className = "h-8" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small static brand mark
  return <img src="/brand/logo.png" alt="NAT Furniture" width={334} height={93} className={`w-auto ${className}`} />;
}
