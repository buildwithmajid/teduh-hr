import { Module } from '@nestjs/common';
import { AttendanceController, HolidaysController, ShiftsController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  controllers: [AttendanceController, ShiftsController, HolidaysController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
