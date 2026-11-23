import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth-context';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.notifications.listForUser(u.userId);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(u.userId, id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() u: AuthUser) {
    return this.notifications.markAllRead(u.userId);
  }
}
