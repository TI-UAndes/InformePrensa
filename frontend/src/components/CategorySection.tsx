import type { CategoryGroup } from "../types";
import { MediaItemCard } from "./MediaItemCard";

export function CategorySection({ group }: { group: CategoryGroup }) {
  return (
    <section className="category-section">
      <div className="category-section__header">
        <h2 className="category-section__title">{group.category}</h2>
        <span className="category-section__count">{group.items.length}</span>
      </div>
      {group.items.map((item) => (
        <MediaItemCard key={item.url} item={item} />
      ))}
    </section>
  );
}
