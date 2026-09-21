import type { ReportItem } from "../types";

export function MediaItemCard({ item }: { item: ReportItem }) {
  return (
    <div className="media-item">
      <div className="media-item__logo" aria-hidden="true" />
      <div className="media-item__body">
        <a className="media-item__title" href={item.url} target="_blank" rel="noreferrer">
          {item.titulo}
        </a>
        <p className="media-item__meta">
          <em>
            {item.medio} {item.fecha}
          </em>
        </p>
        {item.autor && <p className="media-item__author">{item.autor}</p>}
      </div>
    </div>
  );
}
