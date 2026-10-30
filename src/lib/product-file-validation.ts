import sharp from "sharp";
import { StaffAuthError } from "@/lib/staff-session-server";
import { MAX_PRODUCT_FILE_BYTES, type ProductFileKind } from "@/lib/product-files";

export async function validateProductFile(file: File, kind: ProductFileKind) {
  if (file.size < 1 || file.size > MAX_PRODUCT_FILE_BYTES) throw new StaffAuthError("product_file_size", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase();
  const type = file.type.toLowerCase();
  if (kind === "pdf") {
    if (ext !== "pdf" || type !== "application/pdf" || !/^%PDF-(1\.[0-7]|2\.0)[\r\n ]/.test(bytes.subarray(0, 16).toString("ascii"))
      || !/%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1"))) throw new StaffAuthError("product_file_type", 415);
    return { bytes, contentType: "application/pdf", extension: "pdf" };
  }
  const jpeg = (ext === "jpg" || ext === "jpeg") && type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = ext === "png" && type === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = ext === "webp" && type === "image/webp" && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (!jpeg && !png && !webp) throw new StaffAuthError("product_file_type", 415);
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if ((metadata.pages || 1) !== 1) throw new Error("animated");
    const optimized = await image.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    return { bytes: optimized, contentType: "image/webp", extension: "webp" };
  } catch { throw new StaffAuthError("product_file_type", 415); }
}
