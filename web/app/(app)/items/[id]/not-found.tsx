import Link from "next/link";

export default function ItemNotFound() {
  return (
    <section className="mt-6">
      <h1 className="font-heading font-bold text-[26px] leading-[1.1] md:text-[32px]">No such item</h1>
      <p className="mt-3 text-[17px] text-ink-muted">Nothing tracked goes by that name. It may have been removed from the model.</p>
      <Link className="mt-6 inline-block bg-ink px-4 py-2 text-paper" href="/items">
        See every item
      </Link>
    </section>
  );
}
