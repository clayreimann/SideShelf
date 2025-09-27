import { ConfigPlugin, withXcodeProject } from "@expo/config-plugins";

const withOnlyActiveArch: ConfigPlugin = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;

    // Find the Debug build configuration
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const configItem = configurations[key];
      if (
        typeof configItem !== "string" &&
        configItem.buildSettings &&
        configItem.name === "Debug"
      ) {
        configItem.buildSettings["ONLY_ACTIVE_ARCH"] = "YES";
      }
    }

    return config;
  });
};

export default withOnlyActiveArch;
