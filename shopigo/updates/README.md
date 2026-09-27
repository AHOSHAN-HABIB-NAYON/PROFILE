# updates/

Build output for **signed update packages** (`npm run package:update`). Package archives are git-ignored.

Each package contains:

```
manifest.json   name, version, releaseDate, minVersion, changelog[], migrations[], files{path: sha256}
manifest.sig    base64 Ed25519 signature of manifest.json
release/        complete application code (never .env, storage/ or uploads/)
```

Installed stores never read this folder over HTTP: packages are uploaded through
Admin → System → Updates (Super Admin) or downloaded from the HTTPS feed, then
verified and staged in `storage/updates/` (outside the web root). See ../DEPLOYMENT.md §5.
