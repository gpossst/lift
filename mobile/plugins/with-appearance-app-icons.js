const fs = require('node:fs/promises');
const path = require('node:path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('@expo/config-plugins');

// Light/yellow is the primary icon; the other combinations are alternates.
const alternateIcons = ['light-red', 'light-blue', 'dark-yellow', 'dark-red', 'dark-blue'];

module.exports = function withAppearanceAppIcons(config) {
  config = withDangerousMod(config, ['ios', async (config) => {
    const { projectRoot, platformProjectRoot, projectName } = config.modRequest;
    for (const variant of alternateIcons) {
      const name = `Lift-${variant}`;
      const directory = path.join(platformProjectRoot, projectName, 'Images.xcassets', `${name}.appiconset`);
      await fs.mkdir(directory, { recursive: true });
      await fs.copyFile(path.join(projectRoot, 'assets/app-icons', `${variant}.png`), path.join(directory, 'icon.png'));
      await fs.writeFile(path.join(directory, 'Contents.json'), JSON.stringify({
        images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
        info: { version: 1, author: 'expo' },
      }, null, 2));
    }
    return config;
  }]);

  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { target } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName: config.modRequest.projectName });
    const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(project, target.buildConfigurationList);
    for (const [, configuration] of configurations) {
      configuration.buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = `"${alternateIcons.map((variant) => `Lift-${variant}`).join(' ')}"`;
    }
    return config;
  });
};
