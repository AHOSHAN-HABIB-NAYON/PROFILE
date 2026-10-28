/// Converts ASCII digits to the numbering system of the selected language.
/// Code cells (join codes, OTPs) must NOT use this: they always keep left-to-right Latin digits.
String localizeDigits(String input, String numerals) {
  final zero = switch (numerals) {
    'beng' => 0x09E6, // ০
    'arab' => 0x0660, // ٠
    'arabext' => 0x06F0, // ۰
    'deva' => 0x0966, // ०
    _ => null,
  };
  if (zero == null) return input;
  final b = StringBuffer();
  for (final r in input.runes) {
    if (r >= 0x30 && r <= 0x39) {
      b.writeCharCode(zero + (r - 0x30));
    } else {
      b.writeCharCode(r);
    }
  }
  return b.toString();
}

/// Converts any supported native digits back to ASCII (for parsing user input).
String asciiDigits(String input) {
  const zeros = [0x09E6, 0x0660, 0x06F0, 0x0966];
  final b = StringBuffer();
  for (final r in input.runes) {
    final z = zeros.firstWhere((z) => r >= z && r <= z + 9, orElse: () => -1);
    b.writeCharCode(z == -1 ? r : 0x30 + (r - z));
  }
  return b.toString();
}
