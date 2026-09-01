import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { posts, projects, services } from "@/lib/site-data";

export function ServicesCollection() {
  return (
    <div className="collection-list">
      {services.map((service, index) => (
        <Link href={`/services/${service.slug}`} key={service.slug}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div><h2>{service.title}</h2><p>{service.description}</p></div>
          <ArrowRight aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

export function ProjectsCollection() {
  return (
    <div className="project-grid">
      {projects.map((project) => (
        <article key={project.slug}>
          <Link className="project-image" href={`/projects/${project.slug}`}>
            <Image src={project.image} alt="" fill sizes="(max-width: 800px) 100vw, 50vw" />
          </Link>
          <p className="article-meta">{project.category}</p>
          <h2><Link href={`/projects/${project.slug}`}>{project.title}</Link></h2>
          <p>{project.summary}</p>
          <Link className="text-link" href={`/projects/${project.slug}`}>
            View case study <ArrowRight aria-hidden="true" />
          </Link>
        </article>
      ))}
    </div>
  );
}

export function InsightsCollection() {
  return (
    <div className="article-grid article-grid--archive">
      {[...posts, ...posts].map((post, index) => (
        <article key={`${post.slug}-${index}`}>
          <Link href={`/insights/${post.slug}`} className="article-image">
            <Image src={post.image} alt="" fill sizes="(max-width: 800px) 100vw, 33vw" />
          </Link>
          <p className="article-meta">{post.category} · {post.date}</p>
          <h2><Link href={`/insights/${post.slug}`}>{post.title}</Link></h2>
          <p>{post.excerpt}</p>
          <Link className="text-link" href={`/insights/${post.slug}`}>
            Read article <ArrowRight aria-hidden="true" />
          </Link>
        </article>
      ))}
    </div>
  );
}
