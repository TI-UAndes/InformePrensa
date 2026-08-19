import type { CategoryGroup } from "../types";
import { MediaItemCard } from "./MediaItemCard";

export function CategorySection({ group }: { group: CategoryGroup }) {
  return (
    <section className="category-section">
      <h2 className="category-section__title">{group.category}</h2>
      {group.items.map((item) => (
        <MediaItemCard key={item.url} item={item} />
      ))}
    </section>
  );
}
