import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Terjemahkan error Prisma yang umum menjadi respons HTTP yang jelas. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | string | undefined) ?? 'data';
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `Data dengan nilai ${Array.isArray(target) ? target.join(', ') : target} sudah ada`,
          error: 'Conflict',
        });
        return;
      }
      case 'P2025':
        res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Data tidak ditemukan', error: 'Not Found' });
        return;
      case 'P2003':
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'Data masih direferensikan atau referensi tidak valid',
          error: 'Conflict',
        });
        return;
      default:
        this.logger.error(`Prisma error ${exception.code}`, exception.stack);
        res.status(500).json({ statusCode: 500, message: 'Terjadi kesalahan pada server' });
    }
  }
}
