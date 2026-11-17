import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { FieldCrypto } from './field-crypto';

@Global()
@Module({
  providers: [
    {
      provide: FieldCrypto,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new FieldCrypto(config.encryptionKeys, config.hmacKey),
    },
  ],
  exports: [FieldCrypto],
})
export class CryptoModule {}
