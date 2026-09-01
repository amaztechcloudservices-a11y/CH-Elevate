import { Newsletter, SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function PublicShell({
  children,
  newsletter = true,
}: {
  children: React.ReactNode;
  newsletter?: boolean;
}) {
  return (
    <>
      <SiteHeader dark />
      {children}
      {newsletter ? <Newsletter /> : null}
      <SiteFooter />
    </>
  );
}
