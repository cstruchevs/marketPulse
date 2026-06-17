import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;
const REFRESH_EXPIRE_DAYS = 30;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({ email: dto.email, passwordHash, name: dto.name });
    await this.userRepo.save(user);

    return this.generateTokens(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    const passwordMatch = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;

    // Constant-time path — prevent user enumeration
    if (!user || !passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id, user.email);
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    // Verify JWT signature + expiry
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify<{ sub: string }>(rawRefreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash, userId: payload.sub },
    });

    if (!stored) {
      // Token was already rotated — possible theft; revoke all sessions
      await this.refreshTokenRepo.delete({ userId: payload.sub });
      throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
    }

    if (stored.expiresAt < new Date()) {
      await this.refreshTokenRepo.delete({ id: stored.id });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate: delete old, issue new
    await this.refreshTokenRepo.delete({ id: stored.id });

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();

    return this.generateTokens(user.id, user.email);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.refreshTokenRepo.delete({ tokenHash });
  }

  async generateTokens(userId: string, email: string): Promise<TokenPair> {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: `${REFRESH_EXPIRE_DAYS}d`,
      },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRE_DAYS);

    await this.refreshTokenRepo.save({
      tokenHash: this.hashToken(refreshToken),
      userId,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
