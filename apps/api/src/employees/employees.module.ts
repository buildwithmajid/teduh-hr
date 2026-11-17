import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { EmployeesController, SalaryComponentsController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { SalaryComponentsService } from './salary-components.service';

@Module({
  imports: [OrganizationModule],
  controllers: [EmployeesController, SalaryComponentsController],
  providers: [EmployeesService, SalaryComponentsService],
})
export class EmployeesModule {}
