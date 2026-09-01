export interface MlQuestion {
  id: number;
  item_id: string;
  seller_id: number;
  status: string;
  text: string;
}

export interface MlItem {
  id: string;
  title: string;
  description?: string;
  price?: number;
  available_quantity?: number;
  attributes?: Array<{ id: string; name: string; value_name: string }>;
  shipping?: {
    free_shipping?: boolean;
    mode?: string;
  };
  warranty?: string;
}

export interface ProductContext {
  itemId: string;
  title: string;
  description: string;
  attributes: string;
  price: number | null;
  availableQuantity: number | null;
  shipping: string;
  warranty: string | null;
}

export function formatProductContext(item: MlItem): ProductContext {
  const attributes = (item.attributes ?? [])
    .map((attr) => `${attr.name}: ${attr.value_name}`)
    .join("; ");

  const shippingParts: string[] = [];
  if (item.shipping?.free_shipping) {
    shippingParts.push("Frete grátis");
  }
  if (item.shipping?.mode) {
    shippingParts.push(`Modo: ${item.shipping.mode}`);
  }

  return {
    itemId: item.id,
    title: item.title,
    description: item.description ?? "",
    attributes,
    price: item.price ?? null,
    availableQuantity: item.available_quantity ?? null,
    shipping: shippingParts.join(", ") || "Não informado",
    warranty: item.warranty ?? null,
  };
}

export function productContextToPrompt(context: ProductContext): string {
  return [
    `Título: ${context.title}`,
    `Descrição: ${context.description}`,
    `Atributos: ${context.attributes || "Não informado"}`,
    `Preço: ${context.price ?? "Não informado"}`,
    `Estoque: ${context.availableQuantity ?? "Não informado"}`,
    `Frete: ${context.shipping}`,
    `Garantia: ${context.warranty ?? "Não informado"}`,
  ].join("\n");
}
