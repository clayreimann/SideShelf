//
//  ICloudBackupExclusion.m
//  SideShelf
//
//  Native module to exclude files from iCloud backup
//

#import "ICloudBackupExclusion.h"

@implementation ICloudBackupExclusion

RCT_EXPORT_MODULE(ICloudBackupExclusion);

/**
 * Sets the do not back up attribute on a file or directory
 * @param filePath The file path to exclude from backup
 * @param resolve Promise resolve callback
 * @param reject Promise reject callback
 */
RCT_EXPORT_METHOD(setExcludeFromBackup:(NSString *)filePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *fileURL = [NSURL fileURLWithPath:filePath];
  NSError *error = nil;

  BOOL success = [fileURL setResourceValue:@YES
                                    forKey:NSURLIsExcludedFromBackupKey
                                     error:&error];

  if (success) {
    resolve(@{@"success": @YES, @"path": filePath});
  } else {
    NSString *errorMessage = error ? error.localizedDescription : @"Failed to set exclude from backup attribute";
    reject(@"EXCLUDE_FROM_BACKUP_FAILED", errorMessage, error);
  }
}

/**
 * Checks if a file or directory is excluded from backup
 * @param filePath The file path to check
 * @param resolve Promise resolve callback
 * @param reject Promise reject callback
 */
RCT_EXPORT_METHOD(isExcludedFromBackup:(NSString *)filePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *fileURL = [NSURL fileURLWithPath:filePath];
  NSError *error = nil;
  NSNumber *isExcluded = nil;

  BOOL success = [fileURL getResourceValue:&isExcluded
                                    forKey:NSURLIsExcludedFromBackupKey
                                     error:&error];

  if (success) {
    resolve(@{@"excluded": isExcluded ?: @NO, @"path": filePath});
  } else {
    NSString *errorMessage = error ? error.localizedDescription : @"Failed to check backup exclusion status";
    reject(@"CHECK_BACKUP_STATUS_FAILED", errorMessage, error);
  }
}

// Ensure the module is available to React Native
+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
