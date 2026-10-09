/**
 * Latest Android build published by CI (GitHub release "app-latest" carries a version.json).
 * Lets the app offer an update automatically, without changing settings in the admin panel.
 */
export class AppReleaseFeed {
  latest: { versionCode: number; versionName: string } | null = null;

  constructor(
    private readonly feedUrl: string | null,
    readonly downloadUrl: string,
  ) {}

  async refresh() {
    if (!this.feedUrl) return;
    const res = await fetch(this.feedUrl, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return;
    const j = (await res.json()) as { versionCode?: unknown; versionName?: unknown };
    const code = Number(j.versionCode);
    if (Number.isInteger(code) && code > 0) this.latest = { versionCode: code, versionName: String(j.versionName ?? '') };
  }
}
