import Image from "next/image";

export function PageHero({
  title,
  description,
  image,
}: {
  title: string;
  description: string;
  image: string;
}) {
  return (
    <section className="page-hero">
      <Image src={image} alt="" fill priority sizes="100vw" />
      <div className="page-hero__wash" />
      <div className="site-container page-hero__content">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
