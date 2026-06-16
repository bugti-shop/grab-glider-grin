# =============================================================================
# Paste these blocks into ios/App/Podfile to make the privacy-manifest fix
# survive every `pod install` — no Capacitor upgrade required.
# =============================================================================

# 1) Pin the three Google pods to the FIRST versions that ship with their own
#    PrivacyInfo.xcprivacy. These minor bumps are ABI-safe for Capacitor 5/6.
#    Place these inside your `target 'App' do` block.
#
#   pod 'GoogleSignIn',      '~> 7.1'      # ships PrivacyInfo since 7.1.0
#   pod 'GTMSessionFetcher', '~> 3.4'      # ships PrivacyInfo since 3.4.0
#   pod 'GTMAppAuth',        '~> 4.1'      # ships PrivacyInfo since 4.1.0

# 2) Post-install hook — guarantees a PrivacyInfo.xcprivacy is embedded in each
#    framework even if a transitive dep drags an older version back in.
#    Paste at the bottom of the Podfile, MERGING with any existing post_install.

post_install do |installer|
  require 'fileutils'

  privacy_root = File.expand_path('../../ios-privacy-patches', __dir__)

  manifests = {
    'GoogleSignIn'      => 'PrivacyInfo-GoogleSignIn.xcprivacy',
    'GTMSessionFetcher' => 'PrivacyInfo-GTMSessionFetcher.xcprivacy',
    'GTMAppAuth'        => 'PrivacyInfo-GTMAppAuth.xcprivacy',
  }

  installer.pods_project.targets.each do |target|
    next unless manifests.key?(target.name)
    src = File.join(privacy_root, manifests[target.name])
    next unless File.exist?(src)

    pod_dir = File.join(installer.sandbox.root, target.name)
    dst = File.join(pod_dir, 'PrivacyInfo.xcprivacy')
    FileUtils.cp(src, dst) unless File.exist?(dst)

    # Add the file to the pod target's resources build phase if missing.
    file_ref = installer.pods_project.new_file(dst)
    target.resources_build_phase.add_file_reference(file_ref, true) rescue nil
    puts "🔒 Embedded PrivacyInfo.xcprivacy into #{target.name}"
  end

  # Standard Capacitor deployment-target alignment (keep if you already have it)
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.0'
    end
  end
end
