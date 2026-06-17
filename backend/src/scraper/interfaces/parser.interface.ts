export interface ParsedProduct {
  name: string;
  price: number;
  currency: string;
  imageUrl?: string;
}

export interface IParser {
  parse(html: string, url: string): ParsedProduct | null;
}
