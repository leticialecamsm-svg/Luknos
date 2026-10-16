import { describe, expect, it, vi } from 'vitest'
import { randomBytes, createHash } from 'crypto'

const uploaded: Buffer[] = []
const ranges: string[] = []
vi.mock('@/lib/google-drive', () => ({
  driveRootFolderId: () => 'root',
  findOrCreateFolder: async (name: string) => ({ id: `f-${name}`, created: false }),
  uploadFile: async () => ({ id: 'x', webViewLink: '' }),
  trashFile: async () => {},
  driveUpdateMeta: async () => {},
  driveResumableStart: async () => 'https://upload',
  driveResumablePut: async (_u: string, chunk: Uint8Array, start: number, total: number | null) => {
    uploaded.push(Buffer.from(chunk)); ranges.push(`${start}+${chunk.length}/${total ?? '*'}`)
    return total === null ? null : { id: 'drive-1', webViewLink: 'https://drive/1' }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      upsert: async () => ({}),
    }),
  }),
}))

import { streamEvolutionMediaToDrive } from './crm-media'

function streamOf(text: string, piece = 65_537): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let i = 0
  return new ReadableStream({ pull(c) { if (i >= bytes.length) { c.close(); return } c.enqueue(bytes.subarray(i, i + piece)); i += piece } })
}

describe('streamEvolutionMediaToDrive', () => {
  it('reconstrói o arquivo em partes de 8 MB, idêntico ao original', async () => {
    const file = randomBytes(20 * 1024 * 1024 + 123)
    const json = `{"mediaType":"documentMessage","fileName":"planta.dwg","size":{"fileLength":"1"},"mimetype":"image/vnd.dwg","base64":"${file.toString('base64')}","x":1}`
    const r = await streamEvolutionMediaToDrive(streamOf(json), { fallbackName: 'arquivo' })
    const got = Buffer.concat(uploaded)
    expect(got.length).toBe(file.length)
    expect(createHash('sha256').update(got).digest('hex')).toBe(createHash('sha256').update(file).digest('hex'))
    expect(ranges.slice(0, -1).every((x) => x.endsWith('/*') && x.includes(`+${8 * 1024 * 1024}/`))).toBe(true)
    expect(ranges.at(-1)).toMatch(new RegExp(`/${file.length}$`))
    expect(r).toMatchObject({ driveFileId: 'drive-1', size: file.length, mimeType: 'image/vnd.dwg', fileName: 'planta.dwg' })
  })

  it('erro da Evolution vira mensagem clara', async () => {
    await expect(streamEvolutionMediaToDrive(streamOf('{"status":400,"error":"Message not found"}'), { fallbackName: 'a' })).rejects.toThrow('Message not found')
  })
})
