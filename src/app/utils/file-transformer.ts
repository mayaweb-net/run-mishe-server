export interface IUploadedFile {
  buffer: Buffer;
  mimetype?: string;
  filename?: string;
}

export interface IMultipartResult {
  file: IUploadedFile | null;
  fields: Record<string, string>;
}

export type MultipartPart = {
  toBuffer: () => Promise<Buffer>;
  mimetype: string;
  filename: string;
  fields?: Record<string, { value?: unknown } | Array<{ value?: unknown }>>;
};

export async function toUploadedFile(
  part: MultipartPart,
): Promise<IUploadedFile> {
  const buffer = await part.toBuffer();
  return {
    buffer,
    mimetype: part.mimetype,
    filename: part.filename,
  };
}

export function getMultipartFields(
  part: MultipartPart,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(part.fields ?? {})) {
    const item = Array.isArray(v) ? v[0] : v;
    if (item && typeof item === 'object' && 'value' in item) {
      const val = item.value;
      if (typeof val === 'string') {
        fields[k] = val;
      } else if (
        typeof val === 'number' ||
        typeof val === 'boolean' ||
        typeof val === 'bigint'
      ) {
        fields[k] = String(val);
      }
    }
  }
  return fields;
}
