Pod::Spec.new do |s|
  s.name = 'AppearanceAppIcon'
  s.version = '1.0.0'
  s.summary = 'Match the LIFT app icon to its appearance.'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'LIFT'
  s.homepage = 'https://lift.garrett.one'
  s.source = { git: '' }
  s.platform = :ios, '17.0'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
