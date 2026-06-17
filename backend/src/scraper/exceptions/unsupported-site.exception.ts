import { BadRequestException } from '@nestjs/common';

export class UnsupportedSiteException extends BadRequestException {
  constructor(hostname: string) {
    super(
      `Site "${hostname}" is not supported. Supported: amazon.com, aliexpress.com, ebay.com`,
    );
  }
}
