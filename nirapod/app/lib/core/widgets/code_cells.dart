import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';

/// Characters allowed in family/child codes: uppercase letters and digits without ambiguous ones (0 O 1 I L).
const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/// Six code cells with auto-advance, backspace to the previous cell and paste of the whole code.
/// Cells ALWAYS stay left-to-right with Latin digits, also in Arabic and Urdu.
/// [alphanumeric] = family codes (A-Z without ambiguous letters + 2-9); otherwise digits only (OTP).
class CodeCells extends StatefulWidget {
  const CodeCells({
    super.key,
    required this.onCompleted,
    this.onChanged,
    this.length = 6,
    this.alphanumeric = false,
    this.error = false,
    this.enabled = true,
    this.cellLabel,
    this.autofocus = true,
  });

  final ValueChanged<String> onCompleted;
  final ValueChanged<String>? onChanged;
  final int length;
  final bool alphanumeric;
  final bool error;
  final bool enabled;
  final bool autofocus;

  /// TalkBack label per cell, e.g. (n) => 'Digit $n of 6'.
  final String Function(int n)? cellLabel;

  @override
  State<CodeCells> createState() => CodeCellsState();
}

class CodeCellsState extends State<CodeCells> {
  late final List<TextEditingController> _c = List.generate(widget.length, (_) => TextEditingController());
  late final List<FocusNode> _f = List.generate(widget.length, (_) => FocusNode());

  String get value => _c.map((c) => c.text).join();

  /// Clears all cells (e.g. after a wrong code) and focuses the first.
  void clear() {
    for (final c in _c) {
      c.clear();
    }
    _f.first.requestFocus();
    widget.onChanged?.call('');
  }

  @override
  void dispose() {
    for (final c in _c) {
      c.dispose();
    }
    for (final f in _f) {
      f.dispose();
    }
    super.dispose();
  }

  String _normalize(String raw) {
    final up = raw.toUpperCase();
    final allowed = widget.alphanumeric ? codeAlphabet : '0123456789';
    return up.split('').where(allowed.contains).join();
  }

  void _onChanged(int i, String raw) {
    final v = _normalize(raw);
    if (v.length > 1) {
      // Paste (or fast typing): spread across cells starting at i.
      for (var k = 0; k < v.length && i + k < widget.length; k++) {
        _c[i + k].text = v[k];
      }
      final next = (i + v.length).clamp(0, widget.length - 1);
      _f[next].requestFocus();
    } else {
      _c[i].text = v;
      _c[i].selection = TextSelection.collapsed(offset: v.length);
      if (v.isNotEmpty && i < widget.length - 1) _f[i + 1].requestFocus();
    }
    final code = value;
    widget.onChanged?.call(code);
    if (code.length == widget.length) {
      _f.last.unfocus();
      widget.onCompleted(code);
    }
  }

  KeyEventResult _onKey(int i, KeyEvent e) {
    if (e is KeyDownEvent && e.logicalKey == LogicalKeyboardKey.backspace && _c[i].text.isEmpty && i > 0) {
      _c[i - 1].clear();
      _f[i - 1].requestFocus();
      widget.onChanged?.call(value);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Directionality(
      textDirection: TextDirection.ltr,
      child: AutofillGroup(
        child: Row(
          children: [
            for (var i = 0; i < widget.length; i++) ...[
              if (i > 0) const SizedBox(width: Space.xs),
              Expanded(
                child: Semantics(
                  label: widget.cellLabel?.call(i + 1),
                  textField: true,
                  child: Focus(
                    onKeyEvent: (_, e) => _onKey(i, e),
                    child: AspectRatio(
                      aspectRatio: 0.9,
                      child: TextField(
                        controller: _c[i],
                        focusNode: _f[i],
                        enabled: widget.enabled,
                        autofocus: widget.autofocus && i == 0,
                        textAlign: TextAlign.center,
                        textAlignVertical: TextAlignVertical.center,
                        expands: true,
                        maxLines: null,
                        keyboardType: widget.alphanumeric ? TextInputType.visiblePassword : TextInputType.number,
                        textCapitalization: TextCapitalization.characters,
                        autofillHints: i == 0 && !widget.alphanumeric ? const [AutofillHints.oneTimeCode] : null,
                        style: t.headlineSmall!.copyWith(fontFamily: 'Noto Sans', fontWeight: FontWeight.w600),
                        onChanged: (v) => _onChanged(i, v),
                        decoration: InputDecoration(
                          contentPadding: EdgeInsets.zero,
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(Radii.inputLarge),
                            borderSide: BorderSide(
                              color: widget.error ? c.danger : c.inputBorder,
                              width: widget.error ? 1.5 : 1,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(Radii.inputLarge),
                            borderSide: BorderSide(color: widget.error ? c.danger : c.primary, width: 2),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
