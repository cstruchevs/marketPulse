import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getDatabaseConfig = (config: ConfigService): TypeOrmModuleOptions => {
  const isProd = config.get('NODE_ENV') === 'production';

  return {
    type: 'postgres',
    url: config.get<string>('DATABASE_URL'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: false,
    synchronize: false,
    logging: isProd ? ['error'] : ['query', 'error'],
    ssl: isProd ? { rejectUnauthorized: false } : false,
  };
};
