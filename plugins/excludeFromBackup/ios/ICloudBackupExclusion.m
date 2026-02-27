//
//  ICloudBackupExclusion.m
//  SideShelf
//
//  Native module to exclude files from iCloud backup
//

#import "ICloudBackupExclusion.h"
#include <sys/xattr.h>

@implementation ICloudBackupExclusion

RCT_EXPORT_MODULE(ICloudBackupExclusion);

/**
 * Convert a file path (either a POSIX path or a file:// URL string) to a POSIX path.
 *
 * The TypeScript normalizePath() already strips "file://" without decoding before
 * calling native. This helper mirrors that behaviour as a safety net for any caller
 * that passes a raw file:// URL directly.
 *
 * IMPORTANT: do NOT call stringByRemovingPercentEncoding. Files are saved on disk
 * by the background downloader using the percent-encoded URI path as a POSIX path
 * (e.g. "Book%20Title.m4b" is the literal filename). Decoding would produce the
 * wrong POSIX path and cause ENOENT.
 */
static NSString *toPosixPath(NSString *filePath) {
  if ([filePath hasPrefix:@"file://"]) {
    return [filePath substringFromIndex:7];
  }
  return filePath;
}

/**
 * Sets the do not back up attribute on a file or directory using setxattr.
 *
 * Uses setxattr("com.apple.MobileBackup") directly instead of the NSURL
 * setResourceValue:forKey:NSURLIsExcludedFromBackupKey: API because [NSURL fileURLWithPath:]
 * leaves bracket characters (e.g. "[B0FBJ2WFHK]") unencoded in the URL, which is
 * invalid per RFC 3986 and causes setResourceValue to fail with "file doesn't exist"
 * even when the file is physically present. fileSystemRepresentation bypasses URL
 * encoding entirely and operates on raw filesystem bytes.
 *
 * @param filePath The file path (POSIX path or file:// URL) to exclude from backup
 * @param resolve Promise resolve callback
 * @param reject Promise reject callback
 */
RCT_EXPORT_METHOD(setExcludeFromBackup:(NSString *)filePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSString *posixPath = toPosixPath(filePath);
  if (!posixPath || posixPath.length == 0) {
    reject(@"INVALID_PATH", @"Could not resolve file path", nil);
    return;
  }

  const char *cPath = [posixPath fileSystemRepresentation];
  const char *attrName = "com.apple.MobileBackup";
  uint8_t attrValue = 1;

  int result = setxattr(cPath, attrName, &attrValue, sizeof(attrValue), 0, 0);

  if (result == 0) {
    resolve(@{@"success": @YES, @"path": filePath});
  } else {
    NSString *errorMessage = [NSString stringWithFormat:@"Failed to exclude from backup: %s",
                              strerror(errno)];
    NSError *error = [NSError errorWithDomain:NSPOSIXErrorDomain
                                        code:errno
                                    userInfo:nil];
    reject(@"EXCLUDE_FROM_BACKUP_FAILED", errorMessage, error);
  }
}

/**
 * Checks if a file or directory is excluded from backup using getxattr.
 *
 * @param filePath The file path (POSIX path or file:// URL) to check
 * @param resolve Promise resolve callback
 * @param reject Promise reject callback
 */
RCT_EXPORT_METHOD(isExcludedFromBackup:(NSString *)filePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSString *posixPath = toPosixPath(filePath);
  if (!posixPath || posixPath.length == 0) {
    reject(@"INVALID_PATH", @"Could not resolve file path", nil);
    return;
  }

  const char *cPath = [posixPath fileSystemRepresentation];
  const char *attrName = "com.apple.MobileBackup";
  uint8_t attrValue = 0;

  ssize_t result = getxattr(cPath, attrName, &attrValue, sizeof(attrValue), 0, 0);

  // result > 0: attribute exists and was read; attrValue != 0: exclusion is active
  BOOL isExcluded = (result > 0 && attrValue != 0);
  resolve(@{@"excluded": @(isExcluded), @"path": filePath});
}

// Ensure the module is available to React Native
+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
