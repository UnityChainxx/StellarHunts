import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { LinkWalletDto } from './dto/link-wallet.dto';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  // Relies on the global validation pipe (issue #340).
  create(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile' })
  // Relies on the global validation pipe (issue #340).
  updateProfile(
    @Body() dto: UpdateUserProfileDto,
    @Param('id') /* or use custom decorator to get id */ id: string,
  ) {
    return this.userService.updateProfile(id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('link-wallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link or update wallet address' })
  linkWallet(
    @Body(new ValidationPipe({ whitelist: true })) dto: LinkWalletDto,
    @Request() req,
  ) {
    return this.userService.linkWallet(req.user.id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('link-wallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlink wallet address' })
  unlinkWallet(@Request() req) {
    return this.userService.unlinkWallet(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  getById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }
}
