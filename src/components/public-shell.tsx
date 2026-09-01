import { Newsletter } from "@/components/site-footer";

export function PublicShell({
  children,
  newsletter = true,
}: {
  children: React.ReactNode;
  newsletter?: boolean;
}) {
  return (
    <>
      {children}
      {newsletter ? <Newsletter /> : null}
    </>
  );
}
