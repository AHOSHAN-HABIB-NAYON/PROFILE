import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/nav/adult_shell.dart';

import '../phase2/home_test.dart' show parent;
import 'safety_test.dart' show pumpRouted;

void main() {
  testWidgets('adult shell: the bottom bar stays small and Home content shows (inside the real app)', (t) async {
    await pumpRouted(t, 'home', user: parent);
    expect(t.getSize(find.byType(BottomBar)).height, lessThan(120));
    expect(find.text('Family members'), findsOneWidget);
  });
}
