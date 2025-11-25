import {
  ConfigPlugin,
  withDangerousMod,
  withMainApplication,
  withXcodeProject,
} from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

const IOS_HEADER_FILE = "ABSPlayerEventBridge.m"; // Obj-C interface
const IOS_IMPL_FILE = "ABSPlayerEventBridge.swift"; // Swift implementation

const ANDROID_MODULE_FILE = "ABSPlayerEventBridgeModule.kt";
const ANDROID_PACKAGE_FILE = "ABSPlayerEventBridgePackage.kt";

const withNativeEventBridge: ConfigPlugin = (config) => {
  // 1. iOS: Copy files and add to Xcode project
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest?.projectRoot;
      if (!projectRoot) {
        console.warn("[withNativeEventBridge] projectRoot is undefined, skipping iOS setup");
        return config;
      }
      const iosRoot = path.join(projectRoot, "ios");
      const projectName = config.modRequest?.projectName || "SideShelf";

      const pluginSourceDir = path.join(projectRoot, "plugins", "nativeEventBridge", "ios");

      const modulesDir = path.join(iosRoot, projectName, "Modules");
      if (!fs.existsSync(modulesDir)) {
        fs.mkdirSync(modulesDir, { recursive: true });
      }

      fs.copyFileSync(
        path.join(pluginSourceDir, IOS_HEADER_FILE),
        path.join(modulesDir, IOS_HEADER_FILE)
      );
      fs.copyFileSync(
        path.join(pluginSourceDir, IOS_IMPL_FILE),
        path.join(modulesDir, IOS_IMPL_FILE)
      );

      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName || "SideShelf";
    const moduleRelativePath = `${projectName}/Modules`;
    const target = project.getFirstTarget();

    if (target) {
      project.addSourceFile(
        `${moduleRelativePath}/${IOS_HEADER_FILE}`,
        { target: target.uuid },
        projectName
      );
      project.addSourceFile(
        `${moduleRelativePath}/${IOS_IMPL_FILE}`,
        { target: target.uuid },
        projectName
      );
    }
    return config;
  });

  // 2. Android: Copy files and register package
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidRoot = path.join(projectRoot, "android");
      const packageName = "cloud.madtown.sideshelf"; // Hardcoded for now, could extract from config
      const packagePath = packageName.replace(/\./g, "/");

      const pluginSourceDir = path.join(projectRoot, "plugins", "nativeEventBridge", "android");

      const targetDir = path.join(
        androidRoot,
        "app",
        "src",
        "main",
        "java",
        packagePath,
        "Modules"
      );

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.copyFileSync(
        path.join(pluginSourceDir, ANDROID_MODULE_FILE),
        path.join(targetDir, ANDROID_MODULE_FILE)
      );
      fs.copyFileSync(
        path.join(pluginSourceDir, ANDROID_PACKAGE_FILE),
        path.join(targetDir, ANDROID_PACKAGE_FILE)
      );

      return config;
    },
  ]);

  config = withMainApplication(config, (config) => {
    const contents = config.modResults.contents;
    const packageName = "cloud.madtown.sideshelf";
    const importLine = `import ${packageName}.Modules.ABSPlayerEventBridgePackage`;
    const packageLine = `add(ABSPlayerEventBridgePackage())`;

    if (!contents.includes(importLine)) {
      // Add import
      const packageImport = `package ${packageName}`;
      config.modResults.contents = contents.replace(
        packageImport,
        `${packageImport}\n${importLine}`
      );
    }

    if (!config.modResults.contents.includes(packageLine)) {
      // Add package to list
      // Look for: PackageList(this).packages.apply {
      const anchor = "PackageList(this).packages.apply {";
      config.modResults.contents = config.modResults.contents.replace(
        anchor,
        `${anchor}\n              ${packageLine}`
      );
    }

    return config;
  });

  return config;
};

export default withNativeEventBridge;
