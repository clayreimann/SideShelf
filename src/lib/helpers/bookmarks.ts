import { formatTime } from "@/lib/helpers/formatters";

type BookmarkTitleParams = {
  chapterTitle?: string | null;
  position: number;
};

export function getAutoBookmarkTitle({ chapterTitle, position }: BookmarkTitleParams): string {
  const formattedTime = formatTime(position);
  if (chapterTitle) {
    return `${chapterTitle} \u2014 ${formattedTime}`;
  }
  return `Bookmark at ${formattedTime}`;
}
