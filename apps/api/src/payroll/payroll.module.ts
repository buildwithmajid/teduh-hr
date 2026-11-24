import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { RateRepository } from './rates/rate.repository';

@Module({
  controllers: [PayrollController],
  providers: [RateRepository, PayrollService],
  exports: [RateRepository, PayrollService],
})
export class PayrollModule {}
