# Android app (Trusted Web Activity)

A PWA cannot produce an APK by itself. To publish ShopiGo on Google Play, wrap the
live site in a Trusted Web Activity with Google's Bubblewrap:

```bash
npm i -g @bubblewrap/cli
# edit twa-manifest.json: packageId, host, icon URLs (your HTTPS domain)
bubblewrap init --manifest https://shop.example.com/manifest.webmanifest   # or: bubblewrap update
bubblewrap build        # → app-release-signed.apk + app-release-bundle.aab (upload the .aab to Play)
bubblewrap fingerprint list
```

Then in **Admin → Settings → PWA / App** enter the Android package name and the
SHA-256 signing fingerprint (Play Console → App integrity). ShopiGo serves
`/.well-known/assetlinks.json` from those values so the app opens full-screen
without the browser bar.
