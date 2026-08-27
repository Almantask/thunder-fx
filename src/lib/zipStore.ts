const CRC_TABLE = new Uint32Array(256)

for (let i = 0; i < 256; i += 1) {
  let c = i
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[i] = c >>> 0
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ (data[i] ?? 0)) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}

export type ZipStoreFile = {
  name: string
  data: Uint8Array
}

export function buildZipStore(files: ZipStoreFile[]): ArrayBuffer {
  const encoded = files.map((file) => {
    const nameBytes = new TextEncoder().encode(file.name.replace(/\\/g, '/'))
    return { ...file, nameBytes, crc: crc32(file.data) }
  })
  let localSize = 0
  for (const file of encoded) {
    localSize += 30 + file.nameBytes.length + file.data.length
  }
  let centralSize = 0
  for (const file of encoded) {
    centralSize += 46 + file.nameBytes.length
  }
  const buffer = new ArrayBuffer(localSize + centralSize + 22)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let offset = 0
  const offsets: number[] = []

  for (const file of encoded) {
    offsets.push(offset)
    writeU32(view, offset, 0x04034b50)
    writeU16(view, offset + 4, 20)
    writeU16(view, offset + 6, 0)
    writeU16(view, offset + 8, 0)
    writeU16(view, offset + 10, 0)
    writeU16(view, offset + 12, 0)
    writeU32(view, offset + 14, file.crc)
    writeU32(view, offset + 18, file.data.length)
    writeU32(view, offset + 22, file.data.length)
    writeU16(view, offset + 26, file.nameBytes.length)
    writeU16(view, offset + 28, 0)
    bytes.set(file.nameBytes, offset + 30)
    bytes.set(file.data, offset + 30 + file.nameBytes.length)
    offset += 30 + file.nameBytes.length + file.data.length
  }

  const centralStart = offset
  for (let i = 0; i < encoded.length; i += 1) {
    const file = encoded[i]!
    writeU32(view, offset, 0x02014b50)
    writeU16(view, offset + 4, 20)
    writeU16(view, offset + 6, 20)
    writeU16(view, offset + 8, 0)
    writeU16(view, offset + 10, 0)
    writeU16(view, offset + 12, 0)
    writeU16(view, offset + 14, 0)
    writeU32(view, offset + 16, file.crc)
    writeU32(view, offset + 20, file.data.length)
    writeU32(view, offset + 24, file.data.length)
    writeU16(view, offset + 28, file.nameBytes.length)
    writeU16(view, offset + 30, 0)
    writeU16(view, offset + 32, 0)
    writeU16(view, offset + 34, 0)
    writeU16(view, offset + 36, 0)
    writeU32(view, offset + 38, 0)
    writeU32(view, offset + 42, offsets[i] ?? 0)
    bytes.set(file.nameBytes, offset + 46)
    offset += 46 + file.nameBytes.length
  }

  writeU32(view, offset, 0x06054b50)
  writeU16(view, offset + 4, 0)
  writeU16(view, offset + 6, 0)
  writeU16(view, offset + 8, encoded.length)
  writeU16(view, offset + 10, encoded.length)
  writeU32(view, offset + 12, offset - centralStart)
  writeU32(view, offset + 16, centralStart)
  writeU16(view, offset + 20, 0)
  return buffer
}
