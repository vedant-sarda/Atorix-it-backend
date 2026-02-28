import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';
import path from 'path';

export async function uploadToCloudinary(fileBuffer, fileName, mimeType) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    const isPdf = mimeType === 'application/pdf';
    const uniqueName = fileName.replace(/\.[^/.]+$/, ''); // strip extension

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: isPdf ? 'image' : 'raw', // PDFs → image, DOC/DOCX → raw
        folder: 'resumes',
        public_id: `${uniqueName}.${ext}`,
        type: 'upload',
        use_filename: false,
        overwrite: false,
        ...(isPdf && { flags: 'attachment:false' }), // inline delivery for PDFs
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
}