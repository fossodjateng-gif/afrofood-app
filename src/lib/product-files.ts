export const MAX_PRODUCT_FILE_BYTES = 4_000_000;
export type ProductFileKind = "image" | "pdf";
export type ProductFileAsset = { pathname: string; version: string; contentType: string; size: number };
export function productFileUrl(productId: string, kind: ProductFileKind, version?: string) {
  return `/api/product-files/${encodeURIComponent(productId)}/${kind}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}
