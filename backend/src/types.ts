export type Category = "Sitio Web" | "Televisión" | "Prensa Escrita" | "Radio";

export interface MediaConfig {
  domain: string;
  name: string;
  category: Category;
}

export interface DiscoveredUrl {
  url: string;
  discoveredDate: string;
}

export interface ReportItem {
  medio: string;
  titulo: string;
  url: string;
  fecha: string;
  autor: string;
}

export interface CategoryGroup {
  category: Category;
  items: ReportItem[];
}

export interface ReportError {
  medio: string;
  motivo: string;
}

export interface ReportResponse {
  from: string;
  to: string;
  categories: CategoryGroup[];
  errors: ReportError[];
}
