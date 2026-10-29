import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/net/api_error.dart';
import 'package:nirapod/features/chat/chat_screen.dart';

import '../helpers.dart';
import '../phase2/home_test.dart' show phase2Overrides, pump;

final t0 = DateTime.utc(2026, 10, 27, 13, 50);

class FakeChat implements ChatRepo {
  FakeChat({this.child = false});
  final bool child;
  ChatConversation? conv;
  final sent = <String>[];
  String? rated;

  @override
  Future<ChatConversation?> current() async {
    if (child) throw ApiError(ApiErrorKind.forbidden, code: 'FORBIDDEN', status: 403);
    return conv;
  }

  @override
  Future<ChatConversation> send(String body, {bool priority = false}) async {
    sent.add(body);
    conv = ChatConversation(id: 'c1', status: 'ai', messages: [
      ...?conv?.messages,
      ChatMessage(id: 'u${sent.length}', sender: 'user', body: body, at: t0),
      ChatMessage(id: 'a${sent.length}', sender: 'ai', body: 'Open Family, then Add child.', at: t0),
    ]);
    return conv!;
  }

  @override
  Future<ChatConversation> sendImage(Uint8List jpeg) async => conv!;
  @override
  Future<ChatConversation> escalate() async => conv = conv!.copyWith(status: 'needs_human');
  @override
  Future<String> close() async {
    conv = null;
    return 'c1';
  }

  @override
  Future<void> rate(String conversationId, String rating) async => rated = rating;
  @override
  Future<void> markRead() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('chat: notice + quick chips, AI reply, end and rate', (t) async {
    setScreen(t, const Size(360, 800));
    final repo = FakeChat();
    await pump(t, const ChatScreen(), [...await phase2Overrides(), chatRepoProvider.overrideWithValue(repo)]);
    expect(find.text('Nirapod Assistant (AI)'), findsOneWidget);
    expect(find.text('Talk to a person'), findsOneWidget);
    expect(find.textContaining('Never share passwords'), findsOneWidget);
    await t.tap(find.text('How do I add a child?'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(repo.sent.single, 'How do I add a child?');
    expect(find.text('Open Family, then Add child.'), findsOneWidget);
    await t.enterText(find.byType(TextField), 'Thanks');
    await t.pump();
    await t.tap(find.bySemanticsLabel('Send'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(repo.sent.last, 'Thanks');
    await t.tap(find.byTooltip('End chat'));
    await t.pump(const Duration(milliseconds: 300));
    await t.tap(find.text('End chat').last);
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('Chat ended'), findsOneWidget);
    await t.tap(find.byKey(const Key('rate_up')));
    await t.pump();
    expect(repo.rated, 'up');
    expect(find.text('Thanks for your feedback'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('agent joined: header shows the agent; no "Talk to a person"', (t) async {
    setScreen(t, const Size(360, 800));
    final repo = FakeChat()
      ..conv = ChatConversation(id: 'c1', status: 'human', agent: const ChatAgent('Nayon', null), messages: [
        ChatMessage(id: '1', sender: 'user', body: 'Payment issue', at: t0),
        ChatMessage(id: '2', sender: 'system', body: 'Connected, Agent: Nayon', agent: const ChatAgent('Nayon', null), at: t0),
        ChatMessage(id: '3', sender: 'agent', body: 'Hi, I can help.', agent: const ChatAgent('Nayon', null), at: t0),
      ]);
    await pump(t, const ChatScreen(), [...await phase2Overrides(), chatRepoProvider.overrideWithValue(repo)]);
    expect(find.text('Agent: Nayon'), findsOneWidget);
    expect(find.text('Connected, Agent: Nayon'), findsOneWidget);
    expect(find.text('Talk to a person'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('child phone: ask your parent', (t) async {
    setScreen(t, const Size(360, 800));
    await pump(t, const ChatScreen(), [...await phase2Overrides(), chatRepoProvider.overrideWithValue(FakeChat(child: true))]);
    expect(find.text('Ask your parent for help'), findsOneWidget);
  });
}
