import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
export default function NotFound() { return <><SiteHeader dark /><main className="not-found"><p>404</p><h1>That page has moved or no longer exists.</h1><Link className="button button--accent" href="/">Return home</Link></main><SiteFooter /></>; }
