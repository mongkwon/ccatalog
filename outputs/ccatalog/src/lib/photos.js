import {
  PHOTO_MAX_SOURCE_BYTES,
  PHOTO_MAX_DIMENSION,
  PHOTO_JPEG_QUALITY,
} from "./domain.js";

async function prepareRestaurantPhoto(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/"))
    throw new Error("photo_type_invalid");
  if (file.size > PHOTO_MAX_SOURCE_BYTES)
    throw new Error("photo_file_too_large");

  const imageSource = await decodePhotoFile(file);
  const sourceWidth = Number(imageSource.width || imageSource.naturalWidth);
  const sourceHeight = Number(imageSource.height || imageSource.naturalHeight);
  if (!sourceWidth || !sourceHeight) {
    imageSource.close?.();
    throw new Error("photo_decode_failed");
  }

  const scale = Math.min(
    1,
    PHOTO_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight),
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    imageSource.close?.();
    throw new Error("photo_decode_failed");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(imageSource, 0, 0, width, height);
  imageSource.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY),
  );
  if (!blob) throw new Error("photo_decode_failed");
  return blob;
}

async function decodePhotoFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari can decode some camera formats through an image element but not createImageBitmap.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("photo_decode_failed"));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export { prepareRestaurantPhoto };
