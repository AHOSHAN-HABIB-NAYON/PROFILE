import 'package:flutter/widgets.dart';

/// Light confetti burst for "You're all set" (1.5 s, time-based, reduce motion: nothing).
/// PLACEHOLDER (Lead): draws nothing. The Design agent replaces the implementation; the API stays.
class ConfettiBurst extends StatelessWidget {
  const ConfettiBurst({super.key, this.play = true});
  final bool play;

  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}
