import { BadRequestException, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('login/google')
  async loginGoogle(@Res() res: Response) {
    const url = await this.authService.buildAuthorizeUrl({ identityProvider: 'Google' });
    return res.redirect(url);
  }
  
  @Public()
  @Get('/callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) throw new BadRequestException('Missing ?code');

    const redirectTo = await this.authService.handleCallback(code, res);
    return res.redirect(redirectTo);
  }

  @Post('/logout')
  async logout() {
    return { message: 'Logout' };
  }

  @Public()
  @Post('/refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    await this.authService.refreshTokens(req, res);
   
    return res.json({ message: 'Tokens refreshed successfully' });
  }
}
