const { withDangerousMod, withXcodeProject, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const IOS_HEADER_FILE = "ICloudBackupExclusion.h";
const IOS_IMPL_FILE = "ICloudBackupExclusion.m";

/**
 * Expo config plugin that adds a native iOS module to exclude files from iCloud backup.
 *
 * This plugin:
 * 1. Copies native Objective-C source files from plugins/ to the ios/ project
 * 2. Registers them with the Xcode project so they're compiled
 * 3. Works with Expo CNG - ios/ is regeneratable and not committed to git
 *
 * Usage:
 * Add to app.config.ts:
 *   import withExcludeFromBackup from './plugins/excludeFromBackup/withExcludeFromBackup';
 *
 *   export default {
 *     plugins: [
 *       withExcludeFromBackup,
 *       // ... other plugins
 *     ]
 *   }
 */
const withExcludeFromBackup = (config) => {
  // Step 1: Copy native source files into ios/ project
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosRoot = path.join(projectRoot, "ios");
      const projectName = config.modRequest.projectName || "SideShelf";

      // Source: our native files in the repo
      const pluginSourceDir = path.join(projectRoot, "plugins", "excludeFromBackup", "ios");

      // Target: ios/<AppName>/Modules/
      const modulesDir = path.join(iosRoot, projectName, "Modules");
      if (!fs.existsSync(modulesDir)) {
        fs.mkdirSync(modulesDir, { recursive: true });
      }

      // Copy header file
      const headerSource = path.join(pluginSourceDir, IOS_HEADER_FILE);
      const headerTarget = path.join(modulesDir, IOS_HEADER_FILE);
      fs.copyFileSync(headerSource, headerTarget);

      // Copy implementation file
      const implSource = path.join(pluginSourceDir, IOS_IMPL_FILE);
      const implTarget = path.join(modulesDir, IOS_IMPL_FILE);
      fs.copyFileSync(implSource, implTarget);

      return config;
    },
  ]);

  // Step 2: Add files to Xcode project so they're compiled
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName || "SideShelf";

    // The relative path from the ios/ directory to our module files
    const headerFilePath = `${projectName}/Modules/${IOS_HEADER_FILE}`;
    const implFilePath = `${projectName}/Modules/${IOS_IMPL_FILE}`;

    // Group name is the directory containing the files
    const groupName = `${projectName}/Modules`;

    // Add header file to project (check first to avoid duplicates on re-runs)
    if (!project.hasFile(headerFilePath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: headerFilePath,
        groupName: groupName,
        project: project,
      });
    }

    // Add implementation file to project (this also adds to compile sources)
    if (!project.hasFile(implFilePath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: implFilePath,
        groupName: groupName,
        project: project,
      });
    }

    return config;
  });

  return config;
};

module.exports = withExcludeFromBackup;
