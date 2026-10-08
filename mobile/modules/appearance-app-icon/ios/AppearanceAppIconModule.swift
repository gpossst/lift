import ExpoModulesCore
import UIKit

public class AppearanceAppIconModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppearanceAppIcon")

    AsyncFunction("setIcon") { (iconName: String?, promise: Promise) in
      let app = UIApplication.shared
      guard app.supportsAlternateIcons else {
        promise.reject("ERR_APP_ICON_UNSUPPORTED", "Alternate app icons are unavailable.")
        return
      }
      guard app.alternateIconName != iconName else {
        promise.resolve()
        return
      }
      guard app.applicationState == .active else {
        promise.reject("ERR_APP_ICON_INACTIVE", "The app must be active to change its icon.")
        return
      }
      app.setAlternateIconName(iconName) { error in
        if let error {
          #if targetEnvironment(simulator)
          let nativeError = error as NSError
          if nativeError.domain == NSPOSIXErrorDomain && nativeError.code == 35 {
            promise.reject("ERR_APP_ICON_SIMULATOR_UNAVAILABLE", "The simulator's icon service is unavailable.")
            return
          }
          #endif
          promise.reject("ERR_APP_ICON_CHANGE", error.localizedDescription)
        } else {
          promise.resolve()
        }
      }
    }.runOnQueue(.main)
  }
}
