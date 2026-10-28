class ButtonSpec {
  const ButtonSpec(this.label, this.to);
  final String label;

  /// `<screen id>` | `sheet:<id>` | `dialog:<id>` | `back` | `close` | `system:<what>` | `action:<what>`
  final String to;
}

class ScreenSpec {
  const ScreenSpec({
    required this.id,
    required this.path,
    required this.title,
    required this.phase,
    required this.roles,
    required this.languageSelector,
    required this.adultShell,
    required this.buttons,
  });

  final String id;
  final String path;
  final String title;
  final int phase;
  final List<String> roles;
  final bool languageSelector;
  final bool adultShell;
  final List<ButtonSpec> buttons;
}

class OverlaySpec {
  const OverlaySpec({required this.id, required this.kind, required this.title, required this.buttons});
  final String id;
  final String kind;
  final String title;
  final List<ButtonSpec> buttons;
}
