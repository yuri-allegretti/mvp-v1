import type { DetectedFormat } from "../types";

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function detectFileType(buffer: Buffer): DetectedFormat {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buffer.subarray(0, 8).equals(OLE_SIGNATURE)) return "xls";

  const hasZipSignature =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
  if (hasZipSignature) {
    const binary = buffer.toString("latin1");
    if (binary.includes("[Content_Types].xml") && binary.includes("xl/workbook.xml")) {
      return "xlsx";
    }
  }

  return "unknown";
}
