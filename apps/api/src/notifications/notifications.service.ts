import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  linkUrl?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Tx, input: NotificationInput) {
    return tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        linkUrl: input.linkUrl ?? null,
      },
    });
  }

  async createMany(tx: Tx, inputs: NotificationInput[]) {
    if (inputs.length === 0) return;
    await tx.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        title: i.title,
        message: i.message,
        linkUrl: i.linkUrl ?? null,
      })),
    });
  }

  async listForUser(userId: string) {
    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { items, unreadCount };
  }

  async markRead(userId: string, id: string) {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    if (res.count === 0) throw new NotFoundException('Notifikasi tidak ditemukan');
    return { id, isRead: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { ok: true };
  }
}
