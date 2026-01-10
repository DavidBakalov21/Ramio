import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
constructor(private readonly authService: AuthService) {}

  @Public()
    @Get('login/google')
  loginGoogle(@Res() res: Response) {
    const url = this.authService.buildAuthorizeUrl({
      identityProvider: 'Google',
    });
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
  logout(@Res() res: Response) {
    this.authService.clearAuthCookies(res);
    return res.json({ message: 'Logged out successfully' });
    }

  @Public()
    @Post('/refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    await this.authService.refreshTokens(req, res);
    return res.json({ message: 'Tokens refreshed successfully' });
  }

  @Public()
  @Post('/register')
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    await this.authService.registerWithPassword(dto.email, dto.password, res);
    // Return success - frontend will call /me to get user info
    return res.json({ message: 'Registration successful' });
  }

  @Public()
  @Post('/login')
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    await this.authService.loginWithPassword(dto.email, dto.password, res);
    // Return success - frontend will call /me to get user info
    return res.json({ message: 'Login successful' });
  }

  @Post('/set-password')
  async setPassword(@Req() req: Request, @Body() dto: SetPasswordDto) {
    const user = (req as any).user;
    if (!user?.cognitoSub) {
      throw new BadRequestException('User not authenticated');
    }

    await this.authService.setPasswordForUser(user.cognitoSub, dto.password);
    return { message: 'Password set successfully' };
    }
}
