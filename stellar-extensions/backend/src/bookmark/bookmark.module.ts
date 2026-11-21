import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../../../../backend/src/admin/admin-auth.module';
import { BookmarkFolderController } from './bookmark-folder.controller';
import { BookmarkController } from './bookmark.controller';
import { BookmarkService } from './bookmark.service';
import { BookmarkFolder } from './entities/bookmark-folder.entity';
import { PuzzleBookmark } from './entities/puzzle-bookmark.entity';
import { SharedBookmarkController } from './shared-bookmark.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PuzzleBookmark, BookmarkFolder]),
    AdminAuthModule,
  ],
  controllers: [
    BookmarkController,
    BookmarkFolderController,
    SharedBookmarkController,
  ],
  providers: [BookmarkService],
  exports: [BookmarkService],
})
export class BookmarkModule {}
