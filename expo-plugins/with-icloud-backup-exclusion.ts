import {
  ConfigPlugin,
  withDangerousMod,
  IOSConfig,
} from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

/**
 * Expo config plugin that adds a native iOS module to exclude files from iCloud backup
 */
const withICloudBackupExclusion: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosRoot = path.join(projectRoot, "ios");
      const projectName = config.modRequest.projectName || "SideShelf";

      // Create the modules directory if it doesn't exist
      const modulesDir = path.join(iosRoot, projectName, "Modules");
      if (!fs.existsSync(modulesDir)) {
        fs.mkdirSync(modulesDir, { recursive: true });
      }

      // Write the Objective-C header file
      const headerContent = `//
//  ICloudBackupExclusion.h
//  ${projectName}
//
//  Native module to exclude files from iCloud backup
//

#import <Foundation/Foundation.h>
#import <ExpoModulesCore/ExpoModulesCore.h>

@interface ICloudBackupExclusion : NSObject

@end
`;

      fs.writeFileSync(
        path.join(modulesDir, "ICloudBackupExclusion.h"),
        headerContent
      );

      // Write the Objective-C implementation file
      const implementationContent = `//
//  ICloudBackupExclusion.m
//  ${projectName}
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
`;

      fs.writeFileSync(
        path.join(modulesDir, "ICloudBackupExclusion.m"),
        implementationContent
      );

      // Create a bridging header if needed (for projects that might mix Swift/ObjC)
      const bridgingHeaderPath = path.join(
        iosRoot,
        projectName,
        `${projectName}-Bridging-Header.h`
      );
      if (!fs.existsSync(bridgingHeaderPath)) {
        const bridgingHeaderContent = `//
//  ${projectName}-Bridging-Header.h
//  ${projectName}
//
//  Use this file to import your target's public headers that you would like to expose to Swift.
//

#import "Modules/ICloudBackupExclusion.h"
`;
        fs.writeFileSync(bridgingHeaderPath, bridgingHeaderContent);
      }

      return config;
    },
  ]);
};

export default withICloudBackupExclusion;
