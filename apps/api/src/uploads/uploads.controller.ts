import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { mkdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { AuthUser, CurrentUser } from '../common/auth-context';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const SAFE_KEY_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function detectFileType(buf: Buffer): { ext: 'jpg' | 'png' | 'webp' | 'pdf'; mime: string } | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  // PDF: %PDF-
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  return null;
}

@Controller('uploads')
export class UploadsController {
  private readonly baseDir = path.join(process.cwd(), 'uploads');

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async upload(
    @CurrentUser() u: AuthUser,
    @UploadedFile() file?: { buffer: Buffer; originalname: string; size: number },
  ) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('File bukti tidak ditemukan');
    }
    const detected = detectFileType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Format file harus JPG, PNG, WebP, atau PDF (maks. 5 MB)');
    }

    const companyDir = path.join(this.baseDir, u.companyId);
    await mkdir(companyDir, { recursive: true });
    const key = `${randomUUID()}.${detected.ext}`;
    await writeFile(path.join(companyDir, key), file.buffer);

    return {
      key,
      originalName: file.originalname,
      mimeType: detected.mime,
      size: file.size,
    };
  }

  @Get(':key')
  async download(@CurrentUser() u: AuthUser, @Param('key') key: string, @Res() res: Response) {
    if (!SAFE_KEY_RE.test(key)) {
      throw new BadRequestException('Nama file tidak valid');
    }
    const fullPath = path.join(this.baseDir, u.companyId, key);
    let data: Buffer;
    try {
      data = await readFile(fullPath);
    } catch {
      throw new NotFoundException('File lampiran tidak ditemukan');
    }
    const ext = key.split('.').pop()?.toLowerCase() ?? 'bin';
    res.setHeader('Content-Type', MIME_BY_EXT[ext] ?? 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${key}"`);
    res.send(data);
  }
}
