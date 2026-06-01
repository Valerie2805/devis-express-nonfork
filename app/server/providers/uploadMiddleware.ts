import multer from 'multer'

export function uploadSingle(fieldName: string) {
  return multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single(fieldName)
}

