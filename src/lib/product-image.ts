export const PRODUCT_IMAGE_FALLBACK = "/logo-afrofood.png";

export function getProductImageSource(imagePath?: string | null) {
  return imagePath?.trim() ? imagePath : PRODUCT_IMAGE_FALLBACK;
}
