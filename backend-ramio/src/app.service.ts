import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}
  async getHello(): Promise<string> {
    const users = await this.prisma.user.findMany();
    return `Hello World! ${users.length}`;
    return 'Hello World!';
  }
}
