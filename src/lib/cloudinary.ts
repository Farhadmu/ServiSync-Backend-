import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
  console.warn('Cloudinary credentials not configured. File uploads will fail.');
}

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: env.NODE_ENV === 'production',
});

export async function uploadToCloudinary(buffer: Buffer, filename: string, folder: string = 'servisync') {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: `servisync/${folder}`,
        resource_type: 'auto',
        filename_override: filename.replace(/\.[^/.]+$/, ''),
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    ).end(buffer);
  });
}

export default cloudinary;
