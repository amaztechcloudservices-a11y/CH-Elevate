import Link from "next/link";
export default function NotFound() { return <main className="not-found"><p>404</p><h1>That page has moved or no longer exists.</h1><Link className="button button--accent" href="/">Return home</Link></main>; }
